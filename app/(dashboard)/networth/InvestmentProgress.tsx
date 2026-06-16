'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  format, startOfWeek, startOfMonth, startOfYear, subMonths,
} from 'date-fns';
import { formatCurrency, amountColor } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';

interface Point {
  date: string; // YYYY-MM-DD
  value: number;
}

interface InvestmentProgressProps {
  series: Point[];
  currentValue: number;
}

type RangeKey = 'today' | 'week' | 'month' | '3m' | 'year' | 'all' | 'custom';

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: '3m', label: '3 months' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ink-800 text-white px-3 py-2 rounded-lg text-xs shadow-lg space-y-0.5">
      <p className="font-medium text-sand-300">{label}</p>
      <p className="font-mono">{formatCurrency(payload[0].value)}</p>
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

export default function InvestmentProgress({ series, currentValue }: InvestmentProgressProps) {
  const { blurred } = usePrivacy();
  const [range, setRange] = useState<RangeKey>('month');

  // Effective series: ensure the live current value is reflected as "today" if the
  // latest snapshot predates today.
  const todayIso = iso(new Date());
  const data: Point[] = useMemo(() => {
    const s = [...series];
    if (s.length === 0 || s[s.length - 1].date < todayIso) {
      s.push({ date: todayIso, value: currentValue });
    } else {
      // Latest snapshot is today — prefer the live value.
      s[s.length - 1] = { ...s[s.length - 1], value: currentValue };
    }
    return s;
  }, [series, currentValue, todayIso]);

  const firstDate = data[0]?.date ?? todayIso;
  const lastDate = data[data.length - 1]?.date ?? todayIso;

  const [customFrom, setCustomFrom] = useState(firstDate);
  const [customTo, setCustomTo] = useState(lastDate);

  // Resolve [start, end] for the active range.
  const { start, end } = useMemo(() => {
    const now = new Date();
    switch (range) {
      case 'today': {
        // Baseline = the snapshot just before the latest point.
        const prev = data.length >= 2 ? data[data.length - 2].date : data[0]?.date;
        return { start: prev ?? firstDate, end: lastDate };
      }
      case 'week':
        return { start: iso(startOfWeek(now, { weekStartsOn: 1 })), end: lastDate };
      case 'month':
        return { start: iso(startOfMonth(now)), end: lastDate };
      case '3m':
        return { start: iso(subMonths(now, 3)), end: lastDate };
      case 'year':
        return { start: iso(startOfYear(now)), end: lastDate };
      case 'all':
        return { start: firstDate, end: lastDate };
      case 'custom':
        return { start: customFrom, end: customTo };
    }
  }, [range, data, firstDate, lastDate, customFrom, customTo]);

  // Baseline = last point on or before `start` (value at the period start).
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

  // Chart anchors on the baseline so a short range still shows where it started.
  const chartData = useMemo(() => {
    const pts = baseline && (inRange.length === 0 || inRange[0].date !== baseline.date)
      ? [baseline, ...inRange]
      : inRange;
    return pts.map((p) => ({
      label: format(new Date(p.date + 'T12:00:00'), 'MMM d'),
      value: Math.round(p.value),
    }));
  }, [baseline, inRange]);

  const startValue = baseline?.value ?? inRange[0]?.value ?? 0;
  const endValue = inRange.length ? inRange[inRange.length - 1].value : currentValue;
  const change = endValue - startValue;
  const pct = startValue !== 0 ? (change / startValue) * 100 : 0;
  const up = change >= 0;

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active ? 'bg-ink-800 text-white' : 'bg-sand-100 text-ink-500 hover:bg-sand-200'
    }`;

  // Not enough history to show a trend.
  if (series.length < 2) {
    return (
      <div className="card">
        <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-4">
          Progress over time
        </h4>
        <div className="h-[180px] flex flex-col items-center justify-center gap-2 text-center">
          <svg className="w-8 h-8 text-ink-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 17l6-6 4 4 8-8" />
          </svg>
          <p className="text-sm font-medium text-ink-600">Building your history</p>
          <p className="text-xs text-ink-400 max-w-xs">
            Your portfolio trend will appear after a few more daily syncs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider">
            Progress over time
          </h4>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={`text-2xl font-mono font-medium ${amountColor(change)}`} data-sensitive>
              {up ? '+' : ''}{formatCurrency(change)}
            </span>
            <span className={`text-sm font-mono ${amountColor(change)}`}>
              {up ? '+' : ''}{pct.toFixed(2)}%
            </span>
          </div>
          <p className="text-xs text-ink-400 mt-1">
            <span data-sensitive>{formatCurrency(startValue)}</span>
            {' → '}
            <span data-sensitive>{formatCurrency(endValue)}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setRange(p.key)} className={pill(range === p.key)}>
              {p.label}
            </button>
          ))}
          <button onClick={() => setRange('custom')} className={pill(range === 'custom')}>
            Custom
          </button>
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

      {chartData.length >= 2 ? (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
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
              axisLine={false}
              tickLine={false}
              domain={['auto', 'auto']}
              tick={(props) => <BlurredYTick {...props} blurred={blurred} />}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              name="Investments"
              stroke={up ? '#3D7A5F' : '#B85450'}
              strokeWidth={2}
              fill="url(#investFill)"
              dot={false}
              activeDot={{ r: 4, fill: up ? '#3D7A5F' : '#B85450' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[120px] flex items-center justify-center text-xs text-ink-400">
          No snapshots in this range.
        </div>
      )}
    </div>
  );
}
