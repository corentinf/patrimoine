'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';
import { periodBoundaries } from '@/app/lib/chartBoundaries';

interface NetWorthChartProps {
  data: Array<{
    date: string;
    month: string;
    netWorth?: number;
    assets?: number;
    liabilities?: number;
    projected?: number;
  }>;
  trackingStartDate?: string | null;
  currentNetWorth?: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entries = payload.filter((p: any) => p.value !== undefined && p.value !== null);
  if (!entries.length) return null;
  return (
    <div className="bg-ink-800 text-white px-3 py-2.5 rounded-lg text-xs shadow-lg space-y-1">
      <p className="font-medium text-sand-300 mb-1">{label}</p>
      {entries.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-6" style={{ color: p.color === '#4A443C' ? 'white' : p.color }}>
          <span className="capitalize">{p.name}</span>
          <span className="font-mono">{formatCurrency(p.value)}</span>
        </div>
      ))}
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

export default function NetWorthChart({ data, trackingStartDate, currentNetWorth }: NetWorthChartProps) {
  const { blurred } = usePrivacy();
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

  const boundaries = periodBoundaries(data.map((d) => ({ date: d.date, label: d.month })));
  const hasProjection = data.some((d) => d.projected !== undefined);

  return (
    <div className="card">
      <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-4">
        Net worth over time
      </h4>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" vertical={false} />
          {boundaries.map((b) => (
            <ReferenceLine
              key={b.x}
              yAxisId="left"
              x={b.x}
              stroke="#E2D9CA"
              strokeDasharray="2 3"
              label={{ value: b.text, position: 'insideTopLeft', fontSize: 9, fill: '#B8AD9A' }}
            />
          ))}
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
          <YAxis
            yAxisId="left"
            axisLine={false}
            tickLine={false}
            domain={['auto', 'auto']}
            tick={(props) => <BlurredYTick {...props} formatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} blurred={blurred} />}
          />
          {/* Liabilities get their own right-hand axis at their own scale —
              otherwise they'd still be squashed flat near zero on the left axis. */}
          <YAxis
            yAxisId="right"
            orientation="right"
            axisLine={false}
            tickLine={false}
            domain={['auto', 'auto']}
            tick={(props) => <BlurredYTick {...props} formatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} blurred={blurred} />}
          />
          <Tooltip content={<CustomTooltip />} />
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
          {hasProjection && (
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
        </LineChart>
      </ResponsiveContainer>
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
    </div>
  );
}
