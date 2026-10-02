import Header from '../components/Header';
import MobileTopBar from '../components/MobileTopBar';
import Sidebar from '../components/Sidebar';
import Chat from '../components/Chat';
import Footer from '../components/Footer';
import { MerchantDrawerProvider } from '../components/MerchantDrawer';
import { KeyboardShortcutsProvider } from '../components/KeyboardShortcuts';
import { PrivacyProvider } from '../lib/privacy';
import { SyncStatusProvider } from '../lib/syncStatus';
import { GlobalFilterProvider } from '../lib/globalFilter';
import { PageFilterSlotProvider } from '../lib/pageFilterSlot';
import { createServiceClient } from '../lib/supabase';
import { getPersonalAmount } from '../lib/split';

export const revalidate = 300;

async function getAccountsForSidebar() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('accounts')
    .select('id, name, mask, institution, institution_domain, account_type, balance')
    .eq('is_hidden', false)
    .order('account_type')
    .order('institution');
  return data ?? [];
}

// Month-to-date totals for the Spending and Income tabs. They must follow the pages' own
// definitions, otherwise the tab and the page it opens disagree:
//   Spending (see spending/SpendingView): visible accounts, money out, excluding transfers,
//     income-category rows and the "Transfer" category, counting only YOUR share of split charges.
//   Income (see income/page): visible accounts, money in, income categories only — not refunds,
//     Venmo cash-outs or other positive amounts.
// "This month" is the user's calendar month (San Francisco), not the server's (UTC).
async function getMonthStats() {
  const supabase = createServiceClient();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const monthStr = today.slice(0, 7);

  const { data: visible } = await supabase.from('accounts').select('id').eq('is_hidden', false);
  const visibleIds = (visible ?? []).map((a) => a.id);
  if (visibleIds.length === 0) return { spending: 0, income: 0 };

  const { data } = await supabase
    .from('transactions')
    .select('amount, posted_at, is_transfer, is_shared, personal_percentage, account:accounts(is_shared, personal_percentage), category:categories(name, is_income)')
    .in('account_id', visibleIds)
    .gte('posted_at', `${monthStr}-01`)
    .limit(5000);

  let spending = 0;
  let income = 0;
  for (const tx of (data ?? []) as any[]) {
    if (String(tx.posted_at).slice(0, 7) !== monthStr || tx.is_transfer) continue;
    const amount = Number(tx.amount);
    if (amount < 0) {
      if (tx.category?.is_income || tx.category?.name === 'Transfer') continue;
      spending += Math.abs(getPersonalAmount(amount, tx.account, tx));
    } else if (amount > 0 && tx.category?.is_income) {
      income += amount;
    }
  }
  return { spending: Math.round(spending), income: Math.round(income) };
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
      <SyncStatusProvider>
        <GlobalFilterProvider>
          <PageFilterSlotProvider>
            <KeyboardShortcutsProvider>
              <MerchantDrawerProvider>
              <div className="min-h-screen flex flex-col">
                <Header
                  accounts={accounts}
                  netWorth={netWorth}
                  spending={monthStats.spending}
                  income={monthStats.income}
                  investmentTotal={investmentTotal}
                />
                <MobileTopBar />

                <div className="flex-1 max-w-[2000px] mx-auto px-4 md:px-6 lg:px-10 2xl:px-14 py-4 md:py-6 pb-24 md:pb-6 w-full">
                  <main>
                    {children}
                  </main>
                  <Footer />
                </div>

                <Chat />
                <Sidebar
                  netWorth={netWorth}
                  spending={monthStats.spending}
                  income={monthStats.income}
                  investmentTotal={investmentTotal}
                />
              </div>
              </MerchantDrawerProvider>
            </KeyboardShortcutsProvider>
          </PageFilterSlotProvider>
        </GlobalFilterProvider>
      </SyncStatusProvider>
    </PrivacyProvider>
  );
}
