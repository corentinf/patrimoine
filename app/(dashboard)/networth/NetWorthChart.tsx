'use client';

import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';
import { periodBoundaries, BOUNDARY_STYLE } from '@/app/lib/chartBoundaries';

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
            <span className="font-mono">{formatCurrency(p.value)}</span>
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

export default function NetWorthChart({ data, trackingStartDate, currentNetWorth }: NetWorthChartProps) {
  const { blurred } = usePrivacy();
  const [showProjection, setShowProjection] = useState(false);
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
  const showProjectionLine = hasProjection && showProjection;
  // Drop the future-only projected rows entirely when the toggle is off, so
  // the x-axis doesn't stay stretched out over empty months.
  const chartRows = showProjectionLine ? data : data.filter((d) => d.netWorth !== undefined);
  const boundaries = periodBoundaries(chartRows.map((d) => ({ date: d.date, label: d.month })));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider">
          Net worth over time
        </h4>
        {hasProjection && (
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
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartRows} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
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
