'use client';

import { useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';
import { periodBoundaries, BOUNDARY_STYLE } from '@/app/lib/chartBoundaries';

type AccountGroup = 'cash' | 'investment' | 'retirement' | 'credit';

interface AccountMeta {
  id: string;
  label: string;
  currentValue: number;
  group: AccountGroup;
}

interface NetWorthChartProps {
  data: Array<{
    date: string;
    month: string;
    netWorth?: number;
    assets?: number;
    liabilities?: number;
    projected?: number;
    projectedAssets?: number;
    projectedLiabilities?: number;
    [acctKey: `acct_${string}`]: number | string | undefined;
  }>;
  trackingStartDate?: string | null;
  currentNetWorth?: number;
  accounts?: AccountMeta[];
}

type ChartMode = 'overview' | 'accounts';

// Same palette as the Investment page's per-account curves (InvestmentProgress.tsx)
// for visual consistency — deliberately excludes the app's green/red accents,
// which are reserved for the aggregate Assets/Liabilities lines.
const ACCOUNT_COLORS = ['#4A6FA5', '#C4983B', '#8E6BAE', '#5B8A8A', '#8A7A64', '#6B5D4A', '#A89882'];

const LONG_PRESS_MS = 500;

const GROUP_ORDER: AccountGroup[] = ['cash', 'investment', 'retirement', 'credit'];
const GROUP_LABELS: Record<AccountGroup, string> = {
  cash: 'Cash',
  investment: 'Investment',
  retirement: 'Retirement',
  credit: 'Credit',
};

function setsEqual(a: Set<string>, b: Set<string>) {
  return a.size === b.size && Array.from(a).every((x) => b.has(x));
}

// Same interaction pattern as the Investment page's account pills
// (InvestmentProgress.tsx): a plain click always replaces the whole selection
// with just this account (or, if it's already the sole active one, removes
// it) — hovering a non-active pill (desktop) or long-pressing it (touch)
// reveals a "+" to add it alongside the current selection instead of
// replacing it.
function AccountPill({
  account, active, hasSelection, highlighted, color, onSelectOnly, onDeselect, onAddToSelection, onHover,
}: {
  account: AccountMeta;
  active: boolean;
  hasSelection: boolean;
  highlighted: boolean;
  color: string;
  onSelectOnly: () => void;
  onDeselect: () => void;
  onAddToSelection: () => void;
  onHover: (hovering: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  function clearPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleTouchStart() {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onAddToSelection();
    }, LONG_PRESS_MS);
  }

  function handleClick() {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (active) onDeselect();
    else onSelectOnly();
  }

  // Only unselected pills get the + affordance — clicking an active pill's
  // body already removes it, so a dedicated × button would be redundant.
  const showAction = !active && hasSelection;
  // On hover, the trailing text fades into the + icon instead of the icon
  // sitting in an overlapping badge — keeps the pill's box completely static.
  const fade = 'linear-gradient(to right, black, black calc(100% - 30px), transparent calc(100% - 8px))';
  const maskStyle = hovered && showAction ? { maskImage: fade, WebkitMaskImage: fade } : undefined;
  const isCredit = account.group === 'credit';

  return (
    <div
      className={`relative group/acctpill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
        active ? 'bg-ink-800/10 text-ink-800' : 'bg-sand-100 text-ink-400 hover:bg-sand-200'
      } ${highlighted ? 'ring-1 ring-ink-800/25' : ''}`}
      onMouseEnter={() => { setHovered(true); onHover(true); }}
      onMouseLeave={() => { setHovered(false); onHover(false); }}
    >
      <button
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={clearPress}
        onTouchMove={clearPress}
        onTouchCancel={clearPress}
        title={`${account.label}${isCredit ? ' (credit card)' : ''}${
          active ? ' — click to remove' : hasSelection ? ' — click to switch selection to this account, hover the + to add instead' : ' — click to select'
        }`}
        className="flex items-center gap-1.5"
      >
        {/* Credit cards get a hollow ring instead of a filled dot, and their
            curve is dashed — same "this is debt, not an asset" convention as
            the Overview mode's dashed red Liabilities line. */}
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={
            isCredit
              ? { background: 'transparent', border: `1.5px solid ${active ? color : '#C9BDA8'}` }
              : { background: active ? color : '#C9BDA8' }
          }
        />
        <span className="whitespace-nowrap transition-[mask-image] duration-150" style={maskStyle}>
          {account.label}: <span data-sensitive className={isCredit ? 'text-accent-red' : undefined}>{formatCurrency(account.currentValue)}</span>
        </span>
      </button>
      {showAction && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddToSelection(); }}
          aria-label={`Add ${account.label} to selection`}
          title="Add to selection"
          className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 text-ink-800 hover:text-ink-900 opacity-0 group-hover/acctpill:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  );
}

function CustomTooltip({ active, payload, label, valueFormatter = formatCurrency }: any) {
  if (!active || !payload?.length) return null;
  const entries = payload.filter((p: any) => p.value !== undefined && p.value !== null);
  if (!entries.length) return null;
  return (
    <div className="bg-ink-800 text-white px-3 py-2.5 rounded-lg text-xs shadow-lg space-y-1">
      <p className="font-medium text-sand-300 mb-1">{label}</p>
      {entries.map((p: any) => {
        // The line colors are tuned for the light chart background — used as
        // text directly on this dark tooltip, Assets/Liabilities fall short
        // of WCAG AA contrast (~3.4:1 / 3.6:1 against bg-ink-800, need 4.5:1).
        // Swap in a lighter tint of the same hue instead.
        const colorClass = p.color === '#3D7A5F' ? 'text-green-300'
          : p.color === '#B85450' ? 'text-red-300'
          : 'text-white';
        return (
          <div key={p.dataKey} className={`flex justify-between gap-6 ${colorClass}`}>
            <span className="capitalize">{p.name}</span>
            <span className="font-mono">{valueFormatter(p.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function BlurredYTick({ x, y, payload, formatter, blurred }: any) {
  return (
    <text x={x} y={y} dy={4} fill="#8F897E" fontSize={11} textAnchor="end"
      style={blurred ? { filter: 'blur(5px)', userSelect: 'none' } : {}}>
      {formatter(payload.value)}
    </text>
  );
}

function PercentYTick({ x, y, payload }: any) {
  return (
    <text x={x} y={y} dy={4} fill="#8F897E" fontSize={11} textAnchor="end">
      {`${payload.value >= 0 ? '+' : ''}${payload.value}%`}
    </text>
  );
}

function pctFormatter(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export default function NetWorthChart({ data, trackingStartDate, currentNetWorth, accounts = [] }: NetWorthChartProps) {
  const { blurred } = usePrivacy();
  const [showProjection, setShowProjection] = useState(false);
  const [mode, setMode] = useState<ChartMode>('overview');
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(
    () => new Set(accounts.map((a) => a.id)),
  );
  // Hovering an account pill (or its curve, wired further below) highlights
  // that curve and dims the rest — same cross-highlight as the Investment
  // page's account pills/lines.
  const [hoveredAccountId, setHoveredAccountId] = useState<string | null>(null);
  // With several accounts selected at once, wildly different balances (a
  // $224k 401k next to a $0 credit card) flatten every smaller line to
  // nothing on a shared $ axis — switching to % change from the visible
  // period's start (same normalization as the Investment page's Compare
  // view) makes every curve's shape readable regardless of scale.
  const [compareMode, setCompareMode] = useState(false);
  const showSwitcher = accounts.length > 1;
  const accountColor = (id: string) => ACCOUNT_COLORS[accounts.findIndex((a) => a.id === id) % ACCOUNT_COLORS.length];
  const selectOnlyAccount = (id: string) => setSelectedAccountIds(new Set([id]));
  const deselectAccount = (id: string) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  const addAccountToSelection = (id: string) => setSelectedAccountIds((prev) => new Set(prev).add(id));

  // Group shortcuts — a fast path on top of the per-account pills below, not a
  // separate filter: picking "All" or a group just replaces the selection
  // with that group's ids, same as clicking pills individually. Mirrors the
  // Investment page's retirement/other group toggle (InvestmentProgress.tsx),
  // generalized to every account_type bucket instead of just retirement/other.
  const allIds = new Set(accounts.map((a) => a.id));
  const groupIds = new Map<AccountGroup, Set<string>>(GROUP_ORDER.map((g) => [g, new Set<string>()]));
  for (const a of accounts) groupIds.get(a.group)!.add(a.id);
  const activeGroups = GROUP_ORDER.filter((g) => (groupIds.get(g)?.size ?? 0) > 0);
  const showGroupPills = activeGroups.length > 1;
  const activeGroupKey: 'all' | AccountGroup | null = setsEqual(selectedAccountIds, allIds)
    ? 'all'
    : activeGroups.find((g) => setsEqual(selectedAccountIds, groupIds.get(g)!)) ?? null;

  if (data.length < 3) {
    return (
      <div className="card">
        <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-4">
          Net worth over time
        </h4>
        <div className="h-[260px] flex flex-col items-center justify-center gap-3 text-center">
          <svg className="w-8 h-8 text-ink-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 17l6-6 4 4 8-8" />
          </svg>
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink-600">Building your history</p>
            <p className="text-xs text-ink-400 max-w-xs">
              Your trend will appear after a few more syncs.
            </p>
          </div>
          <div className="flex gap-6 mt-1 text-xs text-ink-400">
            {trackingStartDate && (
              <div>
                <p className="text-ink-300 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Tracking since</p>
                <p className="font-medium text-ink-500">{trackingStartDate}</p>
              </div>
            )}
            {currentNetWorth !== undefined && (
              <div>
                <p className="text-ink-300 uppercase tracking-wider text-[10px] font-semibold mb-0.5">Current net worth</p>
                <p className="font-mono font-medium text-ink-600" data-sensitive>
                  {blurred ? '••••••' : `$${Math.round(currentNetWorth).toLocaleString()}`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const hasProjection = data.some((d) => d.projected !== undefined);
  const showProjectionLine = mode === 'overview' && hasProjection && showProjection;
  // Drop the future-only projected rows entirely when the toggle is off, so
  // the x-axis doesn't stay stretched out over empty months.
  const chartRows = showProjectionLine ? data : data.filter((d) => d.netWorth !== undefined);
  const boundaries = periodBoundaries(chartRows.map((d) => ({ date: d.date, label: d.month })));

  // % toggle only makes sense once there's more than one curve to compare.
  const showComparePctToggle = mode === 'accounts' && selectedAccountIds.size > 1;
  const effectiveCompare = showComparePctToggle && compareMode;

  // Normalize each selected account to % change from its own first visible
  // value (not 0 — a $0 balance can't be a % baseline) — same technique as
  // buildComparePercentSeries in lib/investmentRange.ts, applied directly to
  // the already-embedded acct_<id> fields instead of a separate values array.
  const displayRows = effectiveCompare
    ? (() => {
        const ids = Array.from(selectedAccountIds);
        const baselines = new Map<string, number>();
        for (const id of ids) {
          const firstRow = chartRows.find((r) => {
            const v = r[`acct_${id}`];
            return typeof v === 'number' && v !== 0;
          });
          if (firstRow) baselines.set(id, firstRow[`acct_${id}`] as number);
        }
        return chartRows.map((r) => {
          const pctFields: Record<string, number> = {};
          for (const id of ids) {
            const baseline = baselines.get(id);
            const v = r[`acct_${id}`];
            if (baseline && typeof v === 'number') pctFields[`pct_${id}`] = ((v - baseline) / baseline) * 100;
          }
          return { ...r, ...pctFields };
        });
      })()
    : chartRows;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider">
          Net worth over time
        </h4>
        <div className="flex items-center gap-3">
          {showSwitcher && (
            <div className="flex items-center gap-1">
              {(['overview', 'accounts'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                    mode === m ? 'bg-ink-800/10 text-ink-800 font-semibold' : 'bg-sand-100 text-ink-400 hover:bg-sand-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          {mode === 'overview' && hasProjection && (
            <button
              type="button"
              onClick={() => setShowProjection((v) => !v)}
              className="flex items-center gap-2 text-xs text-ink-400 hover:text-ink-600 transition-colors"
            >
              Projection
              <span className={`w-7 h-4 rounded-full transition-colors relative ${showProjection ? 'bg-ink-700' : 'bg-sand-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${showProjection ? 'translate-x-3' : 'translate-x-0'}`} />
              </span>
            </button>
          )}
        </div>
      </div>
      {mode === 'accounts' && accounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 mr-1">Group</span>
          <button
            type="button"
            onClick={() => setSelectedAccountIds(new Set(allIds))}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeGroupKey === 'all' ? 'bg-ink-800/10 text-ink-800 font-semibold' : 'bg-sand-100 text-ink-400 hover:bg-sand-200'
            }`}
          >
            All
          </button>
          {showGroupPills && activeGroups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setSelectedAccountIds(new Set(groupIds.get(g)))}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                activeGroupKey === g ? 'bg-ink-800/10 text-ink-800 font-semibold' : 'bg-sand-100 text-ink-400 hover:bg-sand-200'
              }`}
            >
              {GROUP_LABELS[g]}
            </button>
          ))}
        </div>
      )}
      {mode === 'accounts' && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {accounts.map((a) => (
            <AccountPill
              key={a.id}
              account={a}
              active={selectedAccountIds.has(a.id)}
              hasSelection={selectedAccountIds.size > 0}
              highlighted={hoveredAccountId === a.id}
              color={accountColor(a.id)}
              onSelectOnly={() => selectOnlyAccount(a.id)}
              onDeselect={() => deselectAccount(a.id)}
              onAddToSelection={() => addAccountToSelection(a.id)}
              onHover={(hovering) => setHoveredAccountId(hovering ? a.id : null)}
            />
          ))}
        </div>
      )}
      {showComparePctToggle && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 mr-1">View</span>
          <button
            type="button"
            onClick={() => setCompareMode(false)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              !compareMode ? 'bg-ink-800/10 text-ink-800 font-semibold' : 'bg-sand-100 text-ink-400 hover:bg-sand-200'
            }`}
          >
            Amount
          </button>
          <button
            type="button"
            onClick={() => setCompareMode(true)}
            title="Normalize every selected account to % change from the start of this period, so accounts of very different sizes stay readable on one chart."
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              compareMode ? 'bg-ink-800/10 text-ink-800 font-semibold' : 'bg-sand-100 text-ink-400 hover:bg-sand-200'
            }`}
          >
            % change
          </button>
        </div>
      )}
      {mode === 'accounts' && selectedAccountIds.size === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-xs text-ink-400">
          Select at least one account to see its balance.
        </div>
      ) : (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={displayRows} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" vertical={false} />
          {boundaries.map((b) => {
            const s = BOUNDARY_STYLE[b.kind];
            return (
              <ReferenceLine
                key={b.x}
                yAxisId="left"
                x={b.x}
                stroke={s.stroke}
                strokeWidth={s.strokeWidth}
                strokeDasharray={s.dash}
                label={{ value: b.text, position: 'insideTopLeft', fontSize: s.fontSize, fontWeight: s.fontWeight, fill: s.fill }}
              />
            );
          })}
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: '#8F897E' }}
            axisLine={{ stroke: '#E2D9CA' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          {/* Net worth and assets share a tight auto-fit left axis so day-to-day
              movement is actually visible — the previous shared 0-to-max axis
              made every line look flat since liabilities are ~200x smaller than
              net worth/assets, forcing the whole chart to scale to that max. */}
          {effectiveCompare ? (
            <YAxis yAxisId="left" axisLine={false} tickLine={false} domain={['auto', 'auto']} tick={<PercentYTick />} />
          ) : (
            <YAxis
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              domain={['auto', 'auto']}
              tick={(props) => <BlurredYTick {...props} formatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} blurred={blurred} />}
            />
          )}
          {/* Liabilities get their own right-hand axis at their own scale —
              otherwise they'd still be squashed flat near zero on the left axis. */}
          {mode === 'overview' && (
            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              domain={['auto', 'auto']}
              tick={(props) => <BlurredYTick {...props} formatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} blurred={blurred} />}
            />
          )}
          {effectiveCompare && <ReferenceLine yAxisId="left" y={0} stroke="#C9BDA8" strokeWidth={1} />}
          <Tooltip content={<CustomTooltip valueFormatter={effectiveCompare ? pctFormatter : formatCurrency} />} />
          {mode === 'accounts' ? (
            Array.from(selectedAccountIds).map((id) => {
              const acct = accounts.find((a) => a.id === id);
              const dimmed = hoveredAccountId !== null && hoveredAccountId !== id;
              const hovered = hoveredAccountId === id;
              const isCredit = acct?.group === 'credit';
              return (
                <Line
                  key={id}
                  yAxisId="left"
                  type="monotone"
                  dataKey={effectiveCompare ? `pct_${id}` : `acct_${id}`}
                  name={acct?.label ?? id}
                  stroke={accountColor(id)}
                  strokeWidth={hovered ? 3.5 : 2}
                  strokeOpacity={dimmed ? 0.3 : 1}
                  strokeDasharray={isCredit ? '5 4' : undefined}
                  dot={false}
                  connectNulls={false}
                  activeDot={{ r: 4, fill: accountColor(id) }}
                  onMouseEnter={() => setHoveredAccountId(id)}
                  onMouseLeave={() => setHoveredAccountId(null)}
                />
              );
            })
          ) : (
            <>
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="netWorth"
                name="Net worth"
                stroke="#4A443C"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#4A443C' }}
              />
              {showProjectionLine && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="projected"
                  name="Net worth (projected)"
                  stroke="#4A443C"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  strokeOpacity={0.55}
                  dot={false}
                  activeDot={{ r: 3, fill: '#4A443C' }}
                  isAnimationActive={false}
                />
              )}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="assets"
                name="Assets"
                stroke="#3D7A5F"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 3, fill: '#3D7A5F' }}
              />
              {showProjectionLine && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="projectedAssets"
                  name="Assets (projected)"
                  stroke="#3D7A5F"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                  strokeOpacity={0.55}
                  dot={false}
                  activeDot={{ r: 3, fill: '#3D7A5F' }}
                  isAnimationActive={false}
                />
              )}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="liabilities"
                name="Liabilities"
                stroke="#B85450"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 3, fill: '#B85450' }}
              />
              {showProjectionLine && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="projectedLiabilities"
                  name="Liabilities (projected)"
                  stroke="#B85450"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                  strokeOpacity={0.55}
                  dot={false}
                  activeDot={{ r: 3, fill: '#B85450' }}
                  isAnimationActive={false}
                />
              )}
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
      )}
      {mode === 'overview' && (
        <div className="flex gap-6 justify-center mt-3 text-xs text-ink-400">
          <div className="flex items-center gap-1.5">
            <span className="w-5 inline-block" style={{ borderTop: '2px solid #4A443C' }} />
            Net worth
          </div>
          {hasProjection && (
            <div className="flex items-center gap-1.5">
              <span className="w-5 inline-block" style={{ borderTop: '2px dashed #4A443C', opacity: 0.55 }} />
              Projected
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-5 inline-block" style={{ borderTop: '2px dashed #3D7A5F' }} />
            Assets
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 inline-block" style={{ borderTop: '2px dashed #B85450' }} />
            Liabilities
          </div>
        </div>
      )}
    </div>
  );
}
