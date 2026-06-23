import { createServiceClient } from '@/app/lib/supabase';
import { formatCurrency } from '@/app/lib/utils';
import { getDailyCloses } from '@/app/lib/prices';
import HoldingsTable from './HoldingsTable';
import HoldingsInsights from './HoldingsInsights';
import InvestmentProgress from './InvestmentProgress';

export const dynamic = 'force-dynamic';

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
export interface InvestmentAccountSeries {
  id: string;
  institution: string;
  name: string;
  key: string;                 // breakdown key "institution — name"
  values: (number | null)[];   // aligned to `dates`; null before the account first appears
  currentValue: number;
  costBasis: number | null;    // sum of holdings cost basis for this account (null if none reported)
}

// Per-investment-account balance history, reconstructed from the per-account
// breakdown stored in each net-worth snapshot. The chart sums whichever accounts
// the user selects; cost basis (when known, i.e. brokerage holdings) powers the
// gain/loss-vs-cost-basis tooltip line.
async function getInvestmentData() {
  const supabase = createServiceClient();

  const { data: invAccounts } = await supabase
    .from('accounts')
    .select('id, institution, name, balance')
    .eq('account_type', 'investment')
    .eq('is_hidden', false)
    .order('balance', { ascending: false });

  const accounts = invAccounts ?? [];
  if (accounts.length === 0) return { dates: [], accounts: [] as InvestmentAccountSeries[] };

  // Cost basis per account (only brokerage accounts that report holdings have it).
  const { data: holdingRows } = await supabase
    .from('holdings')
    .select('account_id, cost_basis');
  const costByAccount = new Map<string, number>();
  for (const h of holdingRows ?? []) {
    const cb = Number(h.cost_basis ?? 0);
    if (!h.account_id || !cb) continue;
    costByAccount.set(h.account_id, (costByAccount.get(h.account_id) ?? 0) + cb);
  }

  const { data: snapshots } = await supabase
    .from('networth_snapshots')
    .select('snapshot_date, breakdown')
    .order('snapshot_date', { ascending: true })
    .limit(365);

  // Keep only snapshot dates where at least one investment account is present.
  const keyByAccount = new Map(accounts.map((a) => [a.id, `${a.institution} — ${a.name}`]));
  const rows = (snapshots ?? []).filter((snap) => {
    const b = (snap.breakdown ?? {}) as Record<string, number>;
    return accounts.some((a) => keyByAccount.get(a.id)! in b);
  });
  const dates = rows.map((r) => r.snapshot_date);

  const series: InvestmentAccountSeries[] = accounts.map((a) => {
    const key = keyByAccount.get(a.id)!;
    const values: (number | null)[] = new Array(dates.length).fill(null);
    let last: number | null = null;
    rows.forEach((snap, i) => {
      const b = (snap.breakdown ?? {}) as Record<string, number>;
      if (key in b) last = Number(b[key] ?? 0);
      values[i] = last; // carry forward; stays null until the account first appears
    });
    return {
      id: a.id,
      institution: a.institution,
      name: a.name,
      key,
      values,
      currentValue: Number(a.balance ?? 0),
      costBasis: costByAccount.get(a.id) ?? null,
    };
  });

  return { dates, accounts: series };
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
  const priceSeries = await getHoldingPriceSeries(holdings);

  // Override each holding's DB-stored market_value with the live price (shares × latest
  // Yahoo close). Series values are already shares × close, so we take the last non-null
  // entry. Holdings with no symbol (cash, etc.) keep their DB value.
  const liveHoldings = holdings.map((h) => {
    const vals = priceSeries.series[h.id];
    if (!vals) return h;
    let live: number | null = null;
    for (const v of vals) if (v !== null) live = v;
    if (live === null) return h;
    return { ...h, market_value: live };
  });

  const totalHoldingsValue = liveHoldings.reduce((sum, h) => sum + Number(h.market_value || 0), 0);
  const totalInvestmentValue = investment.accounts.reduce((sum, a) => sum + a.currentValue, 0);

  if (liveHoldings.length === 0 && totalInvestmentValue === 0) {
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

      <InvestmentProgress dates={investment.dates} accounts={investment.accounts} />

      {liveHoldings.length > 0 && (
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
            holdings={liveHoldings}
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
