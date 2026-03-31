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
  const previous = history[history.length - 2];

  const change = latest && previous
    ? Number(latest.net_worth) - Number(previous.net_worth)
    : 0;

  const chartData = history.map((s) => ({
    date: new Date(s.snapshot_date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
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
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl text-ink-800">Net worth</h2>
          <p className="text-sm text-ink-400 mt-1">
            Your financial picture over time
          </p>
        </div>
        {latest && (
          <div className="text-right">
            <p className="stat-label">Current</p>
            <p className="stat-value">
              {formatCurrency(Number(latest.net_worth))}
            </p>
            {change !== 0 && (
              <p className={`text-xs font-mono mt-1 ${
                change > 0 ? 'text-accent-green' : 'text-accent-red'
              }`}>
                {change > 0 ? '+' : ''}{formatCurrency(change)} since last snapshot
              </p>
            )}
          </div>
        )}
      </div>

      {/* Net worth chart */}
      {chartData.length > 1 && (
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
            {/* Header row */}
            <div className="grid grid-cols-12 gap-2 px-5 py-2.5 border-b border-sand-100 text-xs text-ink-400 font-medium uppercase tracking-wider">
              <div className="col-span-4">Holding</div>
              <div className="col-span-2 text-right">Shares</div>
              <div className="col-span-2 text-right">Cost basis</div>
              <div className="col-span-2 text-right">Market value</div>
              <div className="col-span-2 text-right">Gain/Loss</div>
            </div>
            {/* Rows */}
            {holdings.map((h) => {
              const gain = Number(h.market_value || 0) - Number(h.cost_basis || 0);
              const gainPct = Number(h.cost_basis) > 0
                ? (gain / Number(h.cost_basis)) * 100
                : 0;

              return (
                <div
                  key={h.id}
                  className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-sand-50 hover:bg-sand-50 transition-colors"
                >
                  <div className="col-span-4">
                    <p className="text-sm font-medium text-ink-700">
                      {h.symbol || h.description}
                    </p>
                    <p className="text-xs text-ink-300 truncate">
                      {h.description}
                    </p>
                  </div>
                  <div className="col-span-2 text-right font-mono text-sm text-ink-600">
                    {Number(h.shares).toFixed(2)}
                  </div>
                  <div className="col-span-2 text-right font-mono text-sm text-ink-600">
                    {formatCurrency(Number(h.cost_basis || 0))}
                  </div>
                  <div className="col-span-2 text-right font-mono text-sm font-medium text-ink-700">
                    {formatCurrency(Number(h.market_value || 0))}
                  </div>
                  <div className={`col-span-2 text-right font-mono text-sm font-medium ${
                    gain >= 0 ? 'text-accent-green' : 'text-accent-red'
                  }`}>
                    {gain >= 0 ? '+' : ''}{formatCurrency(gain)}
                    <span className="text-xs ml-1 opacity-70">
                      ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              );
            })}
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
