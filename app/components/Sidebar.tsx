'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { AccountModal, AccountsPanel, type SidebarAccount } from './AccountsPanel';
import PlaidLinkButton from './PlaidLink';
import SimpleFINLinkButton from './SimpleFINLink';
import { usePrivacy } from '@/app/lib/privacy';
import { createBrowserClient } from '@/app/lib/supabase';

export type { SidebarAccount };

const navItems = [
  { href: '/home', label: 'Home' },
  { href: '/spending', label: 'Spending' },
  { href: '/income', label: 'Income' },
  { href: '/networth', label: 'Investment' },
];

function shortNum(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

interface SidebarProps {
  accounts: SidebarAccount[];
  netWorth?: number;
  spending?: number;
  income?: number;
  investmentTotal?: number;
}

function MobileSyncButton({ onDone }: { onDone?: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    setDone(false);
    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.done && event.ok) {
              setDone(true);
              setTimeout(() => { onDone?.(); window.location.reload(); }, 1500);
              return;
            }
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
      className="w-full flex items-center justify-between text-sm text-ink-600 hover:text-ink-800 px-4 py-3 rounded-xl hover:bg-sand-50 transition-colors disabled:opacity-40"
    >
      <span className="flex items-center gap-3">
        <span className={`text-base ${syncing ? 'animate-spin inline-block' : ''}`}>↻</span>
        Sync now
      </span>
      {done && <span className="text-xs text-green-600 font-medium">Done ✓</span>}
      {syncing && <span className="text-xs text-ink-400">Syncing…</span>}
    </button>
  );
}

export default function Sidebar({ accounts, netWorth = 0, spending = 0, income = 0, investmentTotal = 0 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { blurred, toggle: togglePrivacy } = usePrivacy();
  const [profileOpen, setProfileOpen] = useState(false);
  const [modalAccount, setModalAccount] = useState<SidebarAccount | null | undefined>(undefined);
  const sheetRef = useRef<HTMLDivElement>(null);

  const tabStats: Record<string, number> = {
    '/home': netWorth,
    '/spending': spending,
    '/income': income,
    '/networth': investmentTotal,
  };

  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  // Close profile sheet on route change
  useEffect(() => {
    setProfileOpen(false);
  }, [pathname]);

  return (
    <>
      {modalAccount !== undefined && (
        <AccountModal
          account={modalAccount}
          onClose={() => setModalAccount(undefined)}
          onSuccess={() => { router.refresh(); }}
        />
      )}

      {/* Mobile bottom nav — hidden on md+ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-sand-200 z-40 flex safe-area-bottom">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const stat = tabStats[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-3 transition-colors ${
                isActive ? 'text-ink-800' : 'text-ink-400'
              }`}
            >
              <span className={`text-xs font-semibold ${isActive ? 'text-ink-800' : 'text-ink-400'}`}>
                {item.label}
              </span>
              <span
                className={`text-[10px] font-mono ${isActive ? 'text-ink-500' : 'text-ink-300'}`}
                data-sensitive
              >
                {shortNum(stat)}
              </span>
            </Link>
          );
        })}

        {/* Profile tab */}
        <button
          onClick={() => setProfileOpen(true)}
          className={`flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-3 transition-colors ${
            profileOpen ? 'text-ink-800' : 'text-ink-400'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[10px] font-medium">Profile</span>
        </button>
      </nav>

      {/* Profile bottom sheet */}
      {profileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setProfileOpen(false)}
          />

          {/* Sheet */}
          <div
            ref={sheetRef}
            className="relative bg-white rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col"
          >
            {/* Handle + header */}
            <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-sand-100">
              <div className="w-10 h-1 bg-sand-300 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg text-ink-800">Patrimoine</h2>
                <button
                  onClick={() => setProfileOpen(false)}
                  className="p-1.5 text-ink-400 hover:text-ink-700 rounded-lg hover:bg-sand-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto divide-y divide-sand-100">
              {/* Accounts + net worth */}
              <div className="px-4 py-4">
                <AccountsPanel
                  accounts={accounts}
                  onEdit={(a) => setModalAccount(a)}
                  onAdd={() => setModalAccount(null)}
                />
              </div>

              {/* Privacy + settings */}
              <div className="px-2 py-3 space-y-1">
                <button
                  onClick={togglePrivacy}
                  className="w-full flex items-center justify-between text-sm text-ink-600 hover:text-ink-800 px-4 py-3 rounded-xl hover:bg-sand-50 transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {blurred
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                      }
                    </svg>
                    Privacy mode
                  </span>
                  <span className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${blurred ? 'bg-ink-700' : 'bg-sand-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${blurred ? 'translate-x-5' : 'translate-x-1'}`} />
                  </span>
                </button>
              </div>

              {/* Connections */}
              <div className="px-2 py-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 px-4 mb-2">Connections</p>
                <PlaidLinkButton />
                <SimpleFINLinkButton />
                <MobileSyncButton onDone={() => setProfileOpen(false)} />
              </div>

              {/* Sign out */}
              <div className="px-2 py-3">
                <button
                  onClick={handleSignOut}
                  className="w-full text-left text-sm text-ink-400 hover:text-red-500 px-4 py-3 rounded-xl hover:bg-sand-50 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>

            {/* Safe area bottom spacer */}
            <div className="flex-shrink-0 h-safe-bottom" />
          </div>
        </div>
      )}
    </>
  );
}
