'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';

interface NetWorthChartProps {
  data: Array<{
    month: string;
    netWorth: number;
    assets: number;
    liabilities: number;
  }>;
  trackingStartDate?: string | null;
  currentNetWorth?: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ink-800 text-white px-3 py-2.5 rounded-lg text-xs shadow-lg space-y-1">
      <p className="font-medium text-sand-300 mb-1">{label}</p>
      {payload.map((p: any) => (
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

  return (
    <div className="card">
      <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-4">
        Net worth over time
      </h4>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: '#8F897E' }}
            axisLine={{ stroke: '#E2D9CA' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={(props) => <BlurredYTick {...props} formatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} blurred={blurred} />}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="netWorth"
            name="Net worth"
            stroke="#4A443C"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#4A443C' }}
          />
          <Line
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
