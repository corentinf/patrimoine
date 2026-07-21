import { createServiceClient } from '@/app/lib/supabase';
import HomeView from './HomeView';

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

  const trackingStartDate =
    history.length > 0
      ? new Date(history[0].snapshot_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null;

  const currentNetWorth = latest ? Number(latest.net_worth) : 0;

  // Monthly growth rate from last 3–4 monthly snapshots — the milestone
  // projection is a current-trajectory estimate and isn't scoped to
  // whatever period the header filter has selected.
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

  if (history.length === 0 && accounts.length === 0) {
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
    <HomeView
      history={history}
      currentNetWorth={currentNetWorth}
      trackingStartDate={trackingStartDate}
      totalAssets={totalAssets}
      totalLiabilities={totalLiabilities}
      assetsCount={assets.length}
      liabilitiesCount={liabilities.length}
      milestones={milestones}
    />
  );
}
