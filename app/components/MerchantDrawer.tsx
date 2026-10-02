'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';
import { deepLinkHref } from '@/app/lib/deepLinkUrl';
import { normalizeMerchant } from '@/app/lib/merchant';

// Click a merchant name on any transaction row → a drawer slides in from the right with that
// merchant's history. It is a drawer, not a modal: no dimming, the list stays visible and usable
// behind it. Close with ESC, the ✕ button, or by clicking anywhere outside it.
//
// Stats are fetched when you click (not preloaded) and cached for the session, so reopening the
// same merchant is instant. Merchants are matched by normalised name (see lib/merchant.ts), so
// "Trader Joe's #123 SF" and "Trader Joe's #456 Oak" are one merchant.

interface Category { id: string; name: string; icon: string | null; color: string | null; parent_id?: string | null }
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
  category: Category | null;
  otherCategories: number;
  rule: { pattern: string; categoryName: string | null; categoryIcon: string | null } | null;
  categories: Category[];
}

interface DrawerApi {
  openMerchant: (name: string) => void;
  closeMerchant: () => void;
}

const noop: DrawerApi = { openMerchant: () => {}, closeMerchant: () => {} };
const DrawerContext = createContext<DrawerApi>(noop);
export const useMerchantDrawer = () => useContext(DrawerContext);

const cache = new Map<string, MerchantData>();
const SLIDE_MS = 240;

/** Merchant stats through the shared session cache (also used by the transaction detail panel). */
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

const prettyDate = (iso: string, withYear = true) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
  });

// Muted fallback colours for the letter avatar when the merchant has no category colour.
const AVATAR_COLORS = ['#7C9A8E', '#8E9AAF', '#B08D8D', '#A596C4', '#C2A878', '#7FA5B5', '#9AA58A'];
const avatarColor = (name: string) => AVATAR_COLORS[Array.from(name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_COLORS.length];

export function MerchantDrawerProvider({ children }: { children: ReactNode }) {
  usePrivacy(); // amounts are formatted at render — keep privacy / demo mode in sync
  const router = useRouter();
  const [name, setName] = useState<string | null>(null); // the descriptor that was clicked
  const [visible, setVisible] = useState(false);          // drives the slide animation
  const [data, setData] = useState<MerchantData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const requestId = useRef(0);

  const load = useCallback((raw: string) => {
    const key = normalizeMerchant(raw);
    const hit = cache.get(key);
    if (hit) { setData(hit); setLoading(false); setError(null); return; }
    const id = ++requestId.current;
    setData(null);
    setLoading(true);
    setError(null);
    fetch(`/api/merchant?name=${encodeURIComponent(raw)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? 'Could not load this merchant');
        cache.set(key, body);
        if (id === requestId.current) setData(body);
      })
      .catch((e) => { if (id === requestId.current) setError(e.message); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, []);

  const openMerchant = useCallback((raw: string) => {
    if (!raw.trim()) return;
    setName(raw);
    load(raw);
    // two frames so the closed → open transition actually plays the first time
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, [load]);

  const closeMerchant = useCallback(() => {
    setVisible(false);
    window.setTimeout(() => setName((cur) => (visibleRef.current ? cur : null)), SLIDE_MS);
  }, []);
  // lets the delayed unmount above know whether the drawer was re-opened in the meantime
  const visibleRef = useRef(false);
  useEffect(() => { visibleRef.current = visible; }, [visible]);

  // ESC closes; so does a click anywhere outside the drawer (other than another merchant name,
  // whose own click switches the drawer to that merchant).
  useEffect(() => {
    if (!name) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMerchant(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || drawerRef.current?.contains(t) || t.closest('[data-merchant-trigger]')) return;
      closeMerchant();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [name, closeMerchant]);

  const api = useMemo<DrawerApi>(() => ({ openMerchant, closeMerchant }), [openMerchant, closeMerchant]);

  // After a bulk recategorise: drop the cache entry, reload, and refresh the page behind the drawer.
  const afterRecategorise = useCallback(() => {
    if (!name) return;
    cache.delete(normalizeMerchant(name));
    load(name);
    router.refresh();
  }, [name, load, router]);

  return (
    <DrawerContext.Provider value={api}>
      {children}
      {name && (
        <aside
          ref={drawerRef}
          role="dialog"
          aria-label="Merchant details"
          className={`glass bg-sand-50/90 fixed inset-y-0 right-0 z-[60] flex w-full flex-col border-l shadow-2xl md:w-[400px] transition-transform ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}
          style={{ transitionDuration: `${SLIDE_MS}ms`, paddingTop: 'env(safe-area-inset-top)' }}
        >
          <DrawerBody
            data={data}
            loading={loading}
            error={error}
            onClose={closeMerchant}
            onRecategorised={afterRecategorise}
          />
        </aside>
      )}
    </DrawerContext.Provider>
  );
}

// ── Body ─────────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4 p-5" aria-label="Loading merchant">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-sand-200" />
        <div className="space-y-2">
          <div className="h-4 w-40 rounded bg-sand-200" />
          <div className="h-3 w-56 rounded bg-sand-100" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[72px] rounded-xl bg-sand-100" />)}
      </div>
      <div className="h-40 rounded-xl bg-sand-100" />
      <div className="h-24 rounded-xl bg-sand-100" />
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

function DrawerBody({
  data, loading, error, onClose, onRecategorised,
}: {
  data: MerchantData | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRecategorised: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // reset the little category editor when a different merchant is shown
  useEffect(() => { setPicking(false); setCategoryId(''); setSaveMsg(null); }, [data?.key]);

  const header = (
    <div className="flex flex-none items-start justify-between gap-3 border-b border-sand-200/60 px-5 pb-3 pt-4">
      {data ? (
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-semibold text-white"
            style={{ backgroundColor: data.category?.icon ? `${data.category.color ?? '#9CA3AF'}26` : avatarColor(data.name) }}
          >
            {data.category?.icon ? data.category.icon : data.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink-800">{data.name}</h2>
            <p className="truncate text-xs text-ink-400">{data.category?.name ?? 'Uncategorized'}</p>
          </div>
        </div>
      ) : (
        <p className="stat-label pt-2">Merchant</p>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-400 transition-colors hover:bg-sand-200/60 hover:text-ink-700"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );

  if (error) {
    return (<>{header}<p className="p-5 text-sm text-ink-400">{error}</p></>);
  }
  if (loading || !data) {
    return (<>{header}<div className="min-h-0 flex-1 overflow-y-auto"><Skeleton /></div></>);
  }

  const d = data;
  const hasSpend = d.visits > 0;
  const currentMonth = d.today.slice(0, 7);
  const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const chartData = d.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const dotData = d.dots.map((p) => ({ t: Date.parse(`${p.date}T12:00:00Z`), amount: p.amount, date: p.date }));

  const topLevel = d.categories.filter((c) => !c.parent_id);
  const kidsOf = (id: string) => d.categories.filter((c) => c.parent_id === id);

  async function applyCategory() {
    if (!categoryId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch('/api/merchant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: d.name, categoryId }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error ?? 'Could not update');
      setSaveMsg(`Updated ${body.updated} transactions and saved a rule.`);
      setPicking(false);
      onRecategorised();
    } catch (e: any) {
      setSaveMsg(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {header}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {/* Headline: all-time total */}
        <div>
          <p className="stat-value text-[2.1rem] leading-none" data-sensitive>{formatCurrency(d.total)}</p>
          <p className="mt-2 text-sm text-ink-500">
            {hasSpend && d.firstDate ? (
              <>You&apos;ve spent <span data-sensitive className="font-medium text-ink-700">{formatCurrency(d.total)}</span> at {d.name} since {prettyDate(d.firstDate)}.</>
            ) : (
              <>No spending recorded at {d.name} — it may only have sent you money.</>
            )}
          </p>
        </div>

        {hasSpend && (
          <>
            {/* Key stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Total spent" value={formatCurrency(d.total)} />
              <StatCard label="Avg transaction" value={formatCurrency(d.avgTransaction)} />
              <StatCard label="Visits" value={String(d.visits)} sensitive={false} />
              <StatCard label="Avg per month" value={formatCurrency(d.avgMonthly)} />
            </div>

            {/* Trend */}
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

            {/* Smart insights */}
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

            {/* Recent transactions */}
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
              {d.visits > d.recent.length && d.firstDate && (
                <Link
                  href={deepLinkHref('/spending', { q: d.name, from: d.firstDate, to: d.today })}
                  onClick={onClose}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-green hover:underline underline-offset-2"
                >
                  See all {d.visits} transactions <span aria-hidden>→</span>
                </Link>
              )}
            </Section>
          </>
        )}

        {/* Category + rule */}
        <Section title="Category">
          <div className="card space-y-3 px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-600">
              {d.category ? (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: `${d.category.color ?? '#9CA3AF'}22`, color: d.category.color ?? undefined }}>
                  {d.category.icon} {d.category.name}
                </span>
              ) : (
                <span className="text-ink-400">Uncategorized</span>
              )}
              {d.otherCategories > 0 && <span className="text-xs text-ink-300">+{d.otherCategories} other categor{d.otherCategories === 1 ? 'y' : 'ies'} in use</span>}
            </div>

            <p className="text-xs text-ink-400">
              {d.rule ? (
                <>
                  <span className="text-accent-green">✓</span> Rule: always categorize as{' '}
                  <span className="font-medium text-ink-600">{d.rule.categoryIcon} {d.rule.categoryName ?? 'a category'}</span>
                  <span className="text-ink-300"> · matches “{d.rule.pattern}”</span>
                </>
              ) : (
                'No rule yet — changing the category below also saves one for future transactions.'
              )}
            </p>

            {picking ? (
              <div className="space-y-2">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-lg border border-sand-300 bg-white px-2.5 py-2 text-sm text-ink-700 focus:border-ink-400 focus:outline-none"
                >
                  <option value="">Choose a category…</option>
                  {topLevel.map((p) => (
                    kidsOf(p.id).length ? (
                      <optgroup key={p.id} label={`${p.icon ?? ''} ${p.name}`.trim()}>
                        <option value={p.id}>{p.icon} {p.name}</option>
                        {kidsOf(p.id).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      </optgroup>
                    ) : (
                      <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                    )
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={applyCategory}
                    disabled={!categoryId || saving}
                    className="rounded-lg bg-ink-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ink-700 disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : `Apply to all ${d.visits || ''} transactions`.replace('  ', ' ')}
                  </button>
                  <button type="button" onClick={() => setPicking(false)} className="text-xs text-ink-400 hover:text-ink-700">Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setPicking(true)} className="pill px-3.5 py-1.5 text-xs">
                Change category for all transactions
              </button>
            )}
            {saveMsg && <p className="text-xs text-ink-500">{saveMsg}</p>}
          </div>
        </Section>
      </div>
    </>
  );
}

// ── Chart tooltips ───────────────────────────────────────────────────────────

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
