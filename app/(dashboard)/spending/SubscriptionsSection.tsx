'use client';

import { useState, useMemo } from 'react';
import { formatCurrency, formatShortDate } from '@/app/lib/utils';

interface Tx {
  amount: number;
  payee: string | null;
  description: string;
  posted_at: string;
  is_transfer: boolean;
  category: { is_income: boolean } | null;
}

interface DetectedSubscription {
  merchantKey: string;
  merchantName: string;
  estimatedMonthlyCost: number;
  lastChargeDate: string;
  occurrences: number;
}

function normalizeMerchant(name: string): string {
  return name
    .replace(/\*.*$/, '')            // "Amazon Prime*A1B2C3" → "Amazon Prime"
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|www|com|net|org)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40);
}

function detectSubscriptions(transactions: Tx[]): DetectedSubscription[] {
  const expenses = transactions.filter(
    (tx) => Number(tx.amount) < 0 && !tx.is_transfer && !tx.category?.is_income,
  );

  const byMerchant = new Map<string, { displayName: string; txs: typeof expenses }>();
  for (const tx of expenses) {
    const raw = (tx.payee || tx.description || '').trim();
    if (!raw) continue;
    const key = normalizeMerchant(raw);
    if (key.length < 3) continue;
    if (!byMerchant.has(key)) byMerchant.set(key, { displayName: raw, txs: [] });
    byMerchant.get(key)!.txs.push(tx);
  }

  const results: DetectedSubscription[] = [];

  byMerchant.forEach(({ txs }, key) => {
    if (txs.length < 2) return;

    const sorted = [...txs].sort(
      (a, b) => new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime(),
    );

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(
        (new Date(sorted[i].posted_at).getTime() - new Date(sorted[i - 1].posted_at).getTime()) /
          86_400_000,
      );
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (avgGap < 20 || avgGap > 45) return;

    const amounts = sorted.map((tx) => Math.abs(Number(tx.amount)));
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const maxDev = amounts.reduce((m, a) => Math.max(m, Math.abs(a - mean)), 0);
    if (maxDev > Math.max(mean * 0.2, 1)) return;

    // Use the most recent payee as display name
    const recentTx = sorted[sorted.length - 1];
    const merchantName = recentTx.payee || recentTx.description || key;

    results.push({
      merchantKey: key,
      merchantName,
      estimatedMonthlyCost: mean,
      lastChargeDate: recentTx.posted_at,
      occurrences: sorted.length,
    });
  });

  return results.sort((a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost);
}

function HighCostWarning() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative group/warn shrink-0">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center"
      >
        <svg
          className="w-4 h-4 text-yellow-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-label="High cost — worth reviewing"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </button>
      <div className={`absolute bottom-full right-0 mb-1.5 z-10 pointer-events-none ${open ? 'block' : 'hidden'} md:group-hover/warn:block`}>
        <div className="bg-ink-800 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
          High cost — worth reviewing
          <div className="absolute top-full right-2 border-4 border-transparent border-t-ink-800" />
        </div>
      </div>
    </div>
  );
}

function isHighCost(sub: DetectedSubscription): boolean {
  if (sub.estimatedMonthlyCost <= 100) return false;
  const lower = sub.merchantName.toLowerCase();
  return !lower.includes('rent') && !lower.includes('mortgage');
}

interface Props {
  transactions: Tx[];
  initialOverrides: Record<string, 'confirmed' | 'dismissed'>;
  monthlyIncome?: number;
}

export default function SubscriptionsSection({ transactions, initialOverrides, monthlyIncome = 0 }: Props) {
  const [overrides, setOverrides] = useState<Record<string, 'confirmed' | 'dismissed'>>(initialOverrides);
  const [saving, setSaving] = useState<string | null>(null);
  const [view, setView] = useState<'monthly' | 'annual'>('monthly');

  const detected = useMemo(() => detectSubscriptions(transactions), [transactions]);

  const suggested = detected.filter((s) => !overrides[s.merchantKey]);
  const confirmed = detected.filter((s) => overrides[s.merchantKey] === 'confirmed');

  if (suggested.length === 0 && confirmed.length === 0) return null;

  const handleAction = async (merchantKey: string, status: 'confirmed' | 'dismissed' | null) => {
    const prevOverrides = overrides;
    setOverrides((prev) => {
      if (status === null) {
        const next = { ...prev };
        delete next[merchantKey];
        return next;
      }
      return { ...prev, [merchantKey]: status };
    });
    setSaving(merchantKey);
    try {
      const res = status === null
        ? await fetch('/api/subscriptions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant_key: merchantKey }),
          })
        : await fetch('/api/subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant_key: merchantKey, status }),
          });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Subscription save failed:', err);
        setOverrides(prevOverrides);
      }
    } catch (e) {
      console.error('Subscription save error:', e);
      setOverrides(prevOverrides);
    } finally {
      setSaving(null);
    }
  };

  const confirmedMonthlyTotal = confirmed.reduce((s, sub) => s + sub.estimatedMonthlyCost, 0);
  const displayCost = (monthly: number) => view === 'annual' ? monthly * 12 : monthly;
  const suffix = view === 'annual' ? '/yr' : '/mo';
  const incomePct = monthlyIncome > 0 && confirmedMonthlyTotal > 0
    ? (confirmedMonthlyTotal / monthlyIncome) * 100
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider">
          Subscriptions
        </h3>
        <div className="flex items-center gap-3">
          {confirmedMonthlyTotal > 0 && (
            <span className="text-xs text-ink-400 font-mono">
              {formatCurrency(displayCost(confirmedMonthlyTotal))}
              <span className="text-ink-300">{suffix} confirmed</span>
              {incomePct !== null && view === 'monthly' && (
                <span className="text-ink-300"> · {incomePct.toFixed(1)}% of income</span>
              )}
            </span>
          )}
          {/* Monthly / Annual toggle */}
          <div className="flex items-center rounded-lg border border-sand-200 overflow-hidden text-xs">
            <button
              onClick={() => setView('monthly')}
              className={`px-2.5 py-1 transition-colors ${view === 'monthly' ? 'bg-ink-800 text-white' : 'text-ink-400 hover:text-ink-600'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setView('annual')}
              className={`px-2.5 py-1 transition-colors ${view === 'annual' ? 'bg-ink-800 text-white' : 'text-ink-400 hover:text-ink-600'}`}
            >
              Annual
            </button>
          </div>
        </div>
      </div>

      {/* Annual summary bar */}
      {view === 'annual' && confirmedMonthlyTotal > 0 && (
        <div className="card mb-3 flex items-center justify-between py-3 px-5">
          <div>
            <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">Annual subscription cost</p>
            <p className="font-mono text-xl font-semibold text-ink-800 mt-0.5">{formatCurrency(confirmedMonthlyTotal * 12)}</p>
          </div>
          {incomePct !== null && (
            <div className="text-right">
              <p className="text-xs text-ink-400 uppercase tracking-wider font-semibold">% of monthly income</p>
              <p className="font-mono text-xl font-semibold text-ink-800 mt-0.5">{incomePct.toFixed(1)}%</p>
            </div>
          )}
        </div>
      )}

      <div className="card p-0 divide-y divide-sand-100">
        {/* Suggested — need review */}
        {suggested.map((sub) => (
          <div key={sub.merchantKey} className="px-5 py-3.5 flex items-center gap-3 bg-sand-50/60">
            <div className="w-5 h-5 rounded-full border-2 border-dashed border-sand-300 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-700 truncate">{sub.merchantName}</p>
              <p className="text-xs text-ink-300 mt-0.5">
                Last {formatShortDate(sub.lastChargeDate)} · {sub.occurrences}× this year
              </p>
            </div>
            <span className="font-mono text-sm text-ink-600 shrink-0">
              {formatCurrency(displayCost(sub.estimatedMonthlyCost))}
              <span className="text-ink-300 text-xs">{suffix}</span>
            </span>
            {isHighCost(sub) && <HighCostWarning />}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleAction(sub.merchantKey, 'confirmed')}
                disabled={saving === sub.merchantKey}
                className="text-xs px-2.5 py-1 rounded-lg bg-accent-green/10 text-accent-green font-medium hover:bg-accent-green/20 transition-colors disabled:opacity-40"
              >
                Confirm
              </button>
              <button
                onClick={() => handleAction(sub.merchantKey, 'dismissed')}
                disabled={saving === sub.merchantKey}
                className="text-xs text-ink-300 hover:text-ink-500 transition-colors disabled:opacity-40"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}

        {/* Confirmed */}
        {confirmed.map((sub) => (
          <div key={sub.merchantKey} className="px-5 py-3.5 flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-accent-green/15 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-700 truncate">{sub.merchantName}</p>
              <p className="text-xs text-ink-300 mt-0.5">
                Last {formatShortDate(sub.lastChargeDate)}
              </p>
            </div>
            <span className="font-mono text-sm text-ink-700 shrink-0">
              {formatCurrency(displayCost(sub.estimatedMonthlyCost))}
              <span className="text-ink-300 text-xs">{suffix}</span>
            </span>
            {isHighCost(sub) && <HighCostWarning />}
            <button
              onClick={() => handleAction(sub.merchantKey, null)}
              disabled={saving === sub.merchantKey}
              title="Remove"
              className="text-ink-200 hover:text-ink-400 transition-colors disabled:opacity-40 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
