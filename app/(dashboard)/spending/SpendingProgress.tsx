'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { format, differenceInCalendarDays } from 'date-fns';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';
import { PRESETS, isoDate, resolveStart, type RangeKey } from '@/app/lib/investmentRange';

interface DailySpend { date: string; amount: number }
interface SpendingProgressProps {
  data: DailySpend[];
  onPeriodSelect?: (range: { start: string; end: string } | null) => void;
}

type ViewMode = 'cumulative' | 'interval';

const iso = isoDate;

function BlurredYTick({ x, y, payload, blurred }: any) {
  return (
    <text x={x} y={y} dy={4} fill="#8F897E" fontSize={11} textAnchor="end"
      style={blurred ? { filter: 'blur(5px)', userSelect: 'none' } : {}}>
      {`$${(payload.value / 1000).toFixed(payload.value >= 1000 ? 0 : 1)}k`}
    </text>
  );
}

function CustomTooltip({ active, payload, label, mode }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ink-800 text-white px-3 py-2 rounded-lg text-xs shadow-lg space-y-0.5">
      <p className="font-medium text-sand-300">{label}</p>
      <p className="font-mono">{formatCurrency(payload[0].value)}{mode === 'cumulative' ? ' total' : ' spent'}</p>
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

const SPEND = '#B85450';

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

export default function SpendingProgress({ data, onPeriodSelect }: SpendingProgressProps) {
  const { blurred } = usePrivacy();
  const [range, setRange] = useState<RangeKey>('30d');
  const [mode, setMode] = useState<ViewMode>('interval');
  const [gran, setGran] = useState<'day' | 'week' | 'month'>('day');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    setSelectedKey(null);
    onPeriodSelect?.(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, gran, mode]);

  const todayIso = iso(new Date());
  const firstDate = data[0]?.date ?? todayIso;
  const lastDate = data.length ? data[data.length - 1].date : todayIso;

  const [customFrom, setCustomFrom] = useState(firstDate);
  const [customTo, setCustomTo] = useState(lastDate);

  const { start, end } = useMemo(() => {
    const start = resolveStart(range, { now: new Date(), firstDate, prevDate: firstDate, customFrom });
    return { start, end: range === 'custom' ? customTo : todayIso };
  }, [range, firstDate, customFrom, customTo, todayIso]);

  const inRange = useMemo(
    () => data.filter((d) => d.date >= start && d.date <= end),
    [data, start, end],
  );

  const total = inRange.reduce((s, d) => s + d.amount, 0);
  const spanDays = Math.max(1, differenceInCalendarDays(new Date(end), new Date(start)) + 1);
  const avgPerDay = total / spanDays;

  const chartData = useMemo(() => {
    if (mode === 'cumulative') {
      let run = 0;
      return inRange.map((d) => {
        run += d.amount;
        return { label: format(new Date(d.date + 'T12:00:00'), 'MMM d'), value: Math.round(run) };
      });
    }
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
  }, [inRange, mode, gran]);

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active ? 'bg-ink-800 text-white' : 'bg-sand-100 text-ink-500 hover:bg-sand-200'
    }`;

  const hasData = chartData.length >= 2;

  return (
    <div className="card space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider">
            Spending over time
          </h4>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-2xl font-mono font-medium text-ink-800" data-sensitive>
              {formatCurrency(total)}
            </span>
            <span className="text-sm font-mono text-ink-400">
              <span data-sensitive>{formatCurrency(avgPerDay)}</span>/day
            </span>
          </div>
          <p className="text-xs text-ink-400 mt-1">
            {mode === 'cumulative' ? 'Cumulative spend over the selected period' : 'Spend per period'}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-1.5 justify-end">
            {PRESETS.map((p) => (
              <button key={p.key} onClick={() => setRange(p.key)} className={pill(range === p.key)}>
                {p.label}
              </button>
            ))}
            <button onClick={() => setRange('custom')} className={pill(range === 'custom')}>
              Custom
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-sand-100 p-0.5 text-xs font-medium">
              <button
                onClick={() => setMode('cumulative')}
                className={`px-3 py-1 rounded-md transition-colors ${mode === 'cumulative' ? 'bg-white text-ink-700 shadow-sm' : 'text-ink-400 hover:text-ink-600'}`}
              >
                Cumulative
              </button>
              <button
                onClick={() => setMode('interval')}
                className={`px-3 py-1 rounded-md transition-colors ${mode === 'interval' ? 'bg-white text-ink-700 shadow-sm' : 'text-ink-400 hover:text-ink-600'}`}
              >
                Per period
              </button>
            </div>
            {mode === 'interval' && (
              <div className="inline-flex rounded-lg bg-sand-100 p-0.5 text-xs font-medium">
                {(['day', 'week', 'month'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGran(g)}
                    className={`px-3 py-1 rounded-md transition-colors capitalize ${gran === g ? 'bg-white text-ink-700 shadow-sm' : 'text-ink-400 hover:text-ink-600'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {range === 'custom' && (
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

      {hasData ? (
        <ResponsiveContainer width="100%" height={220}>
          {mode === 'cumulative' ? (
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SPEND} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={SPEND} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8F897E' }} axisLine={{ stroke: '#E2D9CA' }} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis axisLine={false} tickLine={false} domain={['auto', 'auto']} tick={(props) => <BlurredYTick {...props} blurred={blurred} />} />
              <Tooltip content={<CustomTooltip mode={mode} />} />
              <Area type="monotone" dataKey="value" name="Spending" stroke={SPEND} strokeWidth={2} fill="url(#spendFill)" dot={false} activeDot={{ r: 4, fill: SPEND }} />
            </AreaChart>
          ) : (
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 5, bottom: 0, left: -10 }}
              style={{ cursor: onPeriodSelect ? 'pointer' : 'default' }}
              onClick={(d: any) => {
                const key = d?.activePayload?.[0]?.payload?.key;
                if (!key || !onPeriodSelect) return;
                if (selectedKey === key) {
                  setSelectedKey(null);
                  onPeriodSelect(null);
                } else {
                  setSelectedKey(key);
                  onPeriodSelect(bucketRange(key, gran));
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8F897E' }} axisLine={{ stroke: '#E2D9CA' }} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
              <YAxis axisLine={false} tickLine={false} tick={(props) => <BlurredYTick {...props} blurred={blurred} />} />
              <Tooltip content={<CustomTooltip mode={mode} />} cursor={{ fill: '#F0EBE1', opacity: 0.5 }} />
              <Bar dataKey="value" name="Spending" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => {
                  const isSelected = !!selectedKey && (entry as any).key === selectedKey;
                  const hasSelection = !!selectedKey;
                  return (
                    <Cell
                      key={i}
                      fill={SPEND}
                      fillOpacity={hasSelection ? (isSelected ? 1 : 0.3) : 1}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      ) : (
        <div className="h-[180px] flex items-center justify-center text-xs text-ink-400">
          No spending in this range.
        </div>
      )}
    </div>
  );
}
