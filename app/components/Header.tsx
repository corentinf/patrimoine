'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@/app/lib/supabase';
import { usePrivacy } from '@/app/lib/privacy';
import { useGlobalFilter } from '@/app/lib/globalFilter';
import { usePageFilterSlotContent } from '@/app/lib/pageFilterSlot';
import { PRESETS } from '@/app/lib/investmentRange';
import PlaidLinkButton from './PlaidLink';
import SimpleFINLinkButton from './SimpleFINLink';
import { AccountsPanel, AccountModal, type SidebarAccount } from './AccountsPanel';

const navItems = [
  { href: '/home', label: 'Home' },
  { href: '/spending', label: 'Spending' },
  { href: '/income', label: 'Income' },
  { href: '/networth', label: 'Investment' },
];

type SyncPhase = 'idle' | 'syncing' | 'done' | 'error';
type SyncStep = 'accounts' | 'transactions' | 'categorize' | 'snapshot';

const SYNC_STEPS: { key: SyncStep; label: string }[] = [
  { key: 'accounts', label: 'Accounts & balances' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'categorize', label: 'AI categorization' },
  { key: 'snapshot', label: 'Net worth snapshot' },
];

export function SyncDropdown() {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [doneSteps, setDoneSteps] = useState<Set<SyncStep>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (phase === 'idle' || phase === 'done' || phase === 'error') setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [phase]);

  const handleSync = async () => {
    setPhase('syncing');
    setOpen(true);
    setResult(null);
    setErrorMsg('');
    setDoneSteps(new Set());
    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Error ${res.status}`;
        try { msg = JSON.parse(text).error || msg; } catch {}
        setErrorMsg(msg); setPhase('error'); return;
      }
      if (!res.body) { setErrorMsg('No response body'); setPhase('error'); return; }

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
          let event: any;
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'progress') {
            setDoneSteps((prev) => { const next = new Set(prev); next.add(event.step); return next; });
          } else if (event.done) {
            if (event.ok) {
              setResult(event);
              setPhase('done');
              setTimeout(() => window.location.reload(), 3000);
            } else {
              setErrorMsg(event.error || 'Sync failed');
              setPhase('error');
            }
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Sync failed');
      setPhase('error');
    }
  };

  const reset = () => { setPhase('idle'); setResult(null); setErrorMsg(''); setDoneSteps(new Set()); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => phase === 'idle' ? handleSync() : setOpen((v) => !v)}
        disabled={phase === 'syncing'}
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800 px-3 py-1.5 rounded-lg hover:bg-sand-50 transition-colors disabled:opacity-40"
      >
        <span className={phase === 'syncing' ? 'animate-spin inline-block' : ''}>↻</span>
        Sync now
      </button>

      {open && phase !== 'idle' && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-sand-200 rounded-xl shadow-lg p-3 space-y-2 z-50">
          {phase === 'syncing' && (
            <>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-ink-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span className="text-xs font-medium text-ink-600">Syncing…</span>
              </div>
              <div className="space-y-1.5">
                {SYNC_STEPS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    {doneSteps.has(key)
                      ? <span className="w-3.5 h-3.5 rounded-sm bg-green-500 text-white flex items-center justify-center text-[9px] leading-none flex-shrink-0">✓</span>
                      : <span className="w-3.5 h-3.5 rounded-sm border border-sand-300 bg-white flex-shrink-0" />}
                    <span className={doneSteps.has(key) ? 'text-ink-600' : 'text-ink-300'}>{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {phase === 'error' && (
            <>
              <p className="text-xs font-medium text-red-600">Sync failed</p>
              <pre className="text-xs text-red-400 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{errorMsg}</pre>
              <button onClick={reset} className="text-xs text-ink-400 hover:text-ink-600">Try again</button>
            </>
          )}
          {phase === 'done' && (
            <>
              <p className="text-xs font-medium text-green-700">Sync complete</p>
              <ul className="space-y-1">
                {result?.accountsSynced?.map((name: string) => (
                  <li key={name} className="text-xs text-ink-500 flex items-center gap-1.5"><span className="text-green-500">✓</span> {name}</li>
                ))}
                {result?.transactionsAdded > 0 && <li className="text-xs text-ink-500 flex items-center gap-1.5"><span className="text-green-500">✓</span> {result.transactionsAdded} new transactions</li>}
                {result?.categorized > 0 && <li className="text-xs text-ink-500 flex items-center gap-1.5"><span className="text-green-500">✓</span> {result.categorized} categorized</li>}
                {result?.holdingsUpdated > 0 && <li className="text-xs text-ink-500 flex items-center gap-1.5"><span className="text-green-500">✓</span> {result.holdingsUpdated} holdings updated</li>}
              </ul>
              <p className="text-xs text-ink-300">Refreshing…</p>
            </>
          )}
        </div>
      )}
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
          <button onClick={() => setPhase('idle')} className="text-xs text-ink-400 hover:text-ink-600 px-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'resetting') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-red-400">Resetting…</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setPhase('confirm'); }}
      className="w-full text-left text-xs text-ink-300 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-sand-50"
    >
      Reset data
    </button>
  );
}

function ProfileMenu({ accounts }: { accounts: SidebarAccount[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [modalAccount, setModalAccount] = useState<SidebarAccount | null | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);
  const { blurred, toggle: togglePrivacy } = usePrivacy();
  const router = useRouter();

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
    <>
      {modalAccount !== undefined && (
        <AccountModal
          account={modalAccount}
          onClose={() => setModalAccount(undefined)}
          onSuccess={() => { router.refresh(); setOpen(false); }}
        />
      )}
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-8 h-8 rounded-full bg-sand-200 text-ink-600 text-sm font-semibold flex items-center justify-center hover:bg-sand-300 transition-colors flex-shrink-0"
        >
          {initial}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-sand-200 rounded-xl shadow-lg z-50 max-h-[calc(100vh-5rem)] overflow-y-auto">
            {email && (
              <p className="px-3 pt-3 pb-2 text-xs text-ink-400 border-b border-sand-100 truncate">{email}</p>
            )}

            {/* Accounts + net worth */}
            <div className="px-2 py-3 border-b border-sand-100">
              <AccountsPanel
                accounts={accounts}
                onEdit={(a) => setModalAccount(a)}
                onAdd={() => setModalAccount(null)}
              />
            </div>

            {/* Connections */}
            <div className="px-3 pt-2 pb-1">
              <p className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider mb-1">Connections</p>
            </div>
            <div className="px-2 space-y-1">
              <PlaidLinkButton />
              <SimpleFINLinkButton />
            </div>

            {/* Settings */}
            <div className="border-t border-sand-100 mt-1.5 pt-1.5 px-2 pb-2 space-y-0.5">
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
    </>
  );
}

export function FilterBar() {
  const {
    dateFilter, activePreset, showCustom, rangeLabel, canStepForward, canStepBackward,
    stepPeriod, applyPreset, resetFilter, setCustomStart, setCustomEnd,
    segment, clearSegment, category, clearCategory,
  } = useGlobalFilter();
  const now = new Date();

  return (
    <div className="border-t border-sand-100 flex flex-wrap items-center gap-x-5 gap-y-1.5 py-2">
      <div className="flex items-center gap-1">
        <button
          onClick={() => stepPeriod(-1)}
          disabled={!canStepBackward}
          className="p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-sand-100 transition-colors disabled:opacity-30 disabled:cursor-default"
          aria-label="Previous period"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-xs font-semibold min-w-[92px] text-center text-ink-800 bg-sand-100 rounded-md px-2 py-1">
          {rangeLabel}
        </span>
        <button
          onClick={() => stepPeriod(1)}
          disabled={!canStepForward}
          className="p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-sand-100 transition-colors disabled:opacity-30 disabled:cursor-default"
          aria-label="Next period"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={resetFilter}
          title="Reset to current month"
          className="ml-1.5 text-xs text-ink-400 hover:text-ink-700 transition-colors"
        >
          Reset
        </button>
      </div>

      <div className="flex items-center gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              activePreset === p.key
                ? 'bg-ink-800 text-white'
                : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => applyPreset('custom')}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            showCustom
              ? 'bg-ink-800 text-white'
              : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
          }`}
        >
          Custom
        </button>
      </div>

      {showCustom && dateFilter.mode === 'custom' && (
        <div className="flex items-center gap-1.5 text-xs">
          <input
            type="date"
            value={dateFilter.start}
            max={dateFilter.end}
            onChange={(e) => setCustomStart(e.target.value)}
            className="text-xs px-1.5 py-1 border border-sand-200 rounded-md focus:outline-none focus:border-ink-400 text-ink-700"
          />
          <span className="text-ink-300">–</span>
          <input
            type="date"
            value={dateFilter.end}
            min={dateFilter.start}
            max={now.toISOString().substring(0, 10)}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="text-xs px-1.5 py-1 border border-sand-200 rounded-md focus:outline-none focus:border-ink-400 text-ink-700"
          />
        </div>
      )}

      {(segment || category) && (
        <div className="flex items-center gap-1.5">
          {segment && (
            <button
              onClick={clearSegment}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-sand-200 bg-sand-100 text-ink-600 hover:bg-sand-200 transition-colors"
              title="Clear day selection"
            >
              {segment.label}
              <span className="text-ink-400">✕</span>
            </button>
          )}
          {category && (
            <button
              onClick={clearCategory}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-sand-200 bg-sand-100 text-ink-600 hover:bg-sand-200 transition-colors"
              title="Clear category selection"
            >
              {category.icon && <span style={{ color: category.color }}>{category.icon}</span>}
              {category.label}
              <span className="text-ink-400">✕</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function PageFiltersRow() {
  const content = usePageFilterSlotContent();
  if (!content) return null;
  return (
    <div className="border-t border-sand-100 py-2">
      {content}
    </div>
  );
}

function shortNum(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

interface HeaderProps {
  accounts?: SidebarAccount[];
  netWorth?: number;
  spending?: number;
  income?: number;
  investmentTotal?: number;
}

export default function Header({ accounts = [], netWorth = 0, spending = 0, income = 0, investmentTotal = 0 }: HeaderProps) {
  const pathname = usePathname();

  const tabStats: Record<string, string> = {
    '/home': shortNum(netWorth),
    '/spending': shortNum(spending),
    '/income': shortNum(income),
    '/networth': shortNum(investmentTotal),
  };

  return (
    <header className="hidden md:block sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-sand-200">
      <div className="max-w-screen-xl mx-auto px-6 lg:px-10">
        <div className="h-14 flex items-center gap-6">
          <h1 className="font-display text-lg text-ink-800 tracking-tight flex-shrink-0">
            Patrimoine
          </h1>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const stat = tabStats[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-baseline gap-1.5 ${
                    isActive ? 'bg-sand-100 text-ink-800' : 'text-ink-400 hover:text-ink-600 hover:bg-sand-50'
                  }`}
                >
                  {item.label}
                  {stat && (
                    <span className={`text-[11px] font-mono ${isActive ? 'text-ink-500' : 'text-ink-300'}`} data-sensitive>
                      {stat}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <SyncDropdown />
            <ProfileMenu accounts={accounts} />
          </div>
        </div>
        <FilterBar />
        <PageFiltersRow />
      </div>
    </header>
  );
}
