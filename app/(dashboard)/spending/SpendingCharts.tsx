'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/app/lib/utils';

interface SpendingChartsProps {
  categories: Array<{
    name: string;
    color: string;
    icon: string;
    total: number;
    count: number;
  }>;
  monthlyData: Array<{
    month: string;
    total: number;
  }>;
  totalSpending: number;
}

export default function SpendingCharts({
  categories,
  monthlyData,
  totalSpending,
}: SpendingChartsProps) {
  // Take top 8 categories for pie chart, group rest as "Other"
  const pieData = (() => {
    const top = categories.slice(0, 8);
    const rest = categories.slice(8);
    const restTotal = rest.reduce((sum, c) => sum + c.total, 0);

    const data = top.map((c) => ({
      name: c.name,
      value: Math.round(c.total),
      color: c.color,
    }));

    if (restTotal > 0) {
      data.push({ name: 'Other', value: Math.round(restTotal), color: '#D1D5DB' });
    }

    return data;
  })();

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-ink-800 text-white px-3 py-2 rounded-lg text-xs shadow-lg">
        <p className="font-medium">{payload[0].payload.month || payload[0].name}</p>
        <p className="font-mono mt-0.5">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  };

  if (!categories.length && !monthlyData.length) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Monthly spending bar chart */}
      {monthlyData.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-4">
            Monthly spending
          </h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#8F897E' }}
                axisLine={{ stroke: '#E2D9CA' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#8F897E' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#FAF7F2' }} />
              <Bar
                dataKey="total"
                fill="#B85450"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category pie chart */}
      {pieData.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-4">
            By category
          </h4>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1.5 text-xs text-ink-500">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
