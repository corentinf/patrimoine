import { createServiceClient } from '@/app/lib/supabase';
import { formatCurrency } from '@/app/lib/utils';
import NetWorthChart from './NetWorthChart';

export const revalidate = 300;

async function getNetWorthHistory() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('networth_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: true })
    .limit(365);

  if (error) throw error;
  return data || [];
}

async function getHoldings() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('holdings')
    .select(`
      *,
      account:accounts(name, institution)
    `)
    .order('market_value', { ascending: false });

  if (error) throw error;
  return data || [];
}

export default async function NetWorthPage() {
  const [history, holdings] = await Promise.all([
    getNetWorthHistory(),
    getHoldings(),
  ]);

  const latest = history[history.length - 1];

  // Collapse daily snapshots to monthly — last snapshot in each month wins
  const byMonth: Record<string, typeof history[0]> = {};
  for (const s of history) {
    const month = s.snapshot_date.substring(0, 7);
    byMonth[month] = s;
  }
  const monthlySnapshots = Object.values(byMonth).sort((a, b) =>
    a.snapshot_date.localeCompare(b.snapshot_date),
  );

  // Only show a delta once we have ≥2 monthly snapshots at least 20 days apart
  const hasReliableDelta =
    monthlySnapshots.length >= 2 &&
    (new Date(monthlySnapshots[monthlySnapshots.length - 1].snapshot_date).getTime() -
      new Date(monthlySnapshots[0].snapshot_date).getTime()) /
      86_400_000 >= 20;

  const previousMonthly = hasReliableDelta ? monthlySnapshots[monthlySnapshots.length - 2] : null;
  const change = hasReliableDelta && latest && previousMonthly
    ? Number(latest.net_worth) - Number(previousMonthly.net_worth)
    : null;

  const trackingStartDate = history.length > 0
    ? new Date(history[0].snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const chartData = monthlySnapshots.map((s) => ({
    month: new Date(s.snapshot_date + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    }),
    netWorth: Math.round(Number(s.net_worth)),
    assets: Math.round(Number(s.total_assets)),
    liabilities: Math.round(Number(s.total_liabilities)),
  }));

  const totalHoldingsValue = holdings.reduce(
    (sum, h) => sum + Number(h.market_value || 0),
    0
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ink-800">Net worth</h2>
          <p className="text-sm text-ink-400 mt-1">
            Your financial picture over time
          </p>
        </div>
        {latest && (
          <div className="sm:text-right">
            <p className="stat-label">Current</p>
            <p className="stat-value">
              {formatCurrency(Number(latest.net_worth))}
            </p>
            {change !== null ? (
              <p className={`text-xs font-mono mt-1 ${
                change > 0 ? 'text-accent-green' : change < 0 ? 'text-accent-red' : 'text-ink-300'
              }`}>
                {change > 0 ? '+' : ''}{formatCurrency(change)} since last month
              </p>
            ) : trackingStartDate && (
              <p className="text-xs text-ink-300 mt-1">
                Tracking started {trackingStartDate}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Net worth chart */}
      {chartData.length > 0 && (
        <NetWorthChart data={chartData} />
      )}

      {/* Asset/Liability breakdown from latest snapshot */}
      {latest?.breakdown && (
        <div>
          <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-3">
            Account breakdown
          </h3>
          <div className="card p-0 divide-y divide-sand-100">
            {Object.entries(latest.breakdown as Record<string, number>)
              .sort(([, a], [, b]) => b - a)
              .map(([name, balance]) => (
                <div
                  key={name}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <p className="text-sm text-ink-600">{name}</p>
                  <p className={`font-mono text-sm font-medium ${
                    balance >= 0 ? 'text-ink-700' : 'text-accent-red'
                  }`}>
                    {formatCurrency(balance)}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Investment holdings */}
      {holdings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            Investment holdings
            <span className="text-ink-300 font-normal">
              · {formatCurrency(totalHoldingsValue)}
            </span>
          </h3>
          <div className="card p-0">
            {/* Desktop header row */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2.5 border-b border-sand-100 text-xs text-ink-400 font-medium uppercase tracking-wider">
              <div className="col-span-3">Holding</div>
              <div className="col-span-1 text-right">Shares</div>
              <div className="col-span-2 text-right">Cost basis</div>
              <div className="col-span-2 text-right">Market value</div>
              <div className="col-span-2 text-right">Gain/Loss</div>
              <div className="col-span-2 text-right">Portfolio</div>
            </div>
            {holdings.map((h) => {
              const gain = Number(h.market_value || 0) - Number(h.cost_basis || 0);
              const gainPct = Number(h.cost_basis) > 0
                ? (gain / Number(h.cost_basis)) * 100
                : 0;
              const portfolioPct = totalHoldingsValue > 0
                ? (Number(h.market_value || 0) / totalHoldingsValue) * 100
                : 0;

              return (
                <div key={h.id} className="border-b border-sand-50 last:border-0 hover:bg-sand-50 transition-colors">
                  {/* Desktop row */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 items-center">
                    <div className="col-span-3">
                      <p className="text-sm font-medium text-ink-700">{h.symbol || h.description}</p>
                      <p className="text-xs text-ink-300 truncate">{h.description}</p>
                    </div>
                    <div className="col-span-1 text-right font-mono text-sm text-ink-600">{Number(h.shares).toFixed(2)}</div>
                    <div className="col-span-2 text-right font-mono text-sm text-ink-600">{formatCurrency(Number(h.cost_basis || 0))}</div>
                    <div className="col-span-2 text-right font-mono text-sm font-medium text-ink-700">{formatCurrency(Number(h.market_value || 0))}</div>
                    <div className={`col-span-2 text-right font-mono text-sm font-medium ${gain >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {gain >= 0 ? '+' : ''}{formatCurrency(gain)}
                      <span className="text-xs ml-1 opacity-70">({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)</span>
                    </div>
                    <div className="col-span-2 flex flex-col items-end gap-1">
                      <span className="font-mono text-xs text-ink-600">{portfolioPct.toFixed(1)}%</span>
                      <div className="w-full h-1 bg-sand-100 rounded-full overflow-hidden">
                        <div className="h-full bg-ink-400 rounded-full" style={{ width: `${portfolioPct}%` }} />
                      </div>
                    </div>
                  </div>
                  {/* Mobile card row */}
                  <div className="sm:hidden px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-700">{h.symbol || h.description}</p>
                      <p className="text-xs text-ink-400">{Number(h.shares).toFixed(2)} shares · {portfolioPct.toFixed(1)}% of portfolio</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-medium text-ink-700">{formatCurrency(Number(h.market_value || 0))}</p>
                      <p className={`font-mono text-xs font-medium ${gain >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {gain >= 0 ? '+' : ''}{formatCurrency(gain)} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Total row */}
            {(() => {
              const totalCost = holdings.reduce((s, h) => s + Number(h.cost_basis || 0), 0);
              const totalGain = totalHoldingsValue - totalCost;
              const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
              return (
                <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 border-t border-sand-200 bg-sand-50 rounded-b-xl items-center">
                  <div className="col-span-3 text-xs font-semibold text-ink-500 uppercase tracking-wider">Total</div>
                  <div className="col-span-1" />
                  <div className="col-span-2 text-right font-mono text-sm text-ink-600">{formatCurrency(totalCost)}</div>
                  <div className="col-span-2 text-right font-mono text-sm font-semibold text-ink-800">{formatCurrency(totalHoldingsValue)}</div>
                  <div className={`col-span-2 text-right font-mono text-sm font-semibold ${totalGain >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)}
                    <span className="text-xs ml-1 opacity-70">({totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(1)}%)</span>
                  </div>
                  <div className="col-span-2 text-right font-mono text-xs text-ink-400">100%</div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Empty state */}
      {chartData.length === 0 && (
        <div className="card text-center py-16">
          <p className="text-4xl mb-4">📈</p>
          <h3 className="font-display text-xl text-ink-700 mb-2">
            No snapshots yet
          </h3>
          <p className="text-ink-400 text-sm max-w-md mx-auto">
            Your net worth is tracked daily when the sync runs.
            Hit "Sync now" in the sidebar to capture your first snapshot.
          </p>
        </div>
      )}
    </div>
  );
}
