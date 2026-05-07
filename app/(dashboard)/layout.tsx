import Sidebar from '../components/Sidebar';
import Chat from '../components/Chat';
import { PrivacyProvider } from '../lib/privacy';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivacyProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 md:ml-56 p-4 md:p-8 max-w-6xl pb-20 md:pb-8">
          {children}
        </main>
        <Chat />
      </div>
    </PrivacyProvider>
  );
}
