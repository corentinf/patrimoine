import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import AccountsWidget from '../components/AccountsPanel';
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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const accounts = await getAccountsForSidebar();

  return (
    <PrivacyProvider>
      <div className="min-h-screen flex flex-col">
        <Header />

        <div className="flex-1 pt-14">
          <div className="max-w-screen-xl mx-auto px-6 lg:px-10 py-8 flex gap-10 items-start">
            <main className="flex-1 min-w-0 max-w-4xl">
              {children}
            </main>

            <aside className="hidden xl:block w-64 flex-shrink-0">
              <div className="sticky top-20">
                <AccountsWidget accounts={accounts} />
              </div>
            </aside>
          </div>
        </div>

        <Sidebar accounts={accounts} />
        <Chat />
      </div>
    </PrivacyProvider>
  );
}
