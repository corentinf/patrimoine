import { createServiceClient } from '@/app/lib/supabase';
import IncomeView from './IncomeView';

export const revalidate = 300;

async function getVisibleAccountIds(supabase: ReturnType<typeof createServiceClient>) {
  const { data } = await supabase.from('accounts').select('id').eq('is_hidden', false);
  return (data ?? []).map((a) => a.id);
}

async function getIncomeTransactions(months = 12) {
  const supabase = createServiceClient();
  const visibleIds = await getVisibleAccountIds(supabase);
  if (!visibleIds.length) return [];

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      id, amount, description, payee, memo, posted_at, account_id, is_transfer,
      account:accounts(id, name, institution),
      category:categories(id, name, color, icon, is_income)
    `)
    .in('account_id', visibleIds)
    .gt('amount', 0)
    .eq('is_transfer', false)
    .gte('posted_at', startDate.toISOString())
    .order('posted_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).filter((tx: any) => tx.category?.is_income === true);
}

async function getIncomeCategories() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('categories')
    .select('id, name, color, icon, is_income, parent_id')
    .eq('is_income', true)
    .order('name');
  return data ?? [];
}

export default async function IncomePage() {
  const [transactions, categories] = await Promise.all([
    getIncomeTransactions(12),
    getIncomeCategories(),
  ]);

  return <IncomeView transactions={transactions as any} categories={categories} />;
}
