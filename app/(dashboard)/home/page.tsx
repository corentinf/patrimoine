import { createServiceClient } from '@/app/lib/supabase';
import HomeView from './HomeView';
import { isLockedRetirementAccount, isIraAccount } from '@/app/lib/accounts';
import { getDailyCloses, type Close } from '@/app/lib/prices';
import { buildInsights, type HoldingMove, type InsightTx } from '@/app/lib/insights';

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
    .select('id, name, mask, institution, institution_domain, custom_url, account_type, balance, balance_date')
    .eq('is_hidden', false)
    .order('account_type')
    .order('institution');
  return data ?? [];
}

// The user lives in San Francisco; "today" for the headline is their calendar day,
// not the server's (Vercel runs in UTC).
const TZ = 'America/Los_Angeles';
const todayInTz = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const todayLabelInTz = () =>
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'short', day: 'numeric' }).format(new Date());

// Last ~5 weeks of transactions: enough for "this week vs the previous three" comparisons.
async function getRecentTransactions(): Promise<InsightTx[]> {
  try {
    const supabase = createServiceClient();
    const since = new Date(Date.now() - 36 * 86_400_000).toISOString();
    const { data } = await supabase
      .from('transactions')
      .select(`
        id, amount, description, payee, posted_at, is_transfer, is_reimbursable,
        category:categories(name, icon, is_income),
        account:accounts(institution, name, is_hidden)
      `)
      .gte('posted_at', since)
      .order('posted_at', { ascending: false })
      .limit(3000);
    return ((data ?? []) as any[]).filter((tx) => tx.account?.is_hidden !== true) as InsightTx[];
  } catch {
    return []; // the headline is a nice-to-have; never let it break the page
  }
}

// One-session and five-session moves for the largest positions (Yahoo daily closes,
// cached 5 min by fetch). Capped at 4s so a slow quote API can't stall the page.
async function getHoldingMoves(): Promise<HoldingMove[]> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('holdings')
      .select('symbol, description, shares, market_value')
      .order('market_value', { ascending: false })
      .limit(40);

    const bySymbol = new Map<string, { name: string | null; shares: number; value: number }>();
    for (const h of data ?? []) {
      const sym = String(h.symbol ?? '').trim();
      if (!sym) continue;
      const row = bySymbol.get(sym) ?? { name: h.description ?? null, shares: 0, value: 0 };
      row.shares += Number(h.shares ?? 0);
      row.value += Number(h.market_value ?? 0);
      bySymbol.set(sym, row);
    }
    const top = Array.from(bySymbol.entries()).sort((a, b) => b[1].value - a[1].value).slice(0, 15);
    if (top.length === 0) return [];

    const closes = await Promise.race([
      getDailyCloses(top.map(([sym]) => sym)),
      new Promise<Record<string, Close[]>>((resolve) => setTimeout(() => resolve({}), 4000)),
    ]);

    const moves: HoldingMove[] = [];
    for (const [sym, pos] of top) {
      const series = closes[sym];
      if (!series || series.length < 3) continue;
      const last = series[series.length - 1];
      const prev = series[series.length - 2];
      if (!prev.close || !last.close) continue;
      const pct1d = last.close / prev.close - 1;
      const usd1d = pos.shares > 0 ? pos.shares * (last.close - prev.close) : (pos.value * pct1d) / (1 + pct1d);
      const five = series.length >= 6 ? series[series.length - 6] : null;
      const pct5d = five?.close ? last.close / five.close - 1 : null;
      const usd5d = five?.close
        ? (pos.shares > 0 ? pos.shares * (last.close - five.close) : null)
        : null;
      moves.push({ symbol: sym, name: pos.name, pct1d, usd1d, pct5d, usd5d, lastDate: last.date });
    }
    return moves;
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [history, accounts, recentTransactions, holdingMoves] = await Promise.all([
    getNetWorthHistory(),
    getAccounts(),
    getRecentTransactions(),
    getHoldingMoves(),
  ]);

  const insights = buildInsights({
    todayIso: todayInTz(),
    transactions: recentTransactions,
    movers: holdingMoves,
    netWorthHistory: history.map((h) => ({ snapshot_date: h.snapshot_date, net_worth: h.net_worth })),
    accounts: accounts.map((a) => ({
      id: a.id,
      institution: a.institution,
      name: a.name,
      account_type: a.account_type,
      balance_date: a.balance_date,
    })),
  });

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
  const avgMonthlyDelta = (field: 'net_worth' | 'total_assets' | 'total_liabilities'): number | null => {
    if (recentMonthly.length < 2) return null;
    const deltas: number[] = [];
    for (let i = 1; i < recentMonthly.length; i++) {
      deltas.push(Number(recentMonthly[i][field]) - Number(recentMonthly[i - 1][field]));
    }
    return deltas.reduce((s, v) => s + v, 0) / deltas.length;
  };
  const monthlyGrowthRate = avgMonthlyDelta('net_worth');
  const assetsGrowthRate = avgMonthlyDelta('total_assets');
  const liabilitiesGrowthRate = avgMonthlyDelta('total_liabilities');

  // Account summary by type
  const assets = accounts.filter((a) => a.account_type !== 'credit');
  const liabilities = accounts.filter((a) => a.account_type === 'credit');
  const totalAssets = assets.reduce((s, a) => s + Number(a.balance), 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + Math.abs(Number(a.balance)), 0);

  // Retirement/locked accounts (401k/IRA/HSA) aren't accessible without
  // penalty until retirement age — split them out so "available" reflects
  // money that's actually usable now. Matched by name/institution rather
  // than a fixed list so a newly-added 401k/IRA/HSA account is picked up
  // automatically.
  const isRetirementAccount = (a: (typeof accounts)[number]) =>
    isLockedRetirementAccount(a) || isIraAccount(a);
  const retirementBalance = assets
    .filter(isRetirementAccount)
    .reduce((s, a) => s + Number(a.balance), 0);
  const availableNetWorth = totalAssets - retirementBalance - totalLiabilities;

  // Milestone ETAs (total/available/retirement, each parameterized by a
  // monthly growth rate) are computed client-side in HomeView via the shared
  // buildMilestones (app/lib/projection.ts), so they can be re-derived
  // instantly when the user picks a different AI projection scenario there —
  // this page only needs to supply the raw balances and the fallback
  // recent-trend growth rates below.

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
      availableNetWorth={availableNetWorth}
      retirementBalance={retirementBalance}
      accounts={accounts}
      monthlyGrowthRate={monthlyGrowthRate}
      assetsGrowthRate={assetsGrowthRate}
      liabilitiesGrowthRate={liabilitiesGrowthRate}
      insights={insights}
      todayLabel={todayLabelInTz()}
    />
  );
}
