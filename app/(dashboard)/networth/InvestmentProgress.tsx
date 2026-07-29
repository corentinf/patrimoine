'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AreaChart, Area, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { formatCurrency, amountColor } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';
import {
  PRESETS, isoDate, resolveStart, buildCombinedSeries, buildPerAccountSeries,
  buildComparePercentSeries, seriesChange, type RangeKey,
} from '@/app/lib/investmentRange';

type ViewMode = 'total' | 'stacked';

const VIEW_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: 'total', label: 'Total' },
  { key: 'stacked', label: 'Stacked' },
];

// Cycled per selected account so each gets a stable, distinguishable color in
// the Stacked view and Total's % overlay. Deliberately excludes the app's
// green/red accents (#3D7A5F/#B85450) — those are reserved for the $ total
// line's up/down color, and an account happening to land on the same hue
// made it disappear into the total on the chart.
const ACCOUNT_COLORS = ['#4A6FA5', '#C4983B', '#8E6BAE', '#5B8A8A', '#8A7A64', '#6B5D4A', '#A89882'];

const LONG_PRESS_MS = 500;

// Sentinel stored in hoveredAccountId when the $ total line itself (not one
// of the per-account overlays) is hovered — no real account id can collide.
const TOTAL_HOVER_ID = '__total__';

interface AccountSeries {
  id: string;
  institution: string;
  name: string;
  key: string;
  values: (number | null)[];
  currentValue: number;
  costBasis: number | null;
}

interface InvestmentProgressProps {
  dates: string[];
  accounts: AccountSeries[];
  /** ISO date bounds — when both are provided, the range is controlled by the parent
   *  (built-in preset buttons and custom inputs are hidden) instead of the internal selector. */
  rangeStart?: string;
  rangeEnd?: string;
}

interface Point { date: string; value: number }

const iso = isoDate;

// Total view's tooltip: the $ total (+ cost basis diff) as before, plus —
// when 2+ accounts are selected — each account's % change underneath, since
// the chart now overlays those as thin lines on a secondary axis.
// Hovering the axis/background (hoveredAccountId unset) shows the full
// breakdown; hovering a specific curve narrows this down to just that
// curve's value at this point, since the curve itself is already the
// highlight — the tooltip shouldn't repeat everyone else too.
function CustomTooltip({ active, payload, label, up, hoveredAccountId }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const cost = p.costBasis as number | undefined;
  const pctEntries = payload.filter((entry: any) => typeof entry.dataKey === 'string' && entry.dataKey.startsWith('pct_'));

  if (hoveredAccountId && hoveredAccountId !== TOTAL_HOVER_ID) {
    const entry = pctEntries.find((e: any) => e.dataKey === `pct_${hoveredAccountId}`);
    if (!entry) return null;
    return (
      <div className="bg-ink-800 text-white px-3 py-2 rounded-lg text-xs shadow-lg space-y-1 min-w-[120px]">
        <p className="font-medium text-sand-300">{label}</p>
        <p className="font-mono flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
          <span className="text-ink-200">{entry.name}</span>
          <span className="ml-auto">{entry.value >= 0 ? '+' : ''}{Number(entry.value).toFixed(1)}%</span>
        </p>
      </div>
    );
  }

  if (hoveredAccountId === TOTAL_HOVER_ID) {
    return (
      <div className="bg-ink-800 text-white px-3 py-2 rounded-lg text-xs shadow-lg space-y-0.5">
        <p className="font-medium text-sand-300">{label}</p>
        <p className="font-mono">{formatCurrency(p.value)}</p>
        {cost != null && (
          <p className="font-mono" style={{ color: p.value - cost >= 0 ? '#7FD1A8' : '#E89B98' }}>
            {p.value - cost >= 0 ? '+' : ''}{formatCurrency(p.value - cost)} vs cost basis
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-ink-800 text-white px-3 py-2 rounded-lg text-xs shadow-lg space-y-1 min-w-[160px]">
      <p className="font-medium text-sand-300">{label}</p>
      <p className="font-mono">{formatCurrency(p.value)}</p>
      {cost != null && (
        <p className="font-mono" style={{ color: p.value - cost >= 0 ? '#7FD1A8' : '#E89B98' }}>
          {p.value - cost >= 0 ? '+' : ''}{formatCurrency(p.value - cost)} vs cost basis
        </p>
      )}
      {pctEntries.length > 0 && (
        <div className="pt-1 mt-1 border-t border-ink-600 space-y-0.5">
          {pctEntries.map((entry: any) => (
            <p key={entry.dataKey} className="font-mono flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-ink-200">
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
                {entry.name}
              </span>
              <span>{entry.value >= 0 ? '+' : ''}{Number(entry.value).toFixed(1)}%</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function BlurredYTick({ x, y, payload, blurred }: any) {
  return (
    <text x={x} y={y} dy={4} fill="#8F897E" fontSize={11} textAnchor="end"
      style={blurred ? { filter: 'blur(5px)', userSelect: 'none' } : {}}>
      {`$${(payload.value / 1000).toFixed(0)}k`}
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

// Recharts calls a Line/Area's `label` render prop once per data point — this
// only draws at the last one, so the account name reads as a small callout
// sitting right at the end of its own curve instead of repeating at every point.
function CurveEndLabel({ x, y, index, lastIndex, text, color, anchor }: any) {
  if (index !== lastIndex) return null;
  return (
    <text
      x={anchor === 'start' ? x + 6 : x - 6}
      y={y}
      dy={anchor === 'start' ? -4 : 4}
      textAnchor={anchor === 'start' ? 'start' : 'end'}
      fontSize={11}
      fontWeight={600}
      fill={color}
    >
      {text}
    </text>
  );
}

function BuildingHistory() {
  return (
    <div className="h-[180px] flex flex-col items-center justify-center gap-2 text-center">
      <svg className="w-8 h-8 text-ink-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 17l6-6 4 4 8-8" />
      </svg>
      <p className="text-sm font-medium text-ink-600">Building your history</p>
      <p className="text-xs text-ink-400 max-w-xs">
        Your portfolio trend will appear after a few more daily syncs.
      </p>
    </div>
  );
}

// Shared tooltip for the Stacked and Compare views — one line per account
// (using the color/name Recharts already attaches to each series), plus a
// running total for Stacked so it's clear the areas add up to the combined line.
// Same axis-vs-curve distinction as CustomTooltip: hovering the background
// shows every band + the running total, hovering one band narrows it to
// just that account's value at this point.
function MultiSeriesTooltip({ active, payload, label, formatValue, showTotal, hoveredAccountId }: any) {
  if (!active || !payload?.length) return null;

  if (hoveredAccountId) {
    const entry = payload.find((p: any) => p.dataKey === hoveredAccountId);
    if (!entry) return null;
    return (
      <div className="bg-ink-800 text-white px-3 py-2 rounded-lg text-xs shadow-lg space-y-1 min-w-[120px]">
        <p className="font-medium text-sand-300">{label}</p>
        <p className="font-mono flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
          <span className="text-ink-200">{entry.name}</span>
          <span className="ml-auto">{formatValue(entry.value)}</span>
        </p>
      </div>
    );
  }

  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-ink-800 text-white px-3 py-2 rounded-lg text-xs shadow-lg space-y-1 min-w-[160px]">
      <p className="font-medium text-sand-300">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-mono flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-ink-200">
            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          {formatValue(p.value)}
        </p>
      ))}
      {showTotal && payload.length > 1 && (
        <p className="font-mono flex items-center justify-between gap-3 pt-1 border-t border-ink-600 text-sand-300">
          <span>Total</span>{formatValue(total)}
        </p>
      )}
    </div>
  );
}

// Mirrors the Spending page's CategoryPill interaction: a plain click always
// replaces the whole selection with just this account (or, if it's already
// the sole active one, removes it) — hovering a non-active pill (desktop) or
// long-pressing it (touch) reveals a "+" to add it alongside the current
// selection instead of replacing it.
function AccountPill({
  account, active, hasSelection, showColor, highlighted, color, onSelectOnly, onDeselect, onAddToSelection, onHover,
}: {
  account: AccountSeries;
  active: boolean;
  hasSelection: boolean;
  showColor: boolean;
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

  const label = account.name.length <= 24 ? account.name : account.institution;
  // Only unselected pills get the + affordance — clicking an active pill's
  // body already removes it, so a dedicated × button would be redundant.
  const showAction = !active && hasSelection;
  // On hover, the trailing text fades into the + icon instead of the icon
  // sitting in an overlapping badge — keeps the pill's box completely static.
  const fade = 'linear-gradient(to right, black, black calc(100% - 30px), transparent calc(100% - 8px))';
  const maskStyle = hovered && showAction ? { maskImage: fade, WebkitMaskImage: fade } : undefined;

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
        title={`${account.key}${account.costBasis != null ? '' : ' (no cost basis)'}${
          active ? ' — click to remove' : hasSelection ? ' — click to switch selection to this account, hover the + to add instead' : ' — click to select'
        }`}
        className="flex items-center gap-1.5"
      >
        {showColor && (
          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        )}
        <span className="whitespace-nowrap transition-[mask-image] duration-150" style={maskStyle}>
          {label}: <span data-sensitive>{formatCurrency(account.currentValue)}</span>
        </span>
      </button>
      {showAction && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddToSelection(); }}
          aria-label={`Add ${label} to selection`}
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

export default function InvestmentProgress({ dates, accounts, rangeStart, rangeEnd }: InvestmentProgressProps) {
  const { blurred } = usePrivacy();
  const controlled = rangeStart !== undefined && rangeEnd !== undefined;
  const [range, setRange] = useState<RangeKey>('30d');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(accounts.map((a) => a.id)));

  const selectedAccounts = accounts.filter((a) => selected.has(a.id));
  const liveValue = selectedAccounts.reduce((s, a) => s + a.currentValue, 0);

  // Cost basis is only meaningful when every selected account reports one
  // (i.e. brokerage holdings, not the 401k/HSA balances).
  const costBasis = selectedAccounts.length > 0 && selectedAccounts.every((a) => a.costBasis != null)
    ? selectedAccounts.reduce((s, a) => s + (a.costBasis ?? 0), 0)
    : null;

  const todayIso = iso(new Date());

  // Sum the selected accounts across the shared date axis, starting only where
  // all selected accounts have data (consistent basket — no jump when one is
  // linked later). Then reflect the live value as today's point.
  const data: Point[] = useMemo(
    () => buildCombinedSeries(dates, selectedAccounts, todayIso, liveValue),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dates, accounts, selected, todayIso, liveValue],
  );

  const firstDate = data[0]?.date ?? todayIso;
  const lastDate = data[data.length - 1]?.date ?? todayIso;

  const [customFrom, setCustomFrom] = useState(firstDate);
  const [customTo, setCustomTo] = useState(lastDate);

  const { start, end } = useMemo(() => {
    if (controlled) return { start: rangeStart!, end: rangeEnd! };
    const prevDate = data.length >= 2 ? data[data.length - 2].date : data[0]?.date;
    const start = resolveStart(range, { now: new Date(), firstDate, prevDate, customFrom });
    return { start, end: range === 'custom' ? customTo : lastDate };
  }, [controlled, rangeStart, rangeEnd, range, data, firstDate, lastDate, customFrom, customTo]);

  const baseline = useMemo(() => {
    let b: Point | null = null;
    for (const p of data) {
      if (p.date <= start) b = p;
      else break;
    }
    return b;
  }, [data, start]);

  const inRange = useMemo(
    () => data.filter((p) => p.date >= start && p.date <= end),
    [data, start, end],
  );

  // Total view overlays each account's % change (like the old Compare % view)
  // whenever 2+ accounts are selected — a map keyed by date so chartData below
  // can merge it in alongside the $ total on the same x-axis.
  const showComparePct = selectedAccounts.length > 1;
  const compareOverlay = useMemo(() => {
    if (!showComparePct) return null;
    const perAccount = buildComparePercentSeries(dates, selectedAccounts, start, todayIso);
    return new Map(perAccount.map((p) => [p.date, p]));
  }, [showComparePct, dates, selectedAccounts, start, todayIso]);

  const chartData = useMemo(() => {
    const pts = baseline && (inRange.length === 0 || inRange[0].date !== baseline.date)
      ? [baseline, ...inRange]
      : inRange;
    return pts.map((p) => {
      const overlay = compareOverlay?.get(p.date);
      const pctFields = overlay
        ? Object.fromEntries(selectedAccounts.map((a) => [`pct_${a.id}`, overlay[a.id] as number | undefined]))
        : {};
      return {
        label: format(new Date(p.date + 'T12:00:00'), 'MMM d'),
        value: Math.round(p.value),
        ...(costBasis != null ? { costBasis: Math.round(costBasis) } : {}),
        ...pctFields,
      };
    });
  }, [baseline, inRange, costBasis, compareOverlay, selectedAccounts]);

  const { startValue, endValue, change, pct } = useMemo(
    () => seriesChange(data, start, end, liveValue),
    [data, start, end, liveValue],
  );
  const up = change >= 0;

  // Stacked only makes sense with 2+ accounts on screen — fall back to Total
  // silently rather than showing a toggle with no effect.
  const [viewMode, setViewMode] = useState<ViewMode>('total');
  const effectiveView: ViewMode = selectedAccounts.length > 1 ? viewMode : 'total';
  // Hovering an account pill highlights its series in Stacked/Total's % overlay
  // — dims the rest instead of hiding them so the reader keeps the whole picture.
  const [hoveredAccountId, setHoveredAccountId] = useState<string | null>(null);
  // Indexed against the full account list (not selectedAccounts) so a given
  // account keeps the same color regardless of what else is currently toggled
  // on/off — otherwise Vanguard's dot would repaint every time the selection changed.
  const accountColor = (id: string) => {
    const idx = accounts.findIndex((a) => a.id === id);
    return ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
  };

  const stackedData = useMemo(() => {
    if (effectiveView !== 'stacked') return [];
    const perAccount = buildPerAccountSeries(dates, selectedAccounts, todayIso);
    let base: (typeof perAccount)[number] | null = null;
    for (const p of perAccount) {
      if (p.date <= start) base = p;
      else break;
    }
    const inRangePts = perAccount.filter((p) => p.date >= start && p.date <= end);
    const pts = base && (inRangePts.length === 0 || inRangePts[0].date !== base.date)
      ? [base, ...inRangePts]
      : inRangePts;
    return pts.map((p) => ({
      label: format(new Date(p.date + 'T12:00:00'), 'MMM d'),
      ...Object.fromEntries(selectedAccounts.map((a) => [a.id, Math.round(Number(p[a.id] ?? 0))])),
    }));
  }, [effectiveView, dates, selectedAccounts, todayIso, start, end]);

  function selectOnlyAccount(id: string) {
    setSelected(new Set([id]));
  }
  function deselectAccount(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }
  function addAccountToSelection(id: string) {
    setSelected((prev) => new Set(prev).add(id));
  }

  const accountLabel = (a: AccountSeries) => (a.name.length <= 24 ? a.name : a.institution);

  return (
    <div className="card space-y-5">
      {/* Header: stats left, presets right (desktop) */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">
            Progress over time
          </h4>
          <div className="mt-1.5 flex items-baseline gap-3">
            <span className={`text-2xl font-mono font-medium ${amountColor(change)}`} data-sensitive>
              {up ? '+' : ''}{formatCurrency(change)}
            </span>
            <span className={`text-sm font-mono ${amountColor(change)}`}>
              {up ? '+' : ''}{pct.toFixed(2)}%
            </span>
          </div>
          <p className="text-xs text-ink-400 mt-0.5">
            <span data-sensitive>{formatCurrency(startValue)}</span>
            {' → '}
            <span data-sensitive>{formatCurrency(endValue)}</span>
            {costBasis != null && (
              <span className="ml-2 text-ink-300">
                · cost basis <span data-sensitive>{formatCurrency(costBasis)}</span>
              </span>
            )}
          </p>
        </div>
        {/* Presets: desktop only — top-right above chart */}
        {!controlled && (
          <div className="hidden md:flex items-center gap-3 flex-shrink-0">
            {PRESETS.map((p) => (
              <button key={p.key} onClick={() => setRange(p.key)}
                className={`text-xs font-medium transition-colors ${range === p.key ? 'text-ink-800 font-semibold' : 'text-ink-400 hover:text-ink-700'}`}>
                {p.label}
              </button>
            ))}
            <button onClick={() => setRange('custom')}
              className={`text-xs font-medium transition-colors ${range === 'custom' ? 'text-ink-800 font-semibold' : 'text-ink-400 hover:text-ink-700'}`}>
              Custom
            </button>
          </div>
        )}
      </div>

      {/* Account filter — same interaction as the Spending page's category pills:
          click selects only that account, hover/long-press the + to add instead. */}
      {accounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 mr-1">Accounts</span>
          {accounts.map((a) => (
            <AccountPill
              key={a.id}
              account={a}
              active={selected.has(a.id)}
              hasSelection={selected.size > 0}
              showColor={showComparePct}
              highlighted={showComparePct && selected.has(a.id) && hoveredAccountId === a.id}
              color={accountColor(a.id)}
              onSelectOnly={() => selectOnlyAccount(a.id)}
              onDeselect={() => deselectAccount(a.id)}
              onAddToSelection={() => addAccountToSelection(a.id)}
              onHover={(hovering) => setHoveredAccountId(hovering ? a.id : null)}
            />
          ))}
        </div>
      )}

      {/* View mode: only meaningful with 2+ accounts selected */}
      {selectedAccounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 mr-1">View</span>
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v.key}
              onClick={() => setViewMode(v.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                effectiveView === v.key ? 'bg-ink-800/10 text-ink-800 font-semibold' : 'bg-sand-100 text-ink-400 hover:bg-sand-200'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {!controlled && range === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
          <label className="flex items-center gap-1.5">
            From
            <input
              type="date"
              value={customFrom}
              min={firstDate}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="border border-sand-300 rounded px-2 py-1 text-ink-700 bg-white focus:outline-none focus:ring-1 focus:ring-sand-400"
            />
          </label>
          <label className="flex items-center gap-1.5">
            To
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={lastDate}
              onChange={(e) => setCustomTo(e.target.value)}
              className="border border-sand-300 rounded px-2 py-1 text-ink-700 bg-white focus:outline-none focus:ring-1 focus:ring-sand-400"
            />
          </label>
        </div>
      )}

      {selectedAccounts.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-ink-400">
          Select at least one account to see its progress.
        </div>
      ) : effectiveView === 'stacked' ? (
        stackedData.length >= 2 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stackedData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#8F897E' }}
                axisLine={{ stroke: '#E2D9CA' }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
                tick={(props) => <BlurredYTick {...props} blurred={blurred} />}
              />
              <Tooltip content={<MultiSeriesTooltip formatValue={formatCurrency} showTotal hoveredAccountId={hoveredAccountId} />} />
              {selectedAccounts.map((a) => {
                const dimmed = hoveredAccountId !== null && hoveredAccountId !== a.id;
                const hovered = hoveredAccountId === a.id;
                return (
                  <Area
                    key={a.id}
                    type="monotone"
                    dataKey={a.id}
                    name={accountLabel(a)}
                    stackId="stack"
                    stroke={accountColor(a.id)}
                    fill={accountColor(a.id)}
                    fillOpacity={dimmed ? 0.15 : 0.55}
                    strokeOpacity={dimmed ? 0.35 : 1}
                    strokeWidth={hovered ? 2.5 : 1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                    onMouseEnter={() => setHoveredAccountId(a.id)}
                    onMouseLeave={() => setHoveredAccountId(null)}
                    label={hovered ? (props: any) => <CurveEndLabel {...props} index={props.index} lastIndex={stackedData.length - 1} text={accountLabel(a)} color={accountColor(a.id)} anchor="end" /> : undefined}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        ) : <BuildingHistory />
      ) : chartData.length >= 2 ? (
        <ResponsiveContainer width="100%" height={220}>
          {/* ComposedChart so the $ total (Area, left axis) and each account's
              % change (Line, right axis) can share one x-axis — the two
              views this replaced (Total, Compare %) overlaid on one graph. */}
          <ComposedChart data={chartData} margin={{ top: 5, right: showComparePct ? 10 : 5, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="investFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={up ? '#3D7A5F' : '#B85450'} stopOpacity={0.18} />
                <stop offset="100%" stopColor={up ? '#3D7A5F' : '#B85450'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#8F897E' }}
              axisLine={{ stroke: '#E2D9CA' }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              domain={['auto', 'auto']}
              tick={(props) => <BlurredYTick {...props} blurred={blurred} />}
            />
            {showComparePct && (
              <YAxis
                yAxisId="right"
                orientation="right"
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
                tick={<PercentYTick />}
              />
            )}
            <Tooltip content={<CustomTooltip up={up} hoveredAccountId={hoveredAccountId} />} />
            {costBasis != null && (
              <ReferenceLine
                yAxisId="left"
                y={costBasis}
                stroke="#8F897E"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{ value: 'cost basis', position: 'insideTopRight', fontSize: 10, fill: '#8F897E' }}
              />
            )}
            {showComparePct && <ReferenceLine yAxisId="right" y={0} stroke="#C9BDA8" strokeWidth={1} />}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="value"
              name="Investments"
              stroke={up ? '#3D7A5F' : '#B85450'}
              strokeWidth={hoveredAccountId === TOTAL_HOVER_ID ? 4 : 3}
              fill="url(#investFill)"
              dot={false}
              activeDot={{ r: 4, fill: up ? '#3D7A5F' : '#B85450' }}
              onMouseEnter={() => setHoveredAccountId(TOTAL_HOVER_ID)}
              onMouseLeave={() => setHoveredAccountId(null)}
              label={hoveredAccountId === TOTAL_HOVER_ID ? (props: any) => (
                <CurveEndLabel {...props} lastIndex={chartData.length - 1} text="Investments" color={up ? '#3D7A5F' : '#B85450'} anchor="end" />
              ) : undefined}
            />
            {/* Dashed and thinner than the total's solid line so the two never
                compete visually, on top of using an entirely separate palette. */}
            {showComparePct && selectedAccounts.map((a) => {
              const dimmed = hoveredAccountId !== null && hoveredAccountId !== a.id;
              const hovered = hoveredAccountId === a.id;
              return (
                <Line
                  key={a.id}
                  yAxisId="right"
                  type="monotone"
                  dataKey={`pct_${a.id}`}
                  name={accountLabel(a)}
                  stroke={accountColor(a.id)}
                  strokeDasharray="4 3"
                  strokeOpacity={dimmed ? 0.25 : 0.85}
                  strokeWidth={hovered ? 2.25 : 1.25}
                  dot={false}
                  connectNulls={false}
                  activeDot={{ r: 3 }}
                  label={hovered ? (props: any) => (
                    <CurveEndLabel {...props} lastIndex={chartData.length - 1} text={accountLabel(a)} color={accountColor(a.id)} anchor="end" />
                  ) : undefined}
                />
              );
            })}
            {/* Invisible, generously-wide duplicates layered on top purely for
                hover detection — the real lines above are thin/dashed and too
                small a target to reliably hover directly. */}
            {showComparePct && selectedAccounts.map((a) => (
              <Line
                key={`${a.id}-hit`}
                yAxisId="right"
                type="monotone"
                dataKey={(d: any) => d[`pct_${a.id}`]}
                stroke="transparent"
                strokeWidth={16}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                connectNulls={false}
                onMouseEnter={() => setHoveredAccountId(a.id)}
                onMouseLeave={() => setHoveredAccountId(null)}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <BuildingHistory />
      )}

      {/* Time range selector — mobile only, below chart */}
      {!controlled && (
        <div className="flex md:hidden items-center justify-between border-t border-sand-100 pt-3">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setRange(p.key)}
              className={`text-xs font-medium transition-colors ${range === p.key ? 'text-ink-800 font-semibold' : 'text-ink-400 hover:text-ink-700'}`}>
              {p.label}
            </button>
          ))}
          <button onClick={() => setRange('custom')}
            className={`text-xs font-medium transition-colors ${range === 'custom' ? 'text-ink-800 font-semibold' : 'text-ink-400 hover:text-ink-700'}`}>
            Custom
          </button>
        </div>
      )}
    </div>
  );
}
