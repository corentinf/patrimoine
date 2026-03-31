import { createServiceClient } from './supabase';
import { fetchAccounts, inferAccountType, getInstitutionName } from './simplefin';
import type { SimpleFINAccount, SimpleFINTransaction, SimpleFINHolding } from './simplefin';

interface SyncResult {
  accountsUpdated: number;
  transactionsAdded: number;
  holdingsUpdated: number;
  snapshotCreated: boolean;
  errors: string[];
}

/**
 * Full sync: pull from SimpleFIN, upsert accounts + transactions + holdings,
 * auto-categorize new transactions, capture net worth snapshot.
 */
export async function syncAll(): Promise<SyncResult> {
  const supabase = createServiceClient();
  const result: SyncResult = {
    accountsUpdated: 0,
    transactionsAdded: 0,
    holdingsUpdated: 0,
    snapshotCreated: false,
    errors: [],
  };

  try {
    // Fetch last 90 days of data from SimpleFIN
    const startDate = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
    const data = await fetchAccounts(startDate);

    if (data.errors?.length) {
      result.errors.push(...data.errors);
    }

    // Upsert accounts
    for (const account of data.accounts) {
      const { error } = await supabase.from('accounts').upsert({
        id: account.id,
        name: account.name,
        institution: getInstitutionName(account),
        institution_domain: account.org.domain,
        account_type: inferAccountType(account),
        currency: account.currency,
        balance: parseFloat(account.balance),
        available_balance: account['available-balance']
          ? parseFloat(account['available-balance'])
          : null,
        balance_date: new Date(account['balance-date'] * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (error) {
        result.errors.push(`Account ${account.name}: ${error.message}`);
      } else {
        result.accountsUpdated++;
      }

      // Upsert transactions
      if (account.transactions?.length) {
        const txRows = account.transactions.map((tx) => ({
          id: tx.id,
          account_id: account.id,
          amount: parseFloat(tx.amount),
          description: tx.description,
          payee: tx.payee || null,
          memo: tx.memo || null,
          posted_at: new Date(tx.posted * 1000).toISOString(),
          transacted_at: tx.transacted_at
            ? new Date(tx.transacted_at * 1000).toISOString()
            : null,
        }));

        const { data: upserted, error: txError } = await supabase
          .from('transactions')
          .upsert(txRows, { onConflict: 'id', ignoreDuplicates: true })
          .select('id');

        if (txError) {
          result.errors.push(`Transactions for ${account.name}: ${txError.message}`);
        } else {
          result.transactionsAdded += upserted?.length || 0;
        }
      }

      // Upsert holdings (investment accounts)
      if (account.holdings?.length) {
        const holdingRows = account.holdings.map((h) => ({
          id: h.id,
          account_id: account.id,
          symbol: h.symbol || null,
          description: h.description,
          shares: h.shares ? parseFloat(h.shares) : null,
          cost_basis: h.cost_basis ? parseFloat(h.cost_basis) : null,
          market_value: h.market_value ? parseFloat(h.market_value) : null,
          purchase_price: h.purchase_price ? parseFloat(h.purchase_price) : null,
          currency: h.currency || 'USD',
          updated_at: new Date().toISOString(),
        }));

        const { error: hError } = await supabase
          .from('holdings')
          .upsert(holdingRows, { onConflict: 'id' });

        if (hError) {
          result.errors.push(`Holdings for ${account.name}: ${hError.message}`);
        } else {
          result.holdingsUpdated += holdingRows.length;
        }
      }
    }

    // Auto-categorize uncategorized transactions
    await autoCategorize(supabase);

    // Capture net worth snapshot
    await captureNetWorthSnapshot(supabase, data.accounts);
    result.snapshotCreated = true;

  } catch (err: any) {
    result.errors.push(err.message);
  }

  return result;
}

/**
 * Apply category rules to uncategorized transactions.
 */
async function autoCategorize(supabase: ReturnType<typeof createServiceClient>) {
  // Get all rules
  const { data: rules } = await supabase
    .from('category_rules')
    .select('*')
    .order('priority', { ascending: false });

  if (!rules?.length) return;

  // Get uncategorized transactions
  const { data: uncategorized } = await supabase
    .from('transactions')
    .select('id, payee, description, memo')
    .is('category_id', null);

  if (!uncategorized?.length) return;

  for (const tx of uncategorized) {
    for (const rule of rules) {
      const field = tx[rule.match_field as keyof typeof tx] as string;
      if (field && field.toLowerCase().includes(rule.match_pattern.toLowerCase())) {
        await supabase
          .from('transactions')
          .update({ category_id: rule.category_id })
          .eq('id', tx.id);
        break; // first match wins
      }
    }
  }
}

/**
 * Take a daily snapshot of net worth.
 */
async function captureNetWorthSnapshot(
  supabase: ReturnType<typeof createServiceClient>,
  accounts: SimpleFINAccount[]
) {
  const today = new Date().toISOString().split('T')[0];

  let totalAssets = 0;
  let totalLiabilities = 0;
  const breakdown: Record<string, number> = {};

  for (const account of accounts) {
    const balance = parseFloat(account.balance);
    const key = `${getInstitutionName(account)} — ${account.name}`;
    breakdown[key] = balance;

    if (balance >= 0) {
      totalAssets += balance;
    } else {
      totalLiabilities += Math.abs(balance);
    }
  }

  await supabase.from('networth_snapshots').upsert({
    snapshot_date: today,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    net_worth: totalAssets - totalLiabilities,
    breakdown,
  }, { onConflict: 'snapshot_date' });
}
