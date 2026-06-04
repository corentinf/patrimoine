'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AccountModal, AccountsPanel, type SidebarAccount } from './AccountsPanel';

export type { SidebarAccount };

const navItems = [
  { href: '/home', label: 'Home', icon: '⌂' },
  { href: '/spending', label: 'Spending', icon: '◧' },
  { href: '/income', label: 'Income', icon: '↑' },
  { href: '/networth', label: 'Investment', icon: '◆' },
];

function MobileSyncButton() {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.done && event.ok) { setTimeout(() => window.location.reload(), 500); return; }
          } catch {}
        }
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="flex-1 flex flex-col items-center gap-1 py-2.5 text-ink-400 transition-colors disabled:opacity-40"
    >
      <span className={`text-lg leading-none ${syncing ? 'animate-spin' : ''}`}>↻</span>
      <span className="text-[10px] font-medium">Sync</span>
    </button>
  );
}

function MobileProfileMenu() {
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    const { createBrowserClient } = await import('@/app/lib/supabase');
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div className="relative flex-1 flex items-center justify-center">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex flex-col items-center gap-1 py-2.5 text-ink-400"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span className="text-[10px] font-medium">Profile</span>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 w-52 bg-white border border-sand-200 rounded-xl shadow-lg py-1.5 z-50">
          <div className="border-t border-sand-100 pt-1.5 px-2">
            <button
              onClick={handleSignOut}
              className="w-full text-left text-xs text-ink-400 hover:text-ink-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-sand-50"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ accounts }: { accounts: SidebarAccount[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileAccountsOpen, setMobileAccountsOpen] = useState(false);
  const [modalAccount, setModalAccount] = useState<SidebarAccount | null | undefined>(undefined);

  function openAdd() { setModalAccount(null); }
  function openEdit(a: SidebarAccount) { setModalAccount(a); }
  function closeModal() { setModalAccount(undefined); }
  function handleModalSuccess() { router.refresh(); }

  return (
    <>
      {modalAccount !== undefined && (
        <AccountModal
          account={modalAccount}
          onClose={closeModal}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-sand-200 z-50 flex pb-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors ${
                isActive ? 'text-ink-800' : 'text-ink-400'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMobileAccountsOpen(true)}
          className="flex-1 flex flex-col items-center gap-1 py-2.5 text-ink-400 hover:text-ink-600 transition-colors"
        >
          <span className="text-lg leading-none">◉</span>
          <span className="text-[10px] font-medium">Accounts</span>
        </button>
        <MobileSyncButton />
        <MobileProfileMenu />
      </nav>

      {/* Mobile accounts drawer */}
      {mobileAccountsOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileAccountsOpen(false)}
          />
          <aside className="absolute right-0 top-0 bottom-0 w-[85%] max-w-sm bg-white border-l border-sand-200 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-sand-100">
              <h2 className="font-display text-lg text-ink-800">Accounts</h2>
              <button
                onClick={() => setMobileAccountsOpen(false)}
                className="p-1 text-ink-400 hover:text-ink-700"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3">
              <AccountsPanel accounts={accounts} onEdit={openEdit} onAdd={openAdd} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
