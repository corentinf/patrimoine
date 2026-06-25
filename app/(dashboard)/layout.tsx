import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import Chat from '../components/Chat';
import { PrivacyProvider } from '../lib/privacy';
import { createServiceClient } from '../lib/supabase';

export const revalidate = 300;

async function getAccountsForSidebar() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('accounts')
    .select('id, name, institution, account_type, balance')
    .eq('is_hidden', false)
    .order('account_type')
    .order('institution');
  return data ?? [];
}

async function getMonthStats() {
  const supabase = createServiceClient();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [spendRes, incomeRes] = await Promise.all([
    supabase.from('transactions').select('amount').lt('amount', 0).eq('is_transfer', false).gte('posted_at', monthStart),
    supabase.from('transactions').select('amount').gt('amount', 0).eq('is_transfer', false).gte('posted_at', monthStart),
  ]);
  return {
    spending: Math.round((spendRes.data ?? []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0)),
    income: Math.round((incomeRes.data ?? []).reduce((s, t) => s + Number(t.amount), 0)),
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [accounts, monthStats] = await Promise.all([getAccountsForSidebar(), getMonthStats()]);
  const netWorth = accounts.reduce((s, a) => s + (a.account_type === 'credit' ? -Math.abs(Number(a.balance)) : Number(a.balance)), 0);
  const investmentTotal = accounts.filter((a) => a.account_type === 'investment').reduce((s, a) => s + Number(a.balance), 0);

  return (
    <PrivacyProvider>
      <div className="min-h-screen flex flex-col">
        <Header
          accounts={accounts}
          netWorth={netWorth}
          spending={monthStats.spending}
          income={monthStats.income}
          investmentTotal={investmentTotal}
        />

        <div className="flex-1 pt-14">
          <div className="max-w-screen-xl mx-auto px-6 lg:px-10 py-8">
            <main className="max-w-4xl">
              {children}
            </main>
          </div>
        </div>

        <Sidebar accounts={accounts} />
        <Chat />
      </div>
    </PrivacyProvider>
  );
}
