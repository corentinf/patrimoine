import { createServiceClient } from '@/app/lib/supabase';
import { formatCurrency } from '@/app/lib/utils';
import HoldingsTable from './HoldingsTable';
import HoldingsInsights from './HoldingsInsights';

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

export default async function NetWorthPage() {
  const holdings = await getHoldings();
  const totalHoldingsValue = holdings.reduce((sum, h) => sum + Number(h.market_value || 0), 0);

  if (holdings.length === 0) {
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
          <p className="stat-value" data-sensitive>{formatCurrency(totalHoldingsValue)}</p>
        </div>
      </div>

      <HoldingsTable holdings={holdings} totalHoldingsValue={totalHoldingsValue} />
      <HoldingsInsights />
    </div>
  );
}
