'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { formatCurrency, amountColor, accountTypeConfig } from '@/app/lib/utils';
import { useGlobalFilter } from '@/app/lib/globalFilter';
import { idxAtOrBefore, isoDate } from '@/app/lib/investmentRange';
import NetWorthChart from '../networth/NetWorthChart';
import { AccountModal, InstitutionLogo, type SidebarAccount } from '../../components/AccountsPanel';

const ACCOUNT_TYPE_ORDER = ['checking', 'savings', 'investment', 'credit'];

interface Snapshot {
  snapshot_date: string;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
}

interface Milestone {
  target: number;
  passed: boolean;
  pct: number;
  eta: string | null;
}

interface HomeViewProps {
  history: Snapshot[]; // ascending by snapshot_date
  currentNetWorth: number;
  trackingStartDate: string | null;
  totalAssets: number;
  totalLiabilities: number;
  assetsCount: number;
  liabilitiesCount: number;
  milestones: Milestone[];
  accounts: SidebarAccount[];
}

export default function HomeView({
  history,
  currentNetWorth,
  trackingStartDate,
  totalAssets,
  totalLiabilities,
  assetsCount,
  liabilitiesCount,
  milestones,
  accounts,
}: HomeViewProps) {
  const { resolvedRange, rangeLabel } = useGlobalFilter();
  const todayIso = isoDate(new Date());
  const router = useRouter();
  const [modalAccount, setModalAccount] = useState<SidebarAccount | null | undefined>(undefined);

  const groupedAccounts = useMemo(() => {
    const byType: Record<string, SidebarAccount[]> = {};
    for (const a of accounts) {
      const t = a.account_type || 'checking';
      (byType[t] ||= []).push(a);
    }
    return ACCOUNT_TYPE_ORDER
      .map((type) => ({ type, accounts: byType[type] ?? [] }))
      .filter((g) => g.accounts.length > 0);
  }, [accounts]);

  const { chartData, startValue, endValue, hasChange } = useMemo(() => {
    const dates = history.map((h) => h.snapshot_date);
    const startIdx = idxAtOrBefore(dates, resolvedRange.start);
    const endIdx = idxAtOrBefore(dates, resolvedRange.end);
    const includesToday = resolvedRange.end >= todayIso;

    const filtered = endIdx >= 0 ? history.slice(Math.max(startIdx, 0), endIdx + 1) : [];
    const longRange = (new Date(resolvedRange.end).getTime() - new Date(resolvedRange.start).getTime()) / 86_400_000 > 120;

    // Over a long window, plot one point per month (the last snapshot in
    // each) — daily granularity just repeats the same month/year label.
    let plotted = filtered;
    if (longRange) {
      const lastByMonth = new Map<string, Snapshot>();
      for (const s of filtered) lastByMonth.set(s.snapshot_date.slice(0, 7), s);
      plotted = Array.from(lastByMonth.values());
    }

    const points = plotted.map((s) => ({
      month: format(new Date(s.snapshot_date + 'T12:00:00'), longRange ? 'MMM yy' : 'MMM d'),
      netWorth: Math.round(Number(s.net_worth)),
      assets: Math.round(Number(s.total_assets)),
      liabilities: Math.round(Number(s.total_liabilities)),
    }));

    // Reflect the live balance (not the last daily snapshot) whenever the
    // selected window reaches today, so the chart's endpoint matches the
    // headline figure exactly.
    if (includesToday && points.length > 0) {
      points[points.length - 1] = { ...points[points.length - 1], netWorth: Math.round(currentNetWorth) };
    }

    const end = includesToday ? currentNetWorth : (endIdx >= 0 ? Number(history[endIdx].net_worth) : currentNetWorth);
    const start = startIdx >= 0 ? Number(history[startIdx].net_worth) : (filtered[0] ? Number(filtered[0].net_worth) : end);

    return {
      chartData: points,
      startValue: start,
      endValue: end,
      hasChange: startIdx >= 0 && (startIdx !== endIdx || includesToday),
    };
  }, [history, resolvedRange, todayIso, currentNetWorth]);

  const change = endValue - startValue;
  const pct = startValue !== 0 ? (change / startValue) * 100 : 0;

  return (
    <div className="space-y-5">
      {modalAccount !== undefined && (
        <AccountModal
          account={modalAccount}
          onClose={() => setModalAccount(undefined)}
          onSuccess={() => router.refresh()}
        />
      )}

      {/* Hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ink-800">Net worth</h2>
        </div>
        <div className="sm:text-right">
          <p className="stat-label">{rangeLabel}</p>
          <p className="stat-value" data-sensitive>{formatCurrency(endValue)}</p>
          {hasChange ? (
            <p className={`text-xs font-mono mt-1 ${amountColor(change)}`} data-sensitive>
              {change >= 0 ? '+' : ''}{formatCurrency(change)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%) over period
            </p>
          ) : trackingStartDate ? (
            <p className="text-xs text-ink-300 mt-1">Tracking since {trackingStartDate}</p>
          ) : null}
        </div>
      </div>

      {/* Chart */}
      <NetWorthChart
        data={chartData}
        trackingStartDate={trackingStartDate}
        currentNetWorth={currentNetWorth}
      />

      {/* Account summary — always current, not scoped to the selected period */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card px-5 py-4">
          <p className="stat-label">Assets</p>
          <p className="stat-value text-xl mt-1" data-sensitive>{formatCurrency(totalAssets)}</p>
          <p className="text-xs text-ink-300 mt-0.5">{assetsCount} account{assetsCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="card px-5 py-4">
          <p className="stat-label">Liabilities</p>
          <p className="stat-value text-xl mt-1 text-accent-red" data-sensitive>
            {totalLiabilities > 0 ? formatCurrency(totalLiabilities) : '—'}
          </p>
          <p className="text-xs text-ink-300 mt-0.5">
            {liabilitiesCount > 0 ? `${liabilitiesCount} account${liabilitiesCount !== 1 ? 's' : ''}` : 'None'}
          </p>
        </div>
        <div className="card px-5 py-4 col-span-2 sm:col-span-1">
          <p className="stat-label">Net worth</p>
          <p className="stat-value text-xl mt-1" data-sensitive>{formatCurrency(currentNetWorth)}</p>
        </div>
      </div>

      {/* Accounts — always current, not scoped to the selected period */}
      {groupedAccounts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider">Accounts</h3>
            <button
              onClick={() => setModalAccount(null)}
              className="text-xs text-ink-400 hover:text-ink-700 transition-colors"
            >
              + Add account
            </button>
          </div>
          <div className="space-y-4">
            {groupedAccounts.map(({ type, accounts: group }) => {
              const cfg = accountTypeConfig[type] ?? { label: type, icon: '💰' };
              const subtotal = group.reduce(
                (s, a) => s + (type === 'credit' ? Math.abs(Number(a.balance)) : Number(a.balance)),
                0,
              );
              return (
                <div key={type} className="card p-0 divide-y divide-sand-100 overflow-hidden">
                  <div className="px-5 py-2.5 flex items-center justify-between bg-sand-50/60">
                    <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider flex items-center gap-1.5">
                      <span>{cfg.icon}</span>
                      {cfg.label}
                    </span>
                    <span
                      className={`text-xs font-mono ${type === 'credit' ? 'text-accent-red' : 'text-ink-500'}`}
                      data-sensitive
                    >
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  {group.map((a) => {
                    const subtitleParts: string[] = [];
                    if (a.name && a.name !== a.institution) subtitleParts.push(a.name);
                    if (a.mask) subtitleParts.push(`•••• ${a.mask}`);
                    const subtitle = subtitleParts.join(' · ');
                    return (
                      <button
                        key={a.id}
                        onClick={() => setModalAccount(a)}
                        className="w-full text-left px-5 py-3 flex items-center justify-between gap-4 hover:bg-sand-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <InstitutionLogo
                            institution={a.institution || a.name}
                            institutionDomain={a.institution_domain}
                            size={32}
                          />
                          <div className="min-w-0">
                            <p className="text-sm text-ink-700 truncate">{a.institution || a.name}</p>
                            {subtitle && <p className="text-xs text-ink-300 truncate">{subtitle}</p>}
                          </div>
                        </div>
                        <span
                          className={`text-sm font-mono shrink-0 ${type === 'credit' ? 'text-accent-red' : 'text-ink-700'}`}
                          data-sensitive
                        >
                          {formatCurrency(Number(a.balance))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Milestones — projected from current trajectory, not scoped to the selected period */}
      {milestones.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-3">Milestones</h3>
          <div className="card p-0 divide-y divide-sand-100">
            {milestones.map(({ target, passed, pct: milestonePct, eta }) => (
              <div key={target} className="px-5 py-3.5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-medium ${passed ? 'text-ink-400 line-through' : 'text-ink-700'}`}>
                      {formatCurrency(target)}
                    </span>
                    <span className="text-xs text-ink-300 font-mono">{milestonePct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-sand-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${passed ? 'bg-accent-green' : 'bg-ink-400'}`}
                      style={{ width: `${milestonePct}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right w-28">
                  {passed ? (
                    <span className="inline-flex items-center gap-1 text-xs text-accent-green font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Reached
                    </span>
                  ) : eta ? (
                    <span className="text-xs text-ink-400">~{eta}</span>
                  ) : (
                    <span className="text-xs text-ink-300">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
