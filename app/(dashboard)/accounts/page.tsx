import { createServiceClient } from '@/app/lib/supabase';
import { formatCurrency, formatCurrencyPrecise, formatDate, accountTypeConfig } from '@/app/lib/utils';
import AccountCard from './AccountCard';
import TransactionList from './TransactionList';
import AddManualAccount from './AddManualAccount';

export const revalidate = 300; // revalidate every 5 minutes

async function getAccounts() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_hidden', false)
    .order('account_type')
    .order('institution');

  if (error) throw error;
  return data || [];
}

async function getRecentTransactions() {
  const supabase = createServiceClient();

  const { data: visibleAccounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('is_hidden', false);
  const visibleIds = (visibleAccounts ?? []).map((a) => a.id);
  if (!visibleIds.length) return [];

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      account:accounts(name, institution),
      category:categories(name, color, icon)
    `)
    .in('account_id', visibleIds)
    .order('posted_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return data || [];
}

export default async function AccountsPage() {
  const [accounts, transactions] = await Promise.all([
    getAccounts(),
    getRecentTransactions(),
  ]);

  // Calculate totals
  const assets = accounts
    .filter((a) => a.account_type !== 'credit')
    .reduce((sum, a) => sum + Number(a.balance), 0);

  const liabilities = accounts
    .filter((a) => a.account_type === 'credit')
    .reduce((sum, a) => sum + Math.abs(Number(a.balance)), 0);

  const netWorth = assets - liabilities;

  // Group accounts by type
  const grouped = accounts.reduce<Record<string, typeof accounts>>((acc, account) => {
    const type = account.account_type || 'checking';
    if (!acc[type]) acc[type] = [];
    acc[type].push(account);
    return acc;
  }, {});

  const typeOrder = ['checking', 'savings', 'investment', 'credit'];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="font-display text-2xl text-ink-800">Accounts</h2>
        <p className="text-sm text-ink-400 mt-1">
          All your accounts in one view
        </p>
      </div>

      {/* Net worth summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="card">
          <p className="stat-label">Total assets</p>
          <p className="stat-value text-accent-green mt-1">
            {formatCurrency(assets)}
          </p>
        </div>
        <div className="card">
          <p className="stat-label">Total liabilities</p>
          <p className="stat-value text-accent-red mt-1">
            {formatCurrency(liabilities)}
          </p>
        </div>
        <div className="card border-ink-800">
          <p className="stat-label">Net worth</p>
          <p className="stat-value mt-1">
            {formatCurrency(netWorth)}
          </p>
        </div>
      </div>

      {/* Account groups */}
      {typeOrder.map((type) => {
        const group = grouped[type];
        if (!group?.length) return null;
        const config = accountTypeConfig[type];

        return (
          <div key={type}>
            <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span>{config.icon}</span>
              {config.label}
              <span className="text-ink-300 font-normal">
                ({group.length})
              </span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.map((account) => (
                <AccountCard key={account.id} account={account} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Manual account entry */}
      <AddManualAccount />

      {/* Recent transactions */}
      <div>
        <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider mb-3">
          Recent transactions
        </h3>
        <TransactionList transactions={transactions} />
      </div>

      {/* Empty state */}
      {accounts.length === 0 && (
        <div className="card text-center py-16">
          <p className="text-4xl mb-4">🏦</p>
          <h3 className="font-display text-xl text-ink-700 mb-2">
            No accounts yet
          </h3>
          <p className="text-ink-400 text-sm max-w-md mx-auto mb-6">
            Click "+ Connect bank" in the sidebar to link your accounts via
            Plaid, then hit "Sync now" to pull in your transactions.
          </p>
        </div>
      )}
    </div>
  );
}
