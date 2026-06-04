import { createServiceClient } from '@/app/lib/supabase';
import { formatCurrency } from '@/app/lib/utils';
import NetWorthChart from '../networth/NetWorthChart';

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

async function getAccounts() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('accounts')
    .select('id, name, institution, account_type, balance')
    .eq('is_hidden', false)
    .order('account_type')
    .order('institution');
  return data ?? [];
}

export default async function HomePage() {
  const [history, accounts] = await Promise.all([
    getNetWorthHistory(),
    getAccounts(),
  ]);

  const latest = history[history.length - 1];

  const byMonth: Record<string, typeof history[0]> = {};
  for (const s of history) {
    const month = s.snapshot_date.substring(0, 7);
    byMonth[month] = s;
  }
  const monthlySnapshots = Object.values(byMonth).sort((a, b) =>
    a.snapshot_date.localeCompare(b.snapshot_date),
  );

  const hasReliableDelta =
    monthlySnapshots.length >= 2 &&
    (new Date(monthlySnapshots[monthlySnapshots.length - 1].snapshot_date).getTime() -
      new Date(monthlySnapshots[0].snapshot_date).getTime()) /
      86_400_000 >= 20;

  const previousMonthly = hasReliableDelta ? monthlySnapshots[monthlySnapshots.length - 2] : null;
  const change =
    hasReliableDelta && latest && previousMonthly
      ? Number(latest.net_worth) - Number(previousMonthly.net_worth)
      : null;

  const trackingStartDate =
    history.length > 0
      ? new Date(history[0].snapshot_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
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

  const currentNetWorth = latest ? Number(latest.net_worth) : 0;

  // Monthly growth rate from last 3–4 monthly snapshots
  const recentMonthly = monthlySnapshots.slice(-4);
  let monthlyGrowthRate: number | null = null;
  if (recentMonthly.length >= 2) {
    const growthValues: number[] = [];
    for (let i = 1; i < recentMonthly.length; i++) {
      growthValues.push(Number(recentMonthly[i].net_worth) - Number(recentMonthly[i - 1].net_worth));
    }
    monthlyGrowthRate = growthValues.reduce((s, v) => s + v, 0) / growthValues.length;
  }

  const milestoneTargets = [
    100_000, 250_000, 300_000, 400_000, 500_000, 750_000, 1_000_000,
  ].filter((t) => t > currentNetWorth * 0.5);

  const milestones = milestoneTargets.slice(0, 5).map((target) => {
    const passed = currentNetWorth >= target;
    const pct = passed ? 100 : Math.min((currentNetWorth / target) * 100, 100);
    let eta: string | null = null;
    if (!passed && monthlyGrowthRate !== null && monthlyGrowthRate > 0) {
      const monthsNeeded = (target - currentNetWorth) / monthlyGrowthRate;
      const etaDate = new Date();
      etaDate.setMonth(etaDate.getMonth() + Math.ceil(monthsNeeded));
      eta = etaDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    return { target, passed, pct, eta };
  });

  // Account summary by type
  const assets = accounts.filter((a) => a.account_type !== 'credit');
  const liabilities = accounts.filter((a) => a.account_type === 'credit');
  const totalAssets = assets.reduce((s, a) => s + Number(a.balance), 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + Math.abs(Number(a.balance)), 0);

  if (chartData.length === 0 && accounts.length === 0) {
    return (
      <div className="card text-center py-16">
        <p className="text-4xl mb-4">📈</p>
        <h3 className="font-display text-xl text-ink-700 mb-2">No data yet</h3>
        <p className="text-ink-400 text-sm max-w-md mx-auto">
          Sync your accounts to start tracking your net worth over time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ink-800">Net worth</h2>
          <p className="text-sm text-ink-400 mt-1">Your financial picture over time</p>
        </div>
        {latest && (
          <div className="sm:text-right">
            <p className="stat-label">Current</p>
            <p className="stat-value" data-sensitive>{formatCurrency(currentNetWorth)}</p>
            {change !== null ? (
              <p className={`text-xs font-mono mt-1 ${change > 0 ? 'text-accent-green' : change < 0 ? 'text-accent-red' : 'text-ink-300'}`}>
                {change > 0 ? '+' : ''}{formatCurrency(change)} since last month
              </p>
            ) : trackingStartDate ? (
              <p className="text-xs text-ink-300 mt-1">Tracking since {trackingStartDate}</p>
            ) : null}
          </div>
        )}
      </div>

      {/* Chart */}
      {chartData.length > 0 && <NetWorthChart data={chartData} />}

      {/* Account summary */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="card px-5 py-4">
            <p className="stat-label">Assets</p>
            <p className="stat-value text-xl mt-1" data-sensitive>{formatCurrency(totalAssets)}</p>
            <p className="text-xs text-ink-300 mt-0.5">{assets.length} account{assets.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="card px-5 py-4">
            <p className="stat-label">Liabilities</p>
            <p className="stat-value text-xl mt-1 text-accent-red" data-sensitive>
              {totalLiabilities > 0 ? formatCurrency(totalLiabilities) : '—'}
            </p>
            <p className="text-xs text-ink-300 mt-0.5">
              {liabilities.length > 0 ? `${liabilities.length} account${liabilities.length !== 1 ? 's' : ''}` : 'None'}
            </p>
          </div>
          <div className="card px-5 py-4 col-span-2 sm:col-span-1">
            <p className="stat-label">Net worth</p>
            <p className="stat-value text-xl mt-1" data-sensitive>{formatCurrency(currentNetWorth)}</p>
            {change !== null && (
              <p className={`text-xs font-mono mt-0.5 ${change > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {change > 0 ? '+' : ''}{formatCurrency(change)} MoM
              </p>
            )}
          </div>
        </div>
      )}

      {/* Milestones */}
      {milestones.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-3">Milestones</h3>
          <div className="card p-0 divide-y divide-sand-100">
            {milestones.map(({ target, passed, pct, eta }) => (
              <div key={target} className="px-5 py-3.5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-sm font-medium ${passed ? 'text-ink-400 line-through' : 'text-ink-700'}`}>
                      {formatCurrency(target)}
                    </span>
                    <span className="text-xs text-ink-300 font-mono">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-sand-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${passed ? 'bg-accent-green' : 'bg-ink-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right w-28">
                  {passed ? (
                    <span className="inline-flex items-center gap-1 text-xs text-accent-green font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Reached
                    </span>
                  ) : eta ? (
                    <span className="text-xs text-ink-400">~{eta}</span>
                  ) : (
                    <span className="text-xs text-ink-300">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
