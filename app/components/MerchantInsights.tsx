'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';
import { deepLinkHref } from '@/app/lib/deepLinkUrl';
import { normalizeMerchant } from '@/app/lib/merchant';

// Everything we know about a merchant, shown inside the transaction panel: all-time stats, a
// 12-month trend, rule-based insights and the most recent visits.
//
// Computed on demand by /api/merchant (never preloaded) and cached for the session, so opening
// another transaction from the same merchant is instant. Merchants are matched by normalised name
// (see lib/merchant.ts): "Trader Joe's #123 SF" and "Trader Joe's #456 Oak" are one merchant.

export interface MerchantCategory { id: string; name: string; icon: string | null; color: string | null; parent_id?: string | null }
export interface MerchantData {
  key: string;
  name: string;
  today: string;
  visits: number;
  total: number;
  avgTransaction: number;
  avgMonthly: number;
  monthsSince: number;
  firstDate: string | null;
  lastDate: string | null;
  monthly: { month: string; total: number; count: number }[];
  dots: { date: string; amount: number }[];
  recent: { id: string; date: string; amount: number; account: string }[];
  insights: string[];
  category: MerchantCategory | null;
  otherCategories: number;
  rule: { pattern: string; categoryName: string | null; categoryIcon: string | null } | null;
  categories: MerchantCategory[];
}

const cache = new Map<string, MerchantData>();

/** Merchant stats through the shared session cache. */
export async function getMerchantData(raw: string): Promise<MerchantData> {
  const key = normalizeMerchant(raw);
  const hit = cache.get(key);
  if (hit) return hit;
  const r = await fetch(`/api/merchant?name=${encodeURIComponent(raw)}`);
  const body = await r.json();
  if (!r.ok) throw new Error(body?.error ?? 'Could not load this merchant');
  cache.set(key, body);
  return body;
}

/** Drop a merchant from the cache (after its category was changed in bulk). */
export function forgetMerchant(raw: string) {
  cache.delete(normalizeMerchant(raw));
}

/** Loads (and caches) a merchant; `data` is null while loading or if the lookup failed. */
export function useMerchant(raw: string) {
  const [data, setData] = useState<MerchantData | null>(() => cache.get(normalizeMerchant(raw)) ?? null);
  const [loading, setLoading] = useState(() => !cache.has(normalizeMerchant(raw)));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const hit = cache.get(normalizeMerchant(raw));
    if (hit) { setData(hit); setLoading(false); setError(null); return; }
    setLoading(true);
    setError(null);
    getMerchantData(raw)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) { setData(null); setError(e.message); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [raw]);
  return { data, loading, error };
}

const prettyDate = (iso: string, withYear = true) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
  });

export function MerchantSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-label="Loading merchant">
      <div className="h-4 w-40 rounded bg-sand-200" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[64px] rounded-xl bg-sand-100" />)}
      </div>
      <div className="h-36 rounded-xl bg-sand-100" />
    </div>
  );
}

function StatCard({ label, value, sensitive = true }: { label: string; value: string; sensitive?: boolean }) {
  return (
    <div className="card px-3.5 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">{label}</p>
      <p className="stat-value mt-1 text-xl" {...(sensitive ? { 'data-sensitive': true } : {})}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="stat-label">{title}</h3>
      {children}
    </section>
  );
}

/** The merchant body (no header / category editor — the transaction panel supplies those). */
export default function MerchantInsights({
  data,
  comparison,
  onNavigate,
}: {
  data: MerchantData;
  /** One-line "this transaction vs your usual" note shown first. */
  comparison?: string | null;
  /** Called when a link inside leaves the panel (so it can close). */
  onNavigate?: () => void;
}) {
  usePrivacy(); // amounts are formatted at render
  const pathname = usePathname();
  const d = data;
  if (d.visits === 0) return null;

  const currentMonth = d.today.slice(0, 7);
  const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const chartData = d.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const dotData = d.dots.map((p) => ({ t: Date.parse(`${p.date}T12:00:00Z`), amount: p.amount, date: p.date }));

  // "See all transactions" opens the Spending list with this merchant in the search box. When we
  // are already on /spending a query-only link would not remount the page, so hand the target
  // over through an event the page listens for (see useDeepLink) instead of navigating.
  const seeAll = d.firstDate ? { q: d.name, from: d.firstDate, to: d.today } : null;
  const onSeeAll = (e: React.MouseEvent) => {
    if (pathname.startsWith('/spending') && seeAll) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('patrimoine:deeplink', { detail: seeAll }));
    }
    onNavigate?.();
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-ink-500">
          {d.firstDate ? (
            <>You&apos;ve spent <span data-sensitive className="font-medium text-ink-700">{formatCurrency(d.total)}</span> at {d.name} since {prettyDate(d.firstDate)}.</>
          ) : (
            <>History at {d.name}</>
          )}
        </p>
        {comparison && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-sand-100/70 px-2.5 py-2 text-xs leading-snug text-ink-600">
            <span aria-hidden className="text-accent-green">✦</span>
            <span data-sensitive>{comparison}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total spent" value={formatCurrency(d.total)} />
        <StatCard label="Avg transaction" value={formatCurrency(d.avgTransaction)} />
        <StatCard label="Visits" value={String(d.visits)} sensitive={false} />
        <StatCard label="Avg per month" value={formatCurrency(d.avgMonthly)} />
      </div>

      <Section title={d.dots.length ? 'Each visit' : 'Monthly spend · last 12 months'}>
        <div className="card px-2 pb-2 pt-3" data-sensitive>
          <div style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              {d.dots.length ? (
                <ScatterChart margin={{ top: 8, right: 14, bottom: 0, left: -6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--sand-200))" vertical={false} />
                  <XAxis
                    type="number" dataKey="t" scale="time"
                    domain={[(min: number) => min - 3 * 86_400_000, (max: number) => max + 3 * 86_400_000]}
                    tickFormatter={(t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                    tick={{ fontSize: 10, fill: 'rgb(var(--ink-300))' }} axisLine={{ stroke: 'rgb(var(--sand-300))' }} tickLine={false} tickCount={4}
                  />
                  <YAxis type="number" dataKey="amount" tick={{ fontSize: 10, fill: 'rgb(var(--ink-300))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${Math.round(v)}`} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<DotTip />} />
                  <Scatter data={dotData} fill="rgb(var(--accent-green))" />
                </ScatterChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--sand-200))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--ink-300))' }} axisLine={{ stroke: 'rgb(var(--sand-300))' }} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--ink-300))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${Math.round(v)}`} width={44} />
                  <Tooltip cursor={{ fill: 'rgb(var(--sand-200))', opacity: 0.4 }} content={<BarTip />} />
                  <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                    {chartData.map((m) => (
                      <Cell key={m.month} fill={m.month === currentMonth ? 'rgb(var(--accent-green))' : 'rgb(var(--sand-400))'} />
                    ))}
                  </Bar>
                  <ReferenceLine y={d.avgMonthly} stroke="rgb(var(--ink-300))" strokeDasharray="4 3" strokeWidth={1.25} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          <p className="px-2 pt-1 text-[11px] text-ink-300">
            {d.dots.length
              ? 'Only a short history so far — each dot is one visit.'
              : <>This month is highlighted · dashed line = your average of <span data-sensitive>{formatCurrency(d.avgMonthly)}</span>/month</>}
          </p>
        </div>
      </Section>

      {d.insights.length > 0 && (
        <Section title="Insights">
          <ul className="space-y-2">
            {d.insights.map((t) => (
              <li key={t} className="card flex gap-2.5 px-3.5 py-2.5 text-[13px] leading-snug text-ink-600">
                <span aria-hidden className="mt-px text-accent-green">✦</span>
                <span data-sensitive>{t}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recent transactions">
        <div className="card divide-y divide-sand-100 p-0">
          {d.recent.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink-700">{prettyDate(tx.date)}</p>
                <p className="truncate text-[11.5px] text-ink-300">{tx.account || '—'}</p>
              </div>
              <span className="shrink-0 font-mono text-[13px] font-medium text-ink-700" data-sensitive>{formatCurrency(tx.amount)}</span>
            </div>
          ))}
        </div>
        {d.visits > d.recent.length && seeAll && (
          <Link
            href={deepLinkHref('/spending', seeAll)}
            onClick={onSeeAll}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-green underline-offset-2 hover:underline"
          >
            See all {d.visits} transactions <span aria-hidden>→</span>
          </Link>
        )}
      </Section>
    </div>
  );
}

function BarTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload as { month: string; total: number; count: number };
  const label = new Date(`${m.month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <div className="rounded-lg bg-ink-800 px-2.5 py-1.5 text-xs text-white shadow-lg">
      <p className="font-medium">{label}</p>
      <p className="font-mono">{formatCurrency(m.total)}</p>
      <p className="text-white/70">{m.count} visit{m.count === 1 ? '' : 's'}</p>
    </div>
  );
}

function DotTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { date: string; amount: number };
  return (
    <div className="rounded-lg bg-ink-800 px-2.5 py-1.5 text-xs text-white shadow-lg">
      <p className="font-medium">{prettyDate(p.date)}</p>
      <p className="font-mono">{formatCurrency(p.amount)}</p>
    </div>
  );
}
