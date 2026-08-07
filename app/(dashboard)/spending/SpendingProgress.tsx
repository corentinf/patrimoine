'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, Cell, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { format, differenceInCalendarDays } from 'date-fns';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';
import { PRESETS, isoDate, resolveStart, type RangeKey } from '@/app/lib/investmentRange';
import { periodBoundaries, BOUNDARY_STYLE } from '@/app/lib/chartBoundaries';

export interface DailySpend { date: string; amount: number }
interface SpendingProgressProps {
  data: DailySpend[];
  /** `preview` is true for a live hover preview (not a deliberate click) —
   *  callers should use it to avoid treating a hover as a real filter change. */
  onPeriodSelect?: (range: { start: string; end: string } | null, meta?: { preview: boolean }) => void;
  label?: string;
  color?: string;
  valueLabel?: string;
  /** ISO date bounds — when both are provided, the range is controlled by the parent
   *  (built-in preset buttons are hidden) instead of the internal selector. */
  rangeStart?: string;
  rangeEnd?: string;
  /** Shifts the parent's (global) date filter by its own span — wires the
   *  chart's prev/next arrows to the same period selector as the header. */
  onStepPeriod?: (delta: number) => void;
  canStepBackward?: boolean;
  canStepForward?: boolean;
}

const iso = isoDate;

function BlurredYTick({ x, y, payload, blurred }: any) {
  return (
    <text x={x} y={y} dy={4} fill="#8F897E" fontSize={11} textAnchor="end"
      style={blurred ? { filter: 'blur(5px)', userSelect: 'none' } : {}}>
      {`$${(payload.value / 1000).toFixed(payload.value >= 1000 ? 0 : 1)}k`}
    </text>
  );
}

function CustomTooltip({ active, payload, label, valueLabel }: any) {
  if (!active || !payload?.length) return null;
  // The bar's own dataKey is a display value clamped for outlier-capping —
  // the tooltip always shows the true amount from the underlying data point.
  const trueValue = payload[0].payload?.value ?? payload[0].value;
  return (
    <div className="bg-ink-800 text-white px-3 py-2 rounded-lg text-xs shadow-lg space-y-0.5">
      <p className="font-medium text-sand-300">{label}</p>
      <p className="font-mono">{formatCurrency(trueValue)} {valueLabel ?? 'spent'}</p>
    </div>
  );
}

function bucketKey(date: string, gran: 'day' | 'week' | 'month'): string {
  if (gran === 'month') return date.slice(0, 7);
  if (gran === 'week') {
    const d = new Date(date + 'T12:00:00');
    const offset = (d.getDay() + 6) % 7; // Monday-start
    d.setDate(d.getDate() - offset);
    return iso(d);
  }
  return date;
}

function bucketLabel(key: string, gran: 'day' | 'week' | 'month'): string {
  if (gran === 'month') return format(new Date(key + '-01T12:00:00'), 'MMM yy');
  return format(new Date(key + 'T12:00:00'), 'MMM d');
}

const DEFAULT_COLOR = '#B85450';

const GRAN_LABELS: Record<'day' | 'week' | 'month', string> = { day: 'Day', week: 'Week', month: 'Month' };

function GranDropdown({ value, onChange }: { value: 'day' | 'week' | 'month'; onChange: (v: 'day' | 'week' | 'month') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sand-100 text-xs font-medium text-ink-700 hover:bg-sand-200 transition-colors"
      >
        {GRAN_LABELS[value]}
        <svg className="w-3 h-3 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-sand-200 rounded-lg shadow-md py-0.5 z-20 min-w-[80px]">
          {(['day', 'week', 'month'] as const).map((g) => (
            <button
              key={g}
              onClick={() => { onChange(g); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors ${
                g === value ? 'text-ink-800 bg-sand-50' : 'text-ink-500 hover:bg-sand-50 hover:text-ink-700'
              }`}
            >
              {GRAN_LABELS[g]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function bucketRange(key: string, gran: 'day' | 'week' | 'month'): { start: string; end: string } {
  if (gran === 'day') return { start: key, end: key };
  if (gran === 'month') {
    const [y, m] = key.split('-').map(Number);
    const end = new Date(y, m, 0).toISOString().slice(0, 10);
    return { start: key + '-01', end };
  }
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  return { start: key, end: iso(d) };
}

export default function SpendingProgress({ data, onPeriodSelect, label = 'Spending over time', color = DEFAULT_COLOR, valueLabel = 'spent', rangeStart, rangeEnd, onStepPeriod, canStepBackward = true, canStepForward = true }: SpendingProgressProps) {
  const { blurred } = usePrivacy();
  const controlled = rangeStart !== undefined && rangeEnd !== undefined;
  const [range, setRange] = useState<RangeKey>('30d');
  const [gran, setGran] = useState<'day' | 'week' | 'month'>('day');
  // Click pins a bar's selection so it survives the mouse leaving the chart;
  // hovering a (different) bar previews it live but reverts to whatever's
  // pinned — or to nothing — once the mouse moves off.
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const selectedKey = hoveredKey ?? pinnedKey;
  // Auto-detected outlier capping (see yAxisCap below) can be overridden by
  // the user via the "Full scale" toggle — e.g. when two similar-sized
  // outliers make each other look "normal" to the heuristic, or they just
  // want to see the true proportions.
  const [forceFullScale, setForceFullScale] = useState(true);

  const todayIso = iso(new Date());
  const firstDate = data[0]?.date ?? todayIso;
  const lastDate = data.length ? data[data.length - 1].date : todayIso;

  const [customFrom, setCustomFrom] = useState(firstDate);
  const [customTo, setCustomTo] = useState(lastDate);

  const { start, end } = useMemo(() => {
    if (controlled) return { start: rangeStart!, end: rangeEnd! };
    const start = resolveStart(range, { now: new Date(), firstDate, prevDate: firstDate, customFrom });
    return { start, end: range === 'custom' ? customTo : todayIso };
  }, [controlled, rangeStart, rangeEnd, range, firstDate, customFrom, customTo, todayIso]);

  useEffect(() => {
    setPinnedKey(null);
    setHoveredKey(null);
    onPeriodSelect?.(null, { preview: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, gran]);

  const inRange = useMemo(
    () => data.filter((d) => d.date >= start && d.date <= end),
    [data, start, end],
  );

  const total = inRange.reduce((s, d) => s + d.amount, 0);
  const spanDays = Math.max(1, differenceInCalendarDays(new Date(end), new Date(start)) + 1);
  const avgPerDay = total / spanDays;

  const chartData = useMemo(() => {
    const byBucket = new Map<string, number>();
    for (const d of inRange) {
      const k = bucketKey(d.date, gran);
      byBucket.set(k, (byBucket.get(k) ?? 0) + d.amount);
    }
    // Fill every bucket in the visible range with 0 so gaps (days with no
    // spending) still render as bars and don't silently disappear.
    const cur = new Date(start + 'T12:00:00');
    const endDate = new Date(end + 'T12:00:00');
    while (cur <= endDate) {
      const k = bucketKey(iso(cur), gran);
      if (!byBucket.has(k)) byBucket.set(k, 0);
      cur.setDate(cur.getDate() + 1);
    }
    return Array.from(byBucket.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({ label: bucketLabel(k, gran), key: k, value: Math.round(v) }));
  }, [inRange, gran]);

  // Which bucket (whatever the current granularity) today falls into, so its
  // bar can be visually flagged — only matches something when today is
  // actually within the visible range.
  const todayKey = bucketKey(todayIso, gran);

  // One outsized bucket (e.g. a rent payment) can flatten every other bar to
  // near-zero. Compare against the median (not just the single next-highest
  // bucket) so two similar-sized outliers in the same period — which would
  // otherwise look "normal" next to each other — both still get caught. Any
  // bucket over the cap clamps to it, with its true amount shown via a label
  // above the bar and in the tooltip (CustomTooltip reads the real value).
  const autoYAxisCap = useMemo(() => {
    const values = chartData.map((d: any) => d.value).filter((v: number) => v > 0).sort((a: number, b: number) => a - b);
    if (values.length < 4) return null;
    const max = values[values.length - 1];
    const median = values[Math.floor(values.length / 2)];
    const ceiling = median * 4;
    if (max <= ceiling * 1.15) return null;
    return Math.ceil(ceiling / 100) * 100;
  }, [chartData]);

  const yAxisCap = forceFullScale ? null : autoYAxisCap;

  // Bucket boundaries already are the period at week/month granularity — the
  // divider lines only add value in 'day' mode, where a run of daily bars
  // otherwise gives no sense of where one week or month ends and the next begins.
  const boundaries = useMemo(
    () => (gran === 'day' ? periodBoundaries(chartData.map((d) => ({ date: d.key, label: d.label }))) : []),
    [chartData, gran],
  );

  const barChartData = useMemo(() => {
    if (!yAxisCap) return chartData;
    return chartData.map((d: any) => ({
      ...d,
      displayValue: Math.min(d.value, yAxisCap),
      capped: d.value > yAxisCap,
    }));
  }, [chartData, yAxisCap]);

  const rangeBtn = (active: boolean) =>
    `text-xs font-medium transition-colors ${active ? 'text-ink-800 font-semibold' : 'text-ink-400 hover:text-ink-700'}`;

  const hasData = chartData.length >= 2;

  return (
    <div className="card space-y-4 h-full flex flex-col">
      {/* Header: stats left, controls right */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-xs font-semibold text-ink-400 uppercase tracking-wider">
            {label}
          </h4>
          <div className="mt-1.5 flex items-baseline gap-3">
            <span className="text-2xl font-mono font-medium text-ink-800" data-sensitive>
              {formatCurrency(total)}
            </span>
            <span className="text-sm font-mono text-ink-400">
              <span data-sensitive>{formatCurrency(avgPerDay)}</span>/day
            </span>
          </div>
          <p className="text-xs text-ink-400 mt-0.5">
            {`${valueLabel.charAt(0).toUpperCase() + valueLabel.slice(1)} per period`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {!controlled && (
            <div className="hidden md:flex items-center gap-3">
              {PRESETS.map((p) => (
                <button key={p.key} onClick={() => setRange(p.key)} className={rangeBtn(range === p.key)}>
                  {p.label}
                </button>
              ))}
              <button onClick={() => setRange('custom')} className={rangeBtn(range === 'custom')}>Custom</button>
            </div>
          )}
          {/* Granularity + scale toggles */}
          <div className="flex items-center gap-2">
            <GranDropdown value={gran} onChange={setGran} />
            {autoYAxisCap != null && (
              <button
                onClick={() => setForceFullScale((v) => !v)}
                title={forceFullScale
                  ? 'Showing the true scale — a big day is squashing the rest. Click to normalize it.'
                  : 'A big day is being scaled down so the rest stay comparable. Click to see the true scale.'}
                className="px-2.5 py-1 rounded-lg bg-sand-100 text-xs font-medium text-ink-500 hover:text-ink-700 hover:bg-sand-200 transition-colors"
              >
                {forceFullScale ? 'Normalize' : 'True scale'}
              </button>
            )}
          </div>
        </div>
      </div>

      {!controlled && range === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
          <label className="flex items-center gap-1.5">
            From
            <input type="date" value={customFrom} min={firstDate} max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="border border-sand-300 rounded px-2 py-1 text-ink-700 bg-white focus:outline-none focus:ring-1 focus:ring-sand-400" />
          </label>
          <label className="flex items-center gap-1.5">
            To
            <input type="date" value={customTo} min={customFrom} max={lastDate}
              onChange={(e) => setCustomTo(e.target.value)}
              className="border border-sand-300 rounded px-2 py-1 text-ink-700 bg-white focus:outline-none focus:ring-1 focus:ring-sand-400" />
          </label>
        </div>
      )}

      <div className="flex-1 min-h-[220px] flex flex-col">
      <div className="flex-1 min-h-0">
      {hasData ? (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={barChartData}
              margin={{ top: yAxisCap ? 18 : 5, right: 5, bottom: 0, left: -10 }}
              style={{ cursor: onPeriodSelect ? 'pointer' : 'default' }}
              onClick={(d: any) => {
                const key = d?.activePayload?.[0]?.payload?.key;
                if (!key || !onPeriodSelect) return;
                if (pinnedKey === key) {
                  // Unpin. On desktop a live hover preview would otherwise keep the
                  // selection alive until the mouse leaves, but on touch there's no
                  // hover/mouseleave at all — clear both explicitly so tapping a
                  // selected bar again always deselects it.
                  setPinnedKey(null);
                  setHoveredKey(null);
                  onPeriodSelect(null, { preview: false });
                } else {
                  setPinnedKey(key);
                  onPeriodSelect(bucketRange(key, gran), { preview: false });
                }
              }}
              onMouseMove={(d: any) => {
                // Mobile has no real hover — Recharts still relays touch-drag into this
                // handler, which made dragging a finger across bars flicker through a
                // live preview. Restrict the preview to actual pointer-hover devices.
                if (window.innerWidth < 768) return;
                const key = d?.activePayload?.[0]?.payload?.key;
                if (!key || !onPeriodSelect || hoveredKey === key) return;
                setHoveredKey(key);
                onPeriodSelect(bucketRange(key, gran), { preview: true });
              }}
              onMouseLeave={() => {
                if (window.innerWidth < 768) return;
                setHoveredKey(null);
                if (!onPeriodSelect) return;
                onPeriodSelect(pinnedKey ? bucketRange(pinnedKey, gran) : null, { preview: true });
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" vertical={false} />
              {boundaries.map((b) => {
                const s = BOUNDARY_STYLE[b.kind];
                return (
                  <ReferenceLine
                    key={b.x}
                    x={b.x}
                    stroke={s.stroke}
                    strokeWidth={s.strokeWidth}
                    strokeDasharray={s.dash}
                    label={{ value: b.text, position: 'insideTopLeft', fontSize: s.fontSize, fontWeight: s.fontWeight, fill: s.fill }}
                  />
                );
              })}
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8F897E' }} axisLine={{ stroke: '#E2D9CA' }} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
              <YAxis
                axisLine={false}
                tickLine={false}
                domain={yAxisCap ? [0, yAxisCap] : ['auto', 'auto']}
                tick={(props) => <BlurredYTick {...props} blurred={blurred} />}
              />
              <Tooltip content={<CustomTooltip valueLabel={valueLabel} />} cursor={{ fill: '#F0EBE1', opacity: 0.5 }} />
              <Bar dataKey={yAxisCap ? 'displayValue' : 'value'} name="Spending" radius={[3, 3, 0, 0]}>
                {barChartData.map((entry: any, i: number) => {
                  const isSelected = !!selectedKey && entry.key === selectedKey;
                  const hasSelection = !!selectedKey;
                  const isToday = entry.key === todayKey;
                  return (
                    <Cell
                      key={i}
                      fill={color}
                      fillOpacity={hasSelection ? (isSelected ? 1 : 0.3) : 1}
                      stroke={isToday ? '#292524' : 'none'}
                      strokeWidth={isToday ? 1.5 : 0}
                    />
                  );
                })}
                {yAxisCap && (
                  <LabelList
                    dataKey="displayValue"
                    content={(props: any) => {
                      const { x, y, width, index } = props;
                      const entry = barChartData[index];
                      if (!entry?.capped) return null;
                      return (
                        <text
                          x={x + width / 2}
                          y={y - 6}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight={600}
                          fill="#8F897E"
                        >
                          {formatCurrency(entry.value)}
                        </text>
                      );
                    }}
                  />
                )}
              </Bar>
            </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-full flex items-center justify-center text-xs text-ink-400">
          No spending in this range.
        </div>
      )}
      </div>
      {onStepPeriod && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => onStepPeriod(-1)}
            disabled={!canStepBackward}
            aria-label="Previous period"
            className="p-1 rounded-md text-ink-300 hover:text-ink-600 hover:bg-sand-100 transition-colors disabled:opacity-0 disabled:pointer-events-none"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => onStepPeriod(1)}
            disabled={!canStepForward}
            aria-label="Next period"
            className="p-1 rounded-md text-ink-300 hover:text-ink-600 hover:bg-sand-100 transition-colors disabled:opacity-0 disabled:pointer-events-none"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
      </div>

      {/* Time range selector — mobile only, below chart */}
      {!controlled && (
        <div className="flex md:hidden items-center justify-between border-t border-sand-100 pt-3">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setRange(p.key)} className={rangeBtn(range === p.key)}>
              {p.label}
            </button>
          ))}
          <button onClick={() => setRange('custom')} className={rangeBtn(range === 'custom')}>
            Custom
          </button>
        </div>
      )}
    </div>
  );
}
