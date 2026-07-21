import { createServiceClient } from '@/app/lib/supabase';
import IncomePageClient from './IncomePageClient';

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
      id, amount, description, payee, memo, posted_at, account_id, is_transfer, is_reimbursable,
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

async function getDailyIncome(): Promise<{ date: string; amount: number }[]> {
  const supabase = createServiceClient();
  const visibleIds = await getVisibleAccountIds(supabase);
  if (!visibleIds.length) return [];

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 24);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, posted_at, category:categories(is_income)')
    .in('account_id', visibleIds)
    .gt('amount', 0)
    .eq('is_transfer', false)
    .gte('posted_at', startDate.toISOString())
    .order('posted_at', { ascending: true })
    .limit(10000);

  if (error) throw error;

  const byDay = new Map<string, number>();
  for (const t of (data ?? []) as any[]) {
    if (!t.category?.is_income) continue;
    const day = t.posted_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + Math.abs(Number(t.amount ?? 0)));
  }
  return Array.from(byDay.entries())
    .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default async function IncomePage() {
  const [transactions, categories, dailyIncome] = await Promise.all([
    getIncomeTransactions(12),
    getIncomeCategories(),
    getDailyIncome(),
  ]);

  return <IncomePageClient transactions={transactions as any} categories={categories} dailyIncome={dailyIncome} />;
}
