'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@/app/lib/supabase';
import { usePrivacy } from '@/app/lib/privacy';
import { formatCurrency, accountTypeConfig } from '@/app/lib/utils';
import PlaidLinkButton from './PlaidLink';
import SimpleFINLinkButton from './SimpleFINLink';

const navItems = [
  { href: '/spending', label: 'Spending', icon: '◧' },
  { href: '/networth', label: 'Net worth', icon: '◆' },
];

export interface SidebarAccount {
  id: string;
  name: string;
  institution: string;
  account_type: string;
  balance: number;
}

function compactCurrency(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${(amount / 1000).toFixed(0)}K`;
  if (abs >= 1_000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${Math.round(amount)}`;
}

const TYPE_ORDER = ['checking', 'savings', 'investment', 'credit'];

function AccountsPanel({ accounts }: { accounts: SidebarAccount[] }) {
  const assets = accounts
    .filter((a) => a.account_type !== 'credit')
    .reduce((s, a) => s + Number(a.balance), 0);
  const liabilities = accounts
    .filter((a) => a.account_type === 'credit')
    .reduce((s, a) => s + Math.abs(Number(a.balance)), 0);
  const netWorth = assets - liabilities;

  const grouped = accounts.reduce<Record<string, SidebarAccount[]>>((acc, a) => {
    const t = a.account_type || 'checking';
    (acc[t] ||= []).push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="px-3 py-2 rounded-lg border border-ink-800/20 bg-sand-50">
        <p className="text-[10px] uppercase tracking-wider text-ink-400 font-medium">Net worth</p>
        <p className="font-display text-lg text-ink-800 mt-0.5 leading-tight" data-sensitive>
          {formatCurrency(netWorth)}
        </p>
      </div>
      {TYPE_ORDER.map((t) => {
        const group = grouped[t];
        if (!group?.length) return null;
        const cfg = accountTypeConfig[t];
        return (
          <div key={t} className="space-y-0.5">
            <div className="px-3 flex items-center gap-1 text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
              <span>{cfg.icon}</span>
              {cfg.label}
            </div>
            {group.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 px-3 py-1 rounded-md text-xs hover:bg-sand-50"
                title={`${a.institution} — ${a.name}`}
              >
                <span className="truncate text-ink-700">{a.institution || a.name}</span>
                <span
                  className={`font-mono shrink-0 ${a.account_type === 'credit' ? 'text-accent-red' : 'text-ink-700'}`}
                  data-sensitive
                >
                  {compactCurrency(a.balance)}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function Sidebar({ accounts }: { accounts: SidebarAccount[] }) {
  const pathname = usePathname();
  const [mobileAccountsOpen, setMobileAccountsOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 h-screen w-56 bg-white border-r border-sand-200 flex-col z-10">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-sand-100 flex-shrink-0">
          <h1 className="font-display text-xl text-ink-800 tracking-tight">
            Patrimoine
          </h1>
          <p className="text-xs text-ink-300 mt-0.5 font-body">
            personal finance
          </p>
        </div>

        {/* Nav links */}
        <nav className="px-3 py-3 space-y-1 flex-shrink-0 border-b border-sand-100">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
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

        {/* Accounts panel (scrollable) */}
        <div className="flex-1 overflow-y-auto py-3">
          <AccountsPanel accounts={accounts} />
        </div>

        {/* Bottom actions */}
        <div className="px-3 py-3 border-t border-sand-100 space-y-2 flex-shrink-0">
          <SyncButton />
          <ProfileMenu />
        </div>
      </aside>

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
              <AccountsPanel accounts={accounts} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { blurred, toggle: togglePrivacy } = usePrivacy();

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initial = email ? email[0].toUpperCase() : '?';

  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink-500 hover:bg-sand-50 hover:text-ink-700 transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-sand-200 text-ink-600 text-xs font-semibold flex items-center justify-center flex-shrink-0">
          {initial}
        </span>
        <span className="flex-1 text-left truncate text-xs">{email ?? 'Profile'}</span>
        <svg className={`w-3.5 h-3.5 text-ink-300 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-sand-200 rounded-xl shadow-lg py-1.5 z-50">
          <div className="px-3 py-1.5 border-b border-sand-100 mb-1">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider">Connections</p>
          </div>
          <div className="px-2 space-y-1">
            <PlaidLinkButton />
            <SimpleFINLinkButton />
          </div>
          <div className="border-t border-sand-100 mt-1.5 pt-1.5 px-2 space-y-0.5">
            <button
              onClick={togglePrivacy}
              className="w-full flex items-center justify-between text-xs text-ink-500 hover:text-ink-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-sand-50"
            >
              <span className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {blurred
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                  }
                </svg>
                Privacy mode
              </span>
              <span className={`w-7 h-4 rounded-full transition-colors relative ${blurred ? 'bg-ink-700' : 'bg-sand-300'}`}>
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${blurred ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </span>
            </button>
            <ResetButton onClose={() => setOpen(false)} />
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

function MobileProfileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleSignOut() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div ref={ref} className="relative flex-1 flex items-center justify-center">
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
          <div className="px-3 py-1.5 border-b border-sand-100 mb-1">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider">Connections</p>
          </div>
          <div className="px-2 space-y-1">
            <PlaidLinkButton />
            <SimpleFINLinkButton />
          </div>
          <div className="border-t border-sand-100 mt-1.5 pt-1.5 px-2">
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

function ResetButton({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'resetting'>('idle');

  async function handleReset() {
    setPhase('resetting');
    await fetch('/api/reset', { method: 'POST' });
    window.location.href = '/spending';
  }

  if (phase === 'confirm') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2 mx-1 mb-1">
        <p className="text-xs font-medium text-red-600">Reset everything?</p>
        <p className="text-xs text-red-400">All accounts, transactions, and connections will be deleted.</p>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex-1 text-xs font-medium py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Yes, reset
          </button>
          <button onClick={() => { setPhase('idle'); onClose(); }} className="text-xs text-ink-400 hover:text-ink-600 px-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'resetting') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="inline-block w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-red-400">Resetting…</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => setPhase('confirm')}
      className="w-full text-left text-xs text-ink-300 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-sand-50"
    >
      Reset all data
    </button>
  );
}
