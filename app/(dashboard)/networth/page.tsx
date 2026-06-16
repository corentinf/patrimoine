import { createServiceClient } from '@/app/lib/supabase';
import { formatCurrency } from '@/app/lib/utils';
import { getDailyCloses } from '@/app/lib/prices';
import HoldingsTable from './HoldingsTable';
import HoldingsInsights from './HoldingsInsights';
import InvestmentProgress from './InvestmentProgress';

export const revalidate = 300;

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

// Total investment value = the combined balance of every investment account
// (brokerages, 401k, HSA, …), not just the holdings that report per-line detail.
// There is no per-holding history, but each net-worth snapshot stores a per-account
// balance breakdown keyed `"<institution> — <name>"` (see captureNetWorthSnapshot in
// lib/sync.ts), so summing the investment-account entries reconstructs the trend.
async function getInvestmentData() {
  const supabase = createServiceClient();

  const { data: invAccounts } = await supabase
    .from('accounts')
    .select('institution, name, balance')
    .eq('account_type', 'investment')
    .eq('is_hidden', false);

  const accounts = invAccounts ?? [];
  const currentValue = accounts.reduce((sum, a) => sum + Number(a.balance ?? 0), 0);
  const keys = accounts.map((a) => `${a.institution} — ${a.name}`);
  if (keys.length === 0) return { series: [], currentValue: 0 };

  const { data: snapshots } = await supabase
    .from('networth_snapshots')
    .select('snapshot_date, breakdown')
    .order('snapshot_date', { ascending: true })
    .limit(365);

  // Build the series from a consistent basket: carry forward each account's last
  // known balance, and only start emitting points once *every* tracked account has
  // appeared at least once. This prevents a misleading jump when an account (e.g. a
  // 401k) is linked partway through the history.
  const lastKnown: Record<string, number> = {};
  const series: { date: string; value: number }[] = [];
  for (const snap of snapshots ?? []) {
    const breakdown = (snap.breakdown ?? {}) as Record<string, number>;
    for (const key of keys) {
      if (key in breakdown) lastKnown[key] = Number(breakdown[key] ?? 0);
    }
    if (keys.every((key) => key in lastKnown)) {
      const value = keys.reduce((sum, key) => sum + lastKnown[key], 0);
      series.push({ date: snap.snapshot_date, value });
    }
  }
  return { series, currentValue };
}

// Reconstruct each holding's value over the past ~year from historical close
// prices × current shares. Returns a shared ascending date axis plus a value
// array per holding aligned to it (last-known close carried forward; null
// before a holding's price history begins or when no price data exists).
async function getHoldingPriceSeries(holdings: { id: string; symbol: string | null; shares: number | string }[]) {
  const symbols = holdings.map((h) => h.symbol).filter((s): s is string => !!s);
  const closes = await getDailyCloses(symbols);

  const dateSet = new Set<string>();
  for (const sym of Object.keys(closes)) {
    for (const c of closes[sym]) dateSet.add(c.date);
  }
  const dates = Array.from(dateSet).sort();
  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  const series: Record<string, (number | null)[]> = {};
  for (const h of holdings) {
    const hist = h.symbol ? closes[h.symbol] : undefined;
    if (!hist || hist.length === 0) continue;
    const shares = Number(h.shares || 0);
    const values: (number | null)[] = new Array(dates.length).fill(null);
    // Place each close at its axis index, then forward-fill.
    for (const c of hist) {
      const i = dateIndex.get(c.date);
      if (i !== undefined) values[i] = c.close * shares;
    }
    let last: number | null = null;
    for (let i = 0; i < values.length; i++) {
      if (values[i] !== null) last = values[i];
      else values[i] = last;
    }
    series[h.id] = values;
  }

  return { dates, series };
}

export default async function NetWorthPage() {
  const [holdings, investment] = await Promise.all([
    getHoldings(),
    getInvestmentData(),
  ]);
  const totalHoldingsValue = holdings.reduce((sum, h) => sum + Number(h.market_value || 0), 0);
  const totalInvestmentValue = investment.currentValue;
  const priceSeries = await getHoldingPriceSeries(holdings);

  if (holdings.length === 0 && totalInvestmentValue === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="font-display text-2xl text-ink-800">Investment holdings</h2>
          <p className="text-sm text-ink-400 mt-1">Your portfolio breakdown</p>
        </div>
        <div className="card text-center py-16">
          <p className="text-4xl mb-4">📊</p>
          <h3 className="font-display text-xl text-ink-700 mb-2">No holdings yet</h3>
          <p className="text-ink-400 text-sm max-w-md mx-auto">
            Connect a brokerage account and sync to see your investment portfolio here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ink-800">Investment holdings</h2>
          <p className="text-sm text-ink-400 mt-1">Your portfolio breakdown</p>
        </div>
        <div className="sm:text-right">
          <p className="stat-label">Total value</p>
          <p className="stat-value" data-sensitive>{formatCurrency(totalInvestmentValue)}</p>
        </div>
      </div>

      <InvestmentProgress series={investment.series} currentValue={totalInvestmentValue} />

      {holdings.length > 0 && (
        <div className="space-y-2">
          {totalInvestmentValue - totalHoldingsValue > 1 && (
            <p className="text-xs text-ink-400">
              Line items below cover{' '}
              <span data-sensitive>{formatCurrency(totalHoldingsValue)}</span>. The remaining{' '}
              <span data-sensitive>{formatCurrency(totalInvestmentValue - totalHoldingsValue)}</span>{' '}
              is in accounts that don’t report individual holdings (e.g. 401k, HSA).
            </p>
          )}
          <HoldingsTable
            holdings={holdings}
            totalHoldingsValue={totalHoldingsValue}
            priceDates={priceSeries.dates}
            priceSeries={priceSeries.series}
          />
        </div>
      )}
      <HoldingsInsights />
    </div>
  );
}
