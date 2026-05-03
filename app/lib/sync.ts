import { createServiceClient } from './supabase';
import { plaidClient, mapAccountType } from './plaid';
import type { RemovedTransaction } from 'plaid';

interface SyncResult {
  accountsUpdated: number;
  transactionsAdded: number;
  holdingsUpdated: number;
  snapshotCreated: boolean;
  errors: string[];
}

export async function syncAll(userId: string): Promise<SyncResult> {
  const supabase = createServiceClient();
  const result: SyncResult = {
    accountsUpdated: 0,
    transactionsAdded: 0,
    holdingsUpdated: 0,
    snapshotCreated: false,
    errors: [],
  };

  try {
    await seedDefaultCategories(supabase, userId);

    const { data: items, error: itemsError } = await supabase
      .from('plaid_items')
      .select('*')
      .eq('user_id', userId);

    if (itemsError) throw itemsError;

    if (!items?.length) {
      result.errors.push('No Plaid items connected. Use the "Connect bank" button first.');
      return result;
    }

    for (const item of items) {
      // Sync accounts
      const accountsRes = await plaidClient.accountsGet({ access_token: item.access_token });

      for (const account of accountsRes.data.accounts) {
        const { error } = await supabase.from('accounts').upsert({
          id: account.account_id,
          user_id: userId,
          name: account.name,
          institution: item.institution_name ?? '',
          institution_domain: '',
          account_type: mapAccountType(account.type, account.subtype),
          currency: account.balances.iso_currency_code ?? 'USD',
          balance: account.balances.current ?? 0,
          available_balance: account.balances.available ?? null,
          balance_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        if (error) result.errors.push(`Account ${account.name}: ${error.message}`);
        else result.accountsUpdated++;
      }

      // Sync transactions using cursor-based /transactions/sync
      let cursor: string | undefined = item.cursor ?? undefined;
      let hasMore = true;

      while (hasMore) {
        const txRes = await plaidClient.transactionsSync({
          access_token: item.access_token,
          cursor,
        });
        const { added, modified, removed, next_cursor, has_more } = txRes.data;

        const toUpsert = [...added, ...modified].map((tx) => ({
          id: tx.transaction_id,
          user_id: userId,
          account_id: tx.account_id,
          // Plaid: positive amount = money leaving account; we store negative = expense
          amount: -tx.amount,
          description: tx.name,
          payee: tx.merchant_name ?? tx.name,
          memo: null as null,
          posted_at: new Date(tx.date).toISOString(),
          transacted_at: tx.authorized_date ? new Date(tx.authorized_date).toISOString() : null,
        }));

        if (toUpsert.length) {
          const { data: upserted, error: txError } = await supabase
            .from('transactions')
            .upsert(toUpsert, { onConflict: 'id', ignoreDuplicates: false })
            .select('id');
          if (txError) result.errors.push(`Transactions: ${txError.message}`);
          else result.transactionsAdded += added.length;
        }

        if (removed.length) {
          const removedIds = removed.map((r: RemovedTransaction) => r.transaction_id);
          await supabase
            .from('transactions')
            .delete()
            .in('id', removedIds)
            .eq('user_id', userId);
        }

        cursor = next_cursor;
        hasMore = has_more;
      }

      await supabase
        .from('plaid_items')
        .update({ cursor, last_synced_at: new Date().toISOString() })
        .eq('id', item.id);

      // Sync investment holdings (gracefully skip if not enabled for this item)
      try {
        const holdingsRes = await plaidClient.investmentsHoldingsGet({
          access_token: item.access_token,
        });

        const { holdings, securities } = holdingsRes.data;
        const secById = new Map(securities.map((s) => [s.security_id, s]));

        for (const holding of holdings) {
          const security = secById.get(holding.security_id);
          const { error: hError } = await supabase.from('holdings').upsert({
            id: `${holding.account_id}_${holding.security_id}`,
            user_id: userId,
            account_id: holding.account_id,
            symbol: security?.ticker_symbol ?? null,
            description: security?.name ?? null,
            shares: holding.quantity,
            cost_basis: holding.cost_basis ?? null,
            market_value: holding.institution_value,
            purchase_price:
              holding.cost_basis && holding.quantity
                ? holding.cost_basis / holding.quantity
                : null,
            currency: holding.iso_currency_code ?? 'USD',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

          if (hError) result.errors.push(`Holding: ${hError.message}`);
          else result.holdingsUpdated++;
        }
      } catch {
        // Investments product not enabled for this item — skip
      }
    }

    await autoCategorize(supabase, userId);
    await captureNetWorthSnapshot(supabase, userId);
    result.snapshotCreated = true;
  } catch (err: any) {
    result.errors.push(err.message);
  }

  return result;
}

async function seedDefaultCategories(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const { count } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count ?? 0) > 0) return;

  const defaults = [
    { name: 'Rent & Housing',    color: '#EF4444', icon: '🏠', is_income: false, sort_order: 1  },
    { name: 'Groceries',         color: '#F59E0B', icon: '🛒', is_income: false, sort_order: 2  },
    { name: 'Restaurants',       color: '#F97316', icon: '🍽️', is_income: false, sort_order: 3  },
    { name: 'Transport',         color: '#3B82F6', icon: '🚗', is_income: false, sort_order: 4  },
    { name: 'Health & Fitness',  color: '#10B981', icon: '💪', is_income: false, sort_order: 5  },
    { name: 'Shopping',          color: '#8B5CF6', icon: '🛍️', is_income: false, sort_order: 6  },
    { name: 'Entertainment',     color: '#EC4899', icon: '🎬', is_income: false, sort_order: 7  },
    { name: 'Travel',            color: '#06B6D4', icon: '✈️', is_income: false, sort_order: 8  },
    { name: 'Subscriptions',     color: '#6366F1', icon: '🔄', is_income: false, sort_order: 9  },
    { name: 'Utilities',         color: '#78716C', icon: '⚡', is_income: false, sort_order: 10 },
    { name: 'Insurance',         color: '#64748B', icon: '🛡️', is_income: false, sort_order: 11 },
    { name: 'Education',         color: '#14B8A6', icon: '📚', is_income: false, sort_order: 12 },
    { name: 'Gifts & Donations', color: '#A855F7', icon: '🎁', is_income: false, sort_order: 13 },
    { name: 'Personal Care',     color: '#F472B6', icon: '✨', is_income: false, sort_order: 14 },
    { name: 'Income - Salary',   color: '#22C55E', icon: '💰', is_income: true,  sort_order: 20 },
    { name: 'Income - Other',    color: '#16A34A', icon: '📈', is_income: true,  sort_order: 21 },
    { name: 'Transfer',          color: '#9CA3AF', icon: '↔️', is_income: false, sort_order: 30 },
    { name: 'Uncategorized',     color: '#D1D5DB', icon: '❓', is_income: false, sort_order: 99 },
  ];

  const { data: inserted, error } = await supabase
    .from('categories')
    .insert(defaults.map((c) => ({ ...c, user_id: userId })))
    .select('id, name');

  if (error || !inserted) return;

  const catId = (name: string) => inserted.find((c) => c.name === name)?.id;
  const rules = [
    { category_id: catId('Groceries'),        match_field: 'payee', match_pattern: 'whole foods',   priority: 10 },
    { category_id: catId('Groceries'),        match_field: 'payee', match_pattern: 'trader joe',    priority: 10 },
    { category_id: catId('Groceries'),        match_field: 'payee', match_pattern: 'safeway',       priority: 10 },
    { category_id: catId('Restaurants'),      match_field: 'payee', match_pattern: 'doordash',      priority: 10 },
    { category_id: catId('Restaurants'),      match_field: 'payee', match_pattern: 'uber eats',     priority: 10 },
    { category_id: catId('Transport'),        match_field: 'payee', match_pattern: 'uber',          priority: 5  },
    { category_id: catId('Transport'),        match_field: 'payee', match_pattern: 'lyft',          priority: 10 },
    { category_id: catId('Subscriptions'),    match_field: 'payee', match_pattern: 'netflix',       priority: 10 },
    { category_id: catId('Subscriptions'),    match_field: 'payee', match_pattern: 'spotify',       priority: 10 },
    { category_id: catId('Health & Fitness'), match_field: 'payee', match_pattern: 'planet granite', priority: 10 },
    { category_id: catId('Income - Salary'),  match_field: 'payee', match_pattern: 'capgemini',     priority: 10 },
    { category_id: catId('Rent & Housing'),   match_field: 'payee', match_pattern: 'rent',          priority: 5  },
    { category_id: catId('Utilities'),        match_field: 'payee', match_pattern: 'pg&e',          priority: 10 },
    { category_id: catId('Utilities'),        match_field: 'payee', match_pattern: 'comcast',       priority: 10 },
  ].filter((r) => r.category_id);

  if (rules.length) {
    await supabase.from('category_rules').insert(
      rules.map((r) => ({ ...r, user_id: userId })),
    );
  }
}

async function autoCategorize(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const { data: rules } = await supabase
    .from('category_rules')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: false });

  if (!rules?.length) return;

  const { data: uncategorized } = await supabase
    .from('transactions')
    .select('id, payee, description, memo')
    .eq('user_id', userId)
    .is('category_id', null);

  if (!uncategorized?.length) return;

  for (const tx of uncategorized) {
    for (const rule of rules) {
      const field = tx[rule.match_field as keyof typeof tx] as string;
      if (field && field.toLowerCase().includes(rule.match_pattern.toLowerCase())) {
        await supabase
          .from('transactions')
          .update({ category_id: rule.category_id })
          .eq('id', tx.id)
          .eq('user_id', userId);
        break;
      }
    }
  }
}

async function captureNetWorthSnapshot(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('name, institution, balance, account_type')
    .eq('user_id', userId)
    .eq('is_hidden', false);

  if (!accounts?.length) return;

  const today = new Date().toISOString().split('T')[0];
  let totalAssets = 0;
  let totalLiabilities = 0;
  const breakdown: Record<string, number> = {};

  for (const account of accounts) {
    const balance = Number(account.balance ?? 0);
    breakdown[`${account.institution} — ${account.name}`] = balance;
    if (account.account_type === 'credit') totalLiabilities += Math.abs(balance);
    else totalAssets += balance;
  }

  await supabase.from('networth_snapshots').upsert({
    user_id: userId,
    snapshot_date: today,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    net_worth: totalAssets - totalLiabilities,
    breakdown,
  }, { onConflict: 'user_id,snapshot_date' });
}
