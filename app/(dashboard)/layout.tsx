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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const accounts = await getAccountsForSidebar();

  return (
    <PrivacyProvider>
      <div className="flex min-h-screen">
        <Sidebar accounts={accounts} />
        <main className="flex-1 min-w-0 w-full md:ml-56 p-4 md:p-8 max-w-6xl pb-28 md:pb-8 overflow-x-clip">
          {children}
        </main>
        <Chat />
      </div>
    </PrivacyProvider>
  );
}
