'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/app/lib/utils';
import { usePrivacy } from '@/app/lib/privacy';

interface SpendingChartsProps {
  categories: Array<{
    id?: string;
    name: string;
    color: string;
    icon: string;
    total: number;
    count: number;
  }>;
  monthlyData: Array<{
    month: string;
    monthKey?: string;
    total: number;
    isCurrentMonth?: boolean;
  }>;
  totalSpending: number;
  selectedCategoryKey?: string | null;
  onCategoryClick?: (id: string) => void;
  barColor?: string;
  barLabel?: string;
  onBarClick?: (monthKey: string) => void;
  selectedMonth?: string | null;
}

function BlurredYTick({ x, y, payload, formatter, blurred }: any) {
  return (
    <text x={x} y={y} dy={4} fill="#8F897E" fontSize={11} textAnchor="end"
      style={blurred ? { filter: 'blur(5px)', userSelect: 'none' } : {}}>
      {formatter(payload.value)}
    </text>
  );
}

export default function SpendingCharts({
  categories,
  monthlyData,
  totalSpending,
  selectedCategoryKey,
  onCategoryClick,
  barColor = '#B85450',
  barLabel = 'Monthly spending',
  onBarClick,
  selectedMonth,
}: SpendingChartsProps) {
  const { blurred } = usePrivacy();
  // Take top 8 categories for pie chart, group rest as "Other"
  const pieData = (() => {
    const top = categories.slice(0, 8);
    const rest = categories.slice(8);
    const restTotal = rest.reduce((sum, c) => sum + c.total, 0);

    const data = top.map((c) => ({
      id: c.id,
      name: c.name,
      value: Math.round(c.total),
      color: c.color,
    }));

    if (restTotal > 0) {
      data.push({ id: undefined, name: 'Other', value: Math.round(restTotal), color: '#D1D5DB' });
    }

    return data;
  })();

  // One dominant category (e.g. rent) can shrink every other slice to a
  // sliver. As in SpendingProgress's bar chart, compare against the median
  // (not just the runner-up) so multiple similarly-large slices are all
  // caught, and let the user flip back to the true proportions.
  const [forceFullScale, setForceFullScale] = useState(false);
  const autoPieCap = useMemo(() => {
    const values = pieData.map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b);
    if (values.length < 4) return null;
    const max = values[values.length - 1];
    const median = values[Math.floor(values.length / 2)];
    const ceiling = median * 4;
    if (max <= ceiling * 1.15) return null;
    return ceiling;
  }, [pieData]);
  const pieCap = forceFullScale ? null : autoPieCap;
  const displayPieData = pieData.map((d) => ({
    ...d,
    displayValue: pieCap ? Math.min(d.value, pieCap) : d.value,
    capped: pieCap != null && d.value > pieCap,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    // The arc's own dataKey is a display value clamped for outlier-capping —
    // the tooltip always shows the true amount from the underlying data point.
    const trueValue = payload[0].payload?.value ?? payload[0].value;
    return (
      <div className="bg-ink-800 text-white px-3 py-2 rounded-lg text-xs shadow-lg">
        <p className="font-medium">{payload[0].payload.month || payload[0].name}</p>
        <p className="font-mono mt-0.5">{formatCurrency(trueValue)}</p>
      </div>
    );
  };

  return (
    <div className={`h-full ${monthlyData.length > 0 ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''}`}>
      {/* Monthly spending bar chart */}
      {monthlyData.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-4">
            {barLabel}
          </h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={monthlyData}
              margin={{ top: 0, right: 0, bottom: 0, left: -20 }}
              style={{ cursor: onBarClick ? 'pointer' : 'default' }}
              onClick={(chartData: any) => {
                const monthKey = chartData?.activePayload?.[0]?.payload?.monthKey;
                if (monthKey && onBarClick) onBarClick(monthKey);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE1" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#8F897E' }}
                axisLine={{ stroke: '#E2D9CA' }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={(props) => <BlurredYTick {...props} formatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} blurred={blurred} />}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#FAF7F2' }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {monthlyData.map((entry, i) => {
                  const isSelected = !!selectedMonth && entry.monthKey === selectedMonth;
                  const hasSelection = !!selectedMonth;
                  const fillOpacity = hasSelection
                    ? (isSelected ? 1 : 0.3)
                    : (entry.isCurrentMonth ? 0.4 : 1);
                  return <Cell key={i} fill={barColor} fillOpacity={fillOpacity} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category pie chart — always rendered (even with no data for the
          current period) so the container never disappears/reappears and
          shifts the page; height matches the chart card next to it via h-full. */}
      <div className="card h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold text-ink-500 uppercase tracking-wider">
            By category
          </h4>
          {autoPieCap != null && (
            <button
              onClick={() => setForceFullScale((v) => !v)}
              title={forceFullScale
                ? 'Showing true proportions — a big category is squashing the rest. Click to normalize it.'
                : 'A big category is being scaled down so the rest stay comparable. Click to see the true proportions.'}
              className="px-2.5 py-1 rounded-lg bg-sand-100 text-xs font-medium text-ink-500 hover:text-ink-700 hover:bg-sand-200 transition-colors"
            >
              {forceFullScale ? 'Normalize' : 'True scale'}
            </button>
          )}
        </div>
        {pieData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={displayPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey={pieCap ? 'displayValue' : 'value'}
                  animationDuration={400}
                  onClick={(_, index) => {
                    const item = displayPieData[index];
                    if (item?.id && onCategoryClick) onCategoryClick(item.id);
                  }}
                  style={{ cursor: onCategoryClick ? 'pointer' : 'default' }}
                >
                  {displayPieData.map((entry, i) => {
                    const isSelected = !!entry.id && entry.id === selectedCategoryKey;
                    const hasSelection = !!selectedCategoryKey;
                    return (
                      <Cell
                        key={i}
                        fill={entry.color}
                        stroke={isSelected ? entry.color : 'white'}
                        strokeWidth={isSelected ? 3 : 2}
                        strokeDasharray={entry.capped ? '3 2' : undefined}
                        fillOpacity={hasSelection && !isSelected ? 0.35 : 1}
                      />
                    );
                  })}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend — min-h reserves space for the max row count (up to 8
                categories + "Other") so narrowing the data (e.g. hovering a
                single bar) doesn't shrink the card and shift the page. */}
            <div className="flex-1 flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center min-h-24 content-start">
              {displayPieData.map((entry) => {
                const isSelected = !!entry.id && entry.id === selectedCategoryKey;
                const hasSelection = !!selectedCategoryKey;
                return (
                  <button
                    key={entry.name}
                    onClick={() => entry.id && onCategoryClick?.(entry.id)}
                    disabled={!entry.id}
                    title={entry.capped ? `Slice scaled down — actual: ${formatCurrency(entry.value)}` : undefined}
                    className={`flex items-center gap-1.5 text-xs transition-opacity ${
                      hasSelection && !isSelected ? 'opacity-35' : 'opacity-100'
                    } ${entry.id ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'} ${
                      isSelected ? 'font-semibold' : 'text-ink-500'
                    }`}
                    style={isSelected ? { color: entry.color } : {}}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    {entry.name}
                    <span className={`font-mono ${isSelected ? 'text-white/80' : 'text-ink-400'}`}>
                      {formatCurrency(entry.value)}
                    </span>
                    {entry.capped && <span className="text-ink-300" title="Slice scaled down for readability">✂</span>}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 min-h-[336px] flex items-center justify-center text-xs text-ink-400">
            No spending in this period.
          </div>
        )}
      </div>
    </div>
  );
}
