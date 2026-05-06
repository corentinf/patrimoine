import { createServiceClient } from '@/app/lib/supabase';
import SpendingView from './SpendingView';

export const revalidate = 300;

async function getSpendingTransactions(months = 1) {
  const supabase = createServiceClient();
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
      account:accounts(id, name, institution),
      category:categories(id, name, color, icon, is_income)
    `)
    .lt('amount', 0)
    .gte('posted_at', startDate.toISOString())
    .order('posted_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getMonthlySpending() {
  const supabase = createServiceClient();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 12);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, posted_at, account_id')
    .lt('amount', 0)
    .gte('posted_at', startDate.toISOString())
    .order('posted_at');

  if (error) throw error;
  return data || [];
}

async function getVenmoRequests() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('venmo_requests')
    .select('transaction_id, person_name, status')
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
  const [transactions, monthlyRaw, allCategories, venmoRequests] = await Promise.all([
    getSpendingTransactions(1),
    getMonthlySpending(),
    getAllCategories(),
    getVenmoRequests(),
  ]);

  return (
    <SpendingView
      transactions={transactions as any}
      monthlyRaw={monthlyRaw}
      allCategories={allCategories}
      venmoRequests={venmoRequests}
    />
  );
}
