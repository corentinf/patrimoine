'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/app/lib/utils';

interface NetWorthChartProps {
  data: Array<{
    date: string;
    netWorth: number;
    assets: number;
    liabilities: number;
  }>;
}

export default function NetWorthChart({ data }: NetWorthChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-ink-800 text-white px-4 py-3 rounded-lg text-xs shadow-lg">
        <p className="font-medium text-sand-300 mb-1.5">{label}</p>
        <div className="space-y-1">
          <div className="flex justify-between gap-6">
            <span>Net worth</span>
            <span className="font-mono font-medium">
              {formatCurrency(payload[0]?.value || 0)}
            </span>
          </div>
          {payload[1] && (
            <div className="flex justify-between gap-6 text-emerald-300">
              <span>Assets</span>
              <span className="font-mono">{formatCurrency(payload[1]?.value || 0)}</span>
            </div>
          )}
          {payload[2] && (
            <div className="flex justify-between gap-6 text-red-300">
              <span>Liabilities</span>
              <span className="font-mono">{formatCurrency(payload[2]?.value || 0)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="card">
      <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-4">
        Net worth over time
      </h4>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
          <defs>
            <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4A443C" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#4A443C" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="assetsGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3D7A5F" stopOpacity={0.08} />
              <stop offset="95%" stopColor="#3D7A5F" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#8F897E' }}
            axisLine={{ stroke: '#E2D9CA' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#8F897E' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="#4A443C"
            strokeWidth={2}
            fill="url(#netWorthGrad)"
          />
          <Area
            type="monotone"
            dataKey="assets"
            stroke="#3D7A5F"
            strokeWidth={1}
            strokeDasharray="4 4"
            fill="url(#assetsGrad)"
          />
          <Area
            type="monotone"
            dataKey="liabilities"
            stroke="#B85450"
            strokeWidth={1}
            strokeDasharray="4 4"
            fill="none"
          />
        </AreaChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex gap-6 justify-center mt-3 text-xs text-ink-400">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-ink-500 rounded" />
          Net worth
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-accent-green rounded border-dashed" style={{ borderTop: '1px dashed #3D7A5F' }} />
          Assets
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded" style={{ borderTop: '1px dashed #B85450' }} />
          Liabilities
        </div>
      </div>
    </div>
  );
}
