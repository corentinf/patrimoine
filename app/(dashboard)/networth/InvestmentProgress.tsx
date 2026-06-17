'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { formatCurrency, amountColor } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';
import { PRESETS, isoDate, resolveStart, type RangeKey } from '@/app/lib/investmentRange';

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
}

interface Point { date: string; value: number }

const iso = isoDate;

function CustomTooltip({ active, payload, label, up }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const cost = p.costBasis as number | undefined;
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

function BlurredYTick({ x, y, payload, blurred }: any) {
  return (
    <text x={x} y={y} dy={4} fill="#8F897E" fontSize={11} textAnchor="end"
      style={blurred ? { filter: 'blur(5px)', userSelect: 'none' } : {}}>
      {`$${(payload.value / 1000).toFixed(0)}k`}
    </text>
  );
}

export default function InvestmentProgress({ dates, accounts }: InvestmentProgressProps) {
  const { blurred } = usePrivacy();
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
  const data: Point[] = useMemo(() => {
    const out: Point[] = [];
    for (let i = 0; i < dates.length; i++) {
      let sum = 0;
      let ok = selectedAccounts.length > 0;
      for (const a of selectedAccounts) {
        const v = a.values[i];
        if (v == null) { ok = false; break; }
        sum += v;
      }
      if (ok) out.push({ date: dates[i], value: sum });
    }
    if (out.length === 0 || out[out.length - 1].date < todayIso) {
      if (selectedAccounts.length > 0) out.push({ date: todayIso, value: liveValue });
    } else {
      out[out.length - 1] = { ...out[out.length - 1], value: liveValue };
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, accounts, selected, todayIso, liveValue]);

  const firstDate = data[0]?.date ?? todayIso;
  const lastDate = data[data.length - 1]?.date ?? todayIso;

  const [customFrom, setCustomFrom] = useState(firstDate);
  const [customTo, setCustomTo] = useState(lastDate);

  const { start, end } = useMemo(() => {
    const prevDate = data.length >= 2 ? data[data.length - 2].date : data[0]?.date;
    const start = resolveStart(range, { now: new Date(), firstDate, prevDate, customFrom });
    return { start, end: range === 'custom' ? customTo : lastDate };
  }, [range, data, firstDate, lastDate, customFrom, customTo]);

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

  const chartData = useMemo(() => {
    const pts = baseline && (inRange.length === 0 || inRange[0].date !== baseline.date)
      ? [baseline, ...inRange]
      : inRange;
    return pts.map((p) => ({
      label: format(new Date(p.date + 'T12:00:00'), 'MMM d'),
      value: Math.round(p.value),
      ...(costBasis != null ? { costBasis: Math.round(costBasis) } : {}),
    }));
  }, [baseline, inRange, costBasis]);

  const startValue = baseline?.value ?? inRange[0]?.value ?? 0;
  const endValue = inRange.length ? inRange[inRange.length - 1].value : liveValue;
  const change = endValue - startValue;
  const pct = startValue !== 0 ? (change / startValue) * 100 : 0;
  const up = change >= 0;

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active ? 'bg-ink-800 text-white' : 'bg-sand-100 text-ink-500 hover:bg-sand-200'
    }`;

  function toggleAccount(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const accountLabel = (a: AccountSeries) => (a.name.length <= 24 ? a.name : a.institution);

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
            {costBasis != null && (
              <span className="ml-2 text-ink-300">
                · cost basis <span data-sensitive>{formatCurrency(costBasis)}</span>
              </span>
            )}
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

      {/* Account filter */}
      {accounts.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 mr-1">Accounts</span>
          {accounts.map((a) => {
            const on = selected.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggleAccount(a.id)}
                title={`${a.key}${a.costBasis != null ? '' : ' (no cost basis)'}`}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  on ? 'bg-ink-700 text-white' : 'bg-sand-100 text-ink-400 hover:bg-sand-200'
                }`}
              >
                {accountLabel(a)}
              </button>
            );
          })}
        </div>
      )}

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

      {selectedAccounts.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-ink-400">
          Select at least one account to see its progress.
        </div>
      ) : chartData.length >= 2 ? (
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
            <Tooltip content={<CustomTooltip up={up} />} />
            {costBasis != null && (
              <ReferenceLine
                y={costBasis}
                stroke="#8F897E"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{ value: 'cost basis', position: 'insideTopRight', fontSize: 10, fill: '#8F897E' }}
              />
            )}
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
        <div className="h-[180px] flex flex-col items-center justify-center gap-2 text-center">
          <svg className="w-8 h-8 text-ink-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 17l6-6 4 4 8-8" />
          </svg>
          <p className="text-sm font-medium text-ink-600">Building your history</p>
          <p className="text-xs text-ink-400 max-w-xs">
            Your portfolio trend will appear after a few more daily syncs.
          </p>
        </div>
      )}
    </div>
  );
}
