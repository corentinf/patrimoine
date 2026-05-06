'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { createBrowserClient } from '@/app/lib/supabase';
import PlaidLinkButton from './PlaidLink';
import SimpleFINLinkButton from './SimpleFINLink';

const navItems = [
  { href: '/accounts', label: 'Accounts', icon: '◉' },
  { href: '/spending', label: 'Spending', icon: '◧' },
  { href: '/networth', label: 'Net worth', icon: '◆' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 h-screen w-56 bg-white border-r border-sand-200 flex-col z-10">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-sand-100">
          <h1 className="font-display text-xl text-ink-800 tracking-tight">
            Patrimoine
          </h1>
          <p className="text-xs text-ink-300 mt-0.5 font-body">
            personal finance
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-150
                  ${isActive
                    ? 'bg-sand-100 text-ink-800'
                    : 'text-ink-400 hover:text-ink-600 hover:bg-sand-50'
                  }
                `}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 py-4 border-t border-sand-100 space-y-2">
          <PlaidLinkButton />
          <SimpleFINLinkButton />
          <SyncButton />
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-sand-200 z-20 flex">
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
        <MobileSyncButton />
      </nav>
    </>
  );
}

function MobileSyncButton() {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });
      const data = await res.json();
      if (data.ok) setTimeout(() => window.location.reload(), 500);
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

type SyncPhase = 'idle' | 'syncing' | 'done' | 'error';

interface SyncResult {
  accountsUpdated: number;
  transactionsAdded: number;
  holdingsUpdated: number;
  categorized: number;
  accountsSynced: string[];
  errors: string[];
}

function SyncButton() {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [result, setResult] = useState<SyncResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSync = async () => {
    setPhase('syncing');
    setResult(null);
    setErrorMsg('');

    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });
      const text = await res.text();

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        setErrorMsg(`Server error (${res.status}):\n${text.slice(0, 800)}`);
        setPhase('error');
        return;
      }

      if (data.ok) {
        setResult(data);
        setPhase('done');
        setTimeout(() => window.location.reload(), 3000);
      } else {
        setErrorMsg(data.error || 'Sync failed');
        setPhase('error');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Sync failed');
      setPhase('error');
    }
  };

  const reset = () => { setPhase('idle'); setResult(null); setErrorMsg(''); };

  if (phase === 'idle') {
    return (
      <button onClick={handleSync} className="w-full btn-secondary text-xs justify-center">
        ↻ Sync now
      </button>
    );
  }

  if (phase === 'syncing') {
    return (
      <div className="rounded-lg border border-sand-200 bg-sand-50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-ink-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium text-ink-600">Syncing…</span>
        </div>
        <div className="space-y-1 text-xs text-ink-400">
          <p>Fetching accounts & balances</p>
          <p>Pulling new transactions</p>
          <p>Running AI categorization</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
        <p className="text-xs font-medium text-red-600">Sync failed</p>
        <pre className="text-xs text-red-400 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{errorMsg}</pre>
        <button onClick={reset} className="text-xs text-ink-400 hover:text-ink-600">Try again</button>
      </div>
    );
  }

  // done
  return (
    <div className="rounded-lg border border-accent-green/30 bg-green-50 p-3 space-y-2">
      <p className="text-xs font-medium text-green-700">Sync complete</p>
      <ul className="space-y-1">
        {result!.accountsSynced.map((name) => (
          <li key={name} className="text-xs text-ink-500 flex items-center gap-1.5">
            <span className="text-green-500">✓</span> {name}
          </li>
        ))}
        {result!.transactionsAdded > 0 && (
          <li className="text-xs text-ink-500 flex items-center gap-1.5">
            <span className="text-green-500">✓</span> {result!.transactionsAdded} new transactions
          </li>
        )}
        {result!.categorized > 0 && (
          <li className="text-xs text-ink-500 flex items-center gap-1.5">
            <span className="text-green-500">✓</span> {result!.categorized} transactions categorized
          </li>
        )}
        {result!.holdingsUpdated > 0 && (
          <li className="text-xs text-ink-500 flex items-center gap-1.5">
            <span className="text-green-500">✓</span> {result!.holdingsUpdated} holdings updated
          </li>
        )}
        {result!.errors.length > 0 && (
          <li className="text-xs text-red-400 flex items-center gap-1.5">
            <span>⚠</span> {result!.errors.length} error(s)
          </li>
        )}
      </ul>
      <p className="text-xs text-ink-300">Refreshing…</p>
    </div>
  );
}

function SignOutButton() {
  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full text-xs text-ink-400 hover:text-ink-600 transition-colors py-1.5 text-center"
    >
      Sign out
    </button>
  );
}
