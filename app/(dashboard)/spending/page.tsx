import { createServiceClient } from '@/app/lib/supabase';
import SpendingView from './SpendingView';

export const revalidate = 300;

async function getVisibleAccountIds(supabase: ReturnType<typeof createServiceClient>) {
  const { data } = await supabase
    .from('accounts')
    .select('id')
    .eq('is_hidden', false);
  return (data ?? []).map((a) => a.id);
}

async function getSpendingTransactions(months = 12) {
  const supabase = createServiceClient();
  const visibleIds = await getVisibleAccountIds(supabase);
  if (!visibleIds.length) return [];

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      id,
      amount,
      description,
      payee,
      memo,
      posted_at,
      account_id,
      is_transfer,
      account:accounts(id, name, institution),
      category:categories(id, name, color, icon, is_income)
    `)
    .in('account_id', visibleIds)
    .lt('amount', 0)
    .gte('posted_at', startDate.toISOString())
    .order('posted_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getMonthlySpending() {
  const supabase = createServiceClient();
  const visibleIds = await getVisibleAccountIds(supabase);
  if (!visibleIds.length) return [];

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 12);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, posted_at, account_id')
    .in('account_id', visibleIds)
    .lt('amount', 0)
    .eq('is_transfer', false)
    .gte('posted_at', startDate.toISOString())
    .order('posted_at');

  if (error) throw error;
  return data || [];
}

async function getMonthlyIncome(): Promise<number> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('user_settings')
      .select('monthly_income')
      .limit(1)
      .single();
    return Number(data?.monthly_income ?? 0);
  } catch {
    return 0;
  }
}

async function getBudgets(): Promise<Record<string, number>> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('category_budgets')
      .select('category_id, monthly_amount');
    const result: Record<string, number> = {};
    for (const row of data ?? []) result[row.category_id] = Number(row.monthly_amount);
    return result;
  } catch {
    return {};
  }
}

async function getSubscriptionOverrides(): Promise<Record<string, 'confirmed' | 'dismissed'>> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('subscription_overrides')
      .select('merchant_key, status');
    const result: Record<string, 'confirmed' | 'dismissed'> = {};
    for (const row of data ?? []) result[row.merchant_key] = row.status;
    return result;
  } catch {
    return {};
  }
}

async function getVenmoRequests() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('venmo_requests')
    .select('id, transaction_id, person_name, amount, status')
    .neq('status', 'settled');
  return data || [];
}

async function getAllCategories() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, color, icon, is_income')
    .order('is_income')
    .order('name');

  if (error) throw error;
  return data || [];
}

export default async function SpendingPage() {
  const [transactions, monthlyRaw, allCategories, venmoRequests, subscriptionOverrides, monthlyIncome, budgets] = await Promise.all([
    getSpendingTransactions(12),
    getMonthlySpending(),
    getAllCategories(),
    getVenmoRequests(),
    getSubscriptionOverrides(),
    getMonthlyIncome(),
    getBudgets(),
  ]);

  return (
    <SpendingView
      transactions={transactions as any}
      monthlyRaw={monthlyRaw}
      allCategories={allCategories}
      venmoRequests={venmoRequests}
      subscriptionOverrides={subscriptionOverrides}
      monthlyIncome={monthlyIncome}
      budgets={budgets}
    />
  );
}
