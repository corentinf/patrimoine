'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { formatCurrency, amountColor, accountTypeConfig, getAccountLinkUrl } from '@/app/lib/utils';
import { useGlobalFilter } from '@/app/lib/globalFilter';
import { idxAtOrBefore, isoDate } from '@/app/lib/investmentRange';
import { usePrivacy } from '@/app/lib/privacy';
import { buildMilestones, type Milestone, type ProjectionRow, type ScenarioKey } from '@/app/lib/projection';
import NetWorthChart from '../networth/NetWorthChart';
import ProjectionCard from './ProjectionCard';
import { AccountModal, InstitutionLogo, type SidebarAccount } from '../../components/AccountsPanel';

const ACCOUNT_TYPE_ORDER = ['checking', 'savings', 'investment', 'credit'];

type AccountGroup = 'cash' | 'investment' | 'retirement' | 'credit';

// Sync source is fully determined by the id prefix sync.ts assigns (see
// app/lib/sync.ts) — sfin_ for SimpleFIN, manual_ for hand-entered balances
// (401k/HSA/etc — accounts.balance is set once and never refreshed by
// "Sync now"), everything else is a raw Plaid account_id.
function accountSource(id: string): string {
  if (id.startsWith('sfin_')) return 'SimpleFIN';
  if (id.startsWith('manual_')) return 'Manual';
  return 'Plaid';
}

function compactTarget(target: number): string {
  if (target >= 1_000_000) return `$${target / 1_000_000}M`;
  return `$${target / 1000}K`;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function InfoTooltip({ text, align = 'center' }: { text: string; align?: 'center' | 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const translateX = align === 'left' ? 'left-0 -translate-x-0' : align === 'right' ? 'right-0 translate-x-0' : 'left-1/2 -translate-x-1/2';
  const arrowX = align === 'left' ? 'left-4' : align === 'right' ? 'right-4' : 'left-1/2 -translate-x-1/2';
  return (
    <span className="relative group/tip inline-flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center"
      >
        <svg className="w-3 h-3 text-ink-300 group-hover/tip:text-ink-500 transition-colors cursor-default flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-4M12 8h.01" />
        </svg>
      </button>
      <span className={`pointer-events-none absolute bottom-full ${translateX} mb-2 w-56 bg-ink-800 text-white text-xs rounded-lg px-3 py-2 leading-relaxed transition-opacity z-50 shadow-lg ${open ? 'opacity-100' : 'opacity-0'} md:group-hover/tip:opacity-100`}>
        {text}
        <span className={`absolute top-full ${arrowX} border-4 border-transparent border-t-ink-800`} />
      </span>
    </span>
  );
}

interface Snapshot {
  snapshot_date: string;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
  breakdown?: Record<string, number> | null;
}

interface HomeViewProps {
  history: Snapshot[]; // ascending by snapshot_date
  currentNetWorth: number;
  trackingStartDate: string | null;
  totalAssets: number;
  totalLiabilities: number;
  assetsCount: number;
  liabilitiesCount: number;
  availableNetWorth: number;
  retirementBalance: number;
  accounts: SidebarAccount[];
  monthlyGrowthRate: number | null;
  assetsGrowthRate: number | null;
  liabilitiesGrowthRate: number | null;
}

export default function HomeView({
  history,
  currentNetWorth,
  trackingStartDate,
  totalAssets,
  totalLiabilities,
  assetsCount,
  liabilitiesCount,
  availableNetWorth,
  retirementBalance,
  accounts,
  monthlyGrowthRate,
  assetsGrowthRate,
  liabilitiesGrowthRate,
}: HomeViewProps) {
  const { resolvedRange, rangeLabel } = useGlobalFilter();
  // Not otherwise used here — but subscribing is what makes this component
  // re-render (and every formatCurrency() call below re-check demo mode)
  // when the toggle in Header/Profile changes it.
  usePrivacy();
  const todayIso = isoDate(new Date());
  const router = useRouter();
  const [modalAccount, setModalAccount] = useState<SidebarAccount | null | undefined>(undefined);
  const [metric, setMetric] = useState<'total' | 'available' | 'retirement'>('total');
  // 0 = current value ("Today"), 1..n = activeMilestones[idx - 1].
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectMetric = (m: typeof metric) => { setMetric(m); setSelectedIdx(0); };

  // AI-generated projection: fetched from cache on mount (free — GET never
  // calls the model), only regenerated on an explicit user click (POST).
  const [projection, setProjection] = useState<ProjectionRow | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioKey>('regular');
  const [projectionLoading, setProjectionLoading] = useState(false);
  const [projectionError, setProjectionError] = useState('');

  useEffect(() => {
    fetch('/api/networth/projection')
      .then((r) => r.json())
      .then((d) => { if (d.projection) setProjection(d.projection); })
      .catch(() => {});
  }, []);

  async function regenerateProjection() {
    setProjectionLoading(true);
    setProjectionError('');
    try {
      const res = await fetch('/api/networth/projection', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.projection) setProjection(data.projection);
      else setProjectionError(data.error || 'Failed to generate projection');
    } catch {
      setProjectionError('Failed to generate projection');
    } finally {
      setProjectionLoading(false);
    }
  }

  // Whichever scenario is selected drives both the chart's dashed Projected
  // line and every milestone ETA below — falls back to the simple recent-
  // trend average (server-computed) until a projection has been generated.
  const scenario = projection?.scenarios[selectedScenario];
  const effectiveNetWorthDelta = scenario ? scenario.monthlyNetWorthDelta : monthlyGrowthRate;
  const effectiveAssetsDelta = scenario ? scenario.monthlyAssetsDelta : assetsGrowthRate;
  const effectiveLiabilitiesDelta = scenario ? scenario.monthlyLiabilitiesDelta : liabilitiesGrowthRate;

  // We don't track available/retirement balances historically (only total
  // net worth snapshots), so approximate each track's growth rate as its
  // current share of the overall trend — same convention as before, just
  // fed by whichever growth rate (AI scenario or fallback) is active.
  const availableGrowthRate = effectiveNetWorthDelta !== null && currentNetWorth !== 0
    ? effectiveNetWorthDelta * (availableNetWorth / currentNetWorth) : null;
  const retirementGrowthRate = effectiveNetWorthDelta !== null && currentNetWorth !== 0
    ? effectiveNetWorthDelta * (retirementBalance / currentNetWorth) : null;

  const milestones = useMemo(() => buildMilestones(currentNetWorth, effectiveNetWorthDelta), [currentNetWorth, effectiveNetWorthDelta]);
  const availableMilestones = useMemo(() => buildMilestones(availableNetWorth, availableGrowthRate), [availableNetWorth, availableGrowthRate]);
  const retirementMilestones = useMemo(() => buildMilestones(retirementBalance, retirementGrowthRate), [retirementBalance, retirementGrowthRate]);

  const metricConfig = {
    total: { label: 'Total', icon: '💰', value: currentNetWorth, milestones },
    available: { label: 'Available', icon: '💵', value: availableNetWorth, milestones: availableMilestones },
    retirement: { label: 'Retirement', icon: '🔒', value: retirementBalance, milestones: retirementMilestones },
  } as const;
  const active = metricConfig[metric];
  const selectedMilestone = selectedIdx > 0 ? (active.milestones[selectedIdx - 1] ?? null) : null;

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

  // Per-account balance history, reconstructed the same way as the Investment
  // page's getInvestmentData() (app/(dashboard)/networth/page.tsx): each
  // net-worth snapshot's `breakdown` jsonb stores every account's balance that
  // day, keyed "<institution> — <name>" (see captureNetWorthSnapshot in
  // lib/sync.ts) — forward-fill across the full history so accounts that sync
  // less often (manual 401k/HSA) don't drop out between updates.
  const accountKey = (a: SidebarAccount) => `${a.institution} — ${a.name}`;

  // Same 401k/IRA/HSA name-matching convention already used for retirementBalance
  // in page.tsx and for the Investment page's own group toggle
  // (InvestmentProgress.tsx's isRetirementAccount) — retirement takes priority
  // over account_type since a 401k/HSA is still stored as an ordinary account row.
  const isRetirementAccount = (a: SidebarAccount) =>
    /401k|\bira\b|hsa/i.test(a.name) || /401k|\bira\b|hsa/i.test(a.institution || '');

  const accountMeta = useMemo(() => {
    const instCounts = new Map<string, number>();
    for (const a of accounts) instCounts.set(a.institution, (instCounts.get(a.institution) ?? 0) + 1);
    return accounts.map((a) => {
      const dup = (instCounts.get(a.institution) ?? 0) > 1;
      const label = dup
        ? `${a.institution}${a.mask ? ` ••••${a.mask}` : a.name ? ` · ${a.name}` : ''}`
        : (a.institution || a.name);
      const group: AccountGroup = isRetirementAccount(a)
        ? 'retirement'
        : a.account_type === 'credit'
        ? 'credit'
        : a.account_type === 'investment'
        ? 'investment'
        : 'cash';
      return { id: a.id, label, currentValue: Number(a.balance), key: accountKey(a), group };
    });
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

    // Forward-filled per-account values aligned to the full (unfiltered) history,
    // then looked up per plotted date below — a gap in one account's breakdown
    // (e.g. a manual balance untouched for weeks) carries the last known value
    // forward instead of dropping out of its curve.
    const dateIndex = new Map(dates.map((d, i) => [d, i]));
    const accountValues = new Map<string, (number | null)[]>();
    for (const meta of accountMeta) {
      const values: (number | null)[] = new Array(history.length).fill(null);
      let last: number | null = null;
      history.forEach((s, i) => {
        const b = s.breakdown ?? {};
        if (meta.key in b) last = Number(b[meta.key]);
        values[i] = last;
      });
      accountValues.set(meta.id, values);
    }

    const points: Array<{
      date: string;
      month: string;
      netWorth?: number;
      assets?: number;
      liabilities?: number;
      projected?: number;
      projectedAssets?: number;
      projectedLiabilities?: number;
    } & Record<`acct_${string}`, number | undefined>> = plotted.map((s) => {
      const idx = dateIndex.get(s.snapshot_date);
      const acctFields: Record<`acct_${string}`, number | undefined> = {};
      for (const meta of accountMeta) {
        const v = idx !== undefined ? accountValues.get(meta.id)![idx] : null;
        if (v !== null) acctFields[`acct_${meta.id}`] = v;
      }
      return {
        date: s.snapshot_date,
        month: format(new Date(s.snapshot_date + 'T12:00:00'), longRange ? 'MMM yy' : 'MMM d'),
        netWorth: Math.round(Number(s.net_worth)),
        assets: Math.round(Number(s.total_assets)),
        liabilities: Math.round(Number(s.total_liabilities)),
        ...acctFields,
      };
    });

    // Reflect the live balance (not the last daily snapshot) whenever the
    // selected window reaches today, so the chart's endpoint matches the
    // headline figures exactly — and so the projected lines below pick up
    // from exactly where the actual lines end, with no visual jump.
    if (includesToday && points.length > 0) {
      const liveAcctFields: Record<`acct_${string}`, number> = {};
      for (const meta of accountMeta) liveAcctFields[`acct_${meta.id}`] = meta.currentValue;
      points[points.length - 1] = {
        ...points[points.length - 1],
        netWorth: Math.round(currentNetWorth),
        assets: Math.round(totalAssets),
        liabilities: Math.round(totalLiabilities),
        ...liveAcctFields,
      };
    }

    // Project forward from today using the same monthly growth rate the
    // milestone ETAs use (the selected AI scenario, or the fallback trend
    // average), so the two stay consistent with each other.
    const PROJECTION_MONTHS = 6;
    if (includesToday && points.length > 0 && effectiveNetWorthDelta !== null && effectiveNetWorthDelta > 0) {
      const last = points[points.length - 1];
      points[points.length - 1] = {
        ...last,
        projected: last.netWorth,
        projectedAssets: last.assets,
        projectedLiabilities: last.liabilities,
      };
      for (let i = 1; i <= PROJECTION_MONTHS; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() + i);
        points.push({
          date: isoDate(d),
          month: format(d, 'MMM yy'),
          projected: Math.round(currentNetWorth + effectiveNetWorthDelta * i),
          projectedAssets: effectiveAssetsDelta !== null ? Math.max(0, Math.round(totalAssets + effectiveAssetsDelta * i)) : undefined,
          projectedLiabilities: effectiveLiabilitiesDelta !== null ? Math.max(0, Math.round(totalLiabilities + effectiveLiabilitiesDelta * i)) : undefined,
        });
      }
    }

    const end = includesToday ? currentNetWorth : (endIdx >= 0 ? Number(history[endIdx].net_worth) : currentNetWorth);
    const start = startIdx >= 0 ? Number(history[startIdx].net_worth) : (filtered[0] ? Number(filtered[0].net_worth) : end);

    return {
      chartData: points,
      startValue: start,
      endValue: end,
      hasChange: startIdx >= 0 && (startIdx !== endIdx || includesToday),
    };
  }, [history, resolvedRange, todayIso, currentNetWorth, totalAssets, totalLiabilities, accountMeta, effectiveNetWorthDelta, effectiveAssetsDelta, effectiveLiabilitiesDelta]);

  const change = endValue - startValue;
  const pct = startValue !== 0 ? (change / startValue) * 100 : 0;

  // Split any bar into 💵 available vs 🔒 retirement-locked segments, scaled
  // against whatever `total` that bar represents.
  const splitPct = (total: number, available: number, retirement: number) => {
    if (retirement <= 0 || total === 0) return { availablePct: 100, retirementPct: 0 };
    const availablePct = Math.max(0, Math.min(100, (available / total) * 100));
    const retirementPct = Math.max(0, Math.min(100 - availablePct, (retirement / total) * 100));
    return { availablePct, retirementPct };
  };

  // Project the available/retirement split forward to a milestone's ETA —
  // same growth rate that drives the ETA date, split proportionally by
  // today's available-vs-retirement mix so the two figures still sum to the
  // milestone target.
  const projectSplit = (milestone: Milestone | null) => {
    if (!milestone || effectiveNetWorthDelta === null || effectiveNetWorthDelta <= 0 || currentNetWorth === 0) {
      return { available: availableNetWorth, retirement: retirementBalance };
    }
    const monthsNeeded = Math.max(0, (milestone.target - currentNetWorth) / effectiveNetWorthDelta);
    const availableShare = availableNetWorth / currentNetWorth;
    const retirementShare = retirementBalance / currentNetWorth;
    return {
      available: availableNetWorth + effectiveNetWorthDelta * monthsNeeded * availableShare,
      retirement: retirementBalance + effectiveNetWorthDelta * monthsNeeded * retirementShare,
    };
  };

  const isTotalMetric = metric === 'total';
  const selectedTotal = selectedMilestone ? selectedMilestone.target : active.value;
  const { available: selectedAvailable, retirement: selectedRetirement } = projectSplit(isTotalMetric ? selectedMilestone : null);
  const selectedSplit = splitPct(selectedTotal, selectedAvailable, selectedRetirement);
  const selectedFillPct = selectedMilestone ? selectedMilestone.pct : 100;

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
      <div className="card px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-lg text-ink-800">Net worth</h2>
          <span className="stat-label">{rangeLabel}</span>
          <span className="stat-value text-xl" data-sensitive>{formatCurrency(endValue)}</span>
        </div>
        {hasChange ? (
          <p className={`text-xs font-mono mt-1 ${amountColor(change)}`} data-sensitive>
            {change >= 0 ? '+' : ''}{formatCurrency(change)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%) over period
          </p>
        ) : trackingStartDate ? (
          <p className="text-xs text-ink-300 mt-1">Tracking since {trackingStartDate}</p>
        ) : null}
      </div>

      {/* Chart */}
      <NetWorthChart
        data={chartData}
        trackingStartDate={trackingStartDate}
        currentNetWorth={currentNetWorth}
        accounts={accountMeta}
      />

      {/* Milestones — always current, not scoped to the selected period */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider">Milestones</h3>
          {retirementBalance > 0 && (
            <InfoTooltip
              text="Track milestones for your Total net worth, Available (liquid) money, or Retirement-locked money (401k/IRA/HSA). Total bars also split 💵 available vs 🔒 retirement, projected forward to each milestone's ETA."
            />
          )}
        </div>
        <div className="card px-5 py-4 space-y-4">
          {/* Metric tabs */}
          {retirementBalance > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {(Object.keys(metricConfig) as Array<keyof typeof metricConfig>).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectMetric(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    metric === key
                      ? 'bg-ink-800 text-white'
                      : 'bg-sand-50 border border-sand-200 text-ink-500 hover:border-sand-300'
                  }`}
                >
                  {metricConfig[key].icon} {metricConfig[key].label}
                </button>
              ))}
            </div>
          )}

          {/* Selector: current value + upcoming milestones for the active metric */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedIdx(0)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedIdx === 0
                  ? 'bg-ink-800/10 text-ink-800 border border-ink-800/15'
                  : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
              }`}
            >
              Current
            </button>
            {active.milestones.map((m, i) => (
              <button
                key={m.target}
                type="button"
                onClick={() => setSelectedIdx(i + 1)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  selectedIdx === i + 1
                    ? 'bg-ink-800/10 text-ink-800 border border-ink-800/15'
                    : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
                }`}
              >
                {compactTarget(m.target)}
              </button>
            ))}
          </div>

          {/* Selected bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-sm font-medium ${selectedMilestone?.passed ? 'text-ink-400 line-through' : 'text-ink-700'}`}>
                {selectedMilestone ? formatCurrency(selectedMilestone.target) : 'Today'}
              </span>
              {selectedMilestone ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-300 font-mono">{selectedMilestone.pct.toFixed(1)}%</span>
                  {selectedMilestone.passed ? (
                    <span className="inline-flex items-center gap-1 text-xs text-accent-green font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Reached
                    </span>
                  ) : selectedMilestone.eta ? (
                    <span className="inline-flex items-center gap-1 text-xs text-ink-400">
                      ~{selectedMilestone.eta}
                      <InfoTooltip
                        align="right"
                        text="Projected from this track's own current growth rate — not scoped to whatever period you've selected up top."
                      />
                    </span>
                  ) : (
                    <span className="text-xs text-ink-300">—</span>
                  )}
                </div>
              ) : (
                <span className="text-sm font-mono text-ink-700" data-sensitive>{formatCurrency(active.value)}</span>
              )}
            </div>
            <div className="h-1.5 bg-sand-100 rounded-full overflow-hidden flex">
              {isTotalMetric ? (
                <>
                  <div className="h-full bg-accent-green transition-all" style={{ width: `${selectedSplit.availablePct}%` }} />
                  <div className="h-full bg-ink-400 transition-all" style={{ width: `${selectedSplit.retirementPct}%` }} />
                </>
              ) : (
                <div
                  className={`h-full transition-all ${metric === 'available' ? 'bg-accent-green' : 'bg-ink-400'}`}
                  style={{ width: `${selectedFillPct}%` }}
                />
              )}
            </div>
            {isTotalMetric && retirementBalance > 0 && (
              <div className="flex items-center justify-between mt-1.5 text-[11px] text-ink-400">
                <span data-sensitive>
                  💵 {selectedMilestone ? '~' : ''}{formatCurrency(selectedAvailable)} available
                </span>
                <span data-sensitive>
                  🔒 {selectedMilestone ? '~' : ''}{formatCurrency(selectedRetirement)} retirement
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Projection — AI-generated, cached, only regenerated on explicit click */}
      <ProjectionCard
        projection={projection}
        selectedScenario={selectedScenario}
        onSelectScenario={setSelectedScenario}
        onRegenerate={regenerateProjection}
        loading={projectionLoading}
        error={projectionError}
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
                    const linkUrl = getAccountLinkUrl(a.institution || a.name, a.institution_domain, a.custom_url);

                    const openAccount = () => {
                      if (linkUrl) window.open(linkUrl, '_blank', 'noopener,noreferrer');
                      else setModalAccount(a);
                    };

                    return (
                      <div
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        onClick={openAccount}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          openAccount();
                        }}
                        title={linkUrl ? `Open ${a.institution || a.name}` : undefined}
                        className="group w-full px-5 py-3 flex items-center justify-between gap-4 hover:bg-sand-50 transition-colors cursor-pointer"
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
                            {a.balance_date && (
                              <p className="text-[11px] text-ink-300 truncate">
                                {accountSource(a.id)} · Updated {timeAgo(a.balance_date)}
                              </p>
                            )}
                          </div>
                        </div>
                        {/* relative + md:absolute on the button so the edit affordance overlays
                            the value on hover instead of pushing it left of the row's true
                            right edge — the value's own right alignment stays fixed either way. */}
                        <div className="relative flex items-center gap-1.5 md:gap-0 shrink-0">
                          <span
                            className={`text-sm font-mono text-right whitespace-nowrap transition-[mask-image] duration-150 md:[mask-image:none] md:[-webkit-mask-image:none] md:group-hover:[mask-image:linear-gradient(to_right,black,black_calc(100%_-_30px),transparent_calc(100%_-_8px))] md:group-hover:[-webkit-mask-image:linear-gradient(to_right,black,black_calc(100%_-_30px),transparent_calc(100%_-_8px))] ${type === 'credit' ? 'text-accent-red' : 'text-ink-700'}`}
                            data-sensitive
                          >
                            {formatCurrency(Number(a.balance))}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setModalAccount(a); }}
                            title="Edit account"
                            className="w-6 h-6 flex items-center justify-center text-ink-300 hover:text-ink-700 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity rounded-md hover:bg-sand-100 md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
