'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { createBrowserClient } from '@/app/lib/supabase';
import { usePrivacy } from '@/app/lib/privacy';
import { formatCurrency, accountTypeConfig } from '@/app/lib/utils';
import PlaidLinkButton from './PlaidLink';
import SimpleFINLinkButton from './SimpleFINLink';

const navItems = [
  { href: '/spending', label: 'Spending', icon: '◧' },
  { href: '/income', label: 'Income', icon: '◩' },
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

function AccountModal({
  account,
  onClose,
  onSuccess,
}: {
  account: SidebarAccount | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isNew = account === null;
  const isManual = !isNew && account.id.startsWith('manual_');
  const canEditAll = isNew || isManual;

  const [name, setName] = useState(account?.name ?? '');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [accountType, setAccountType] = useState(account?.account_type ?? 'checking');
  const [balance, setBalance] = useState(account ? String(account.balance) : '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      let res: Response;
      if (isNew) {
        res = await fetch('/api/accounts/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, institution, account_type: accountType, balance: Number(balance) }),
        });
      } else if (isManual) {
        res = await fetch('/api/accounts/manual', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: account.id, name, institution, account_type: accountType, balance: Number(balance) }),
        });
      } else {
        res = await fetch('/api/accounts/manual', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: account!.id, balance: Number(balance) }),
        });
      }
      const data = await res.json();
      if (res.ok) { onSuccess(); onClose(); }
      else setError(data.error ?? 'Failed to save');
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch('/api/accounts/manual', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account!.id }),
      });
      const data = await res.json();
      if (res.ok) { onSuccess(); onClose(); }
      else { setError(data.error ?? 'Failed to delete'); setConfirmDelete(false); }
    } catch {
      setError('Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  const canSave = saving
    ? false
    : isNew
    ? Boolean(name.trim() && institution.trim() && balance !== '')
    : balance !== '';

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-ink-800">
            {isNew ? 'Add account' : isManual ? 'Edit account' : 'Edit balance'}
          </h3>
          <button onClick={onClose} className="p-1 text-ink-300 hover:text-ink-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {canEditAll && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-500">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Checking"
                  autoFocus
                  className="w-full text-sm px-3 py-2 rounded-xl border border-sand-200 focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-500">Institution</label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. Chase"
                  className="w-full text-sm px-3 py-2 rounded-xl border border-sand-200 focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-500">Type</label>
                <select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-xl border border-sand-200 focus:outline-none focus:border-ink-400 text-ink-700 bg-white"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="investment">Investment</option>
                  <option value="credit">Credit</option>
                </select>
              </div>
            </>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-500">Balance</label>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
              step="0.01"
              autoFocus={!canEditAll}
              className="w-full text-sm px-3 py-2 rounded-xl border border-sand-200 focus:outline-none focus:border-ink-400 text-ink-700 placeholder:text-ink-300"
            />
            {!isNew && !isManual && (
              <p className="text-xs text-ink-300">This account is synced — only balance can be overridden.</p>
            )}
          </div>
        </div>

        {error && <p className="text-xs text-accent-red">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          {isManual && !isNew && (
            confirmDelete ? (
              <>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  {deleting ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-ink-400 hover:text-ink-600">
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-ink-300 hover:text-accent-red transition-colors">
                Delete
              </button>
            )
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="text-sm text-ink-400 hover:text-ink-600 px-3 py-2 rounded-xl transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="text-sm font-medium text-white bg-ink-800 hover:bg-ink-700 px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : isNew ? 'Add account' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountsPanel({ accounts, onEdit, onAdd }: {
  accounts: SidebarAccount[];
  onEdit: (account: SidebarAccount) => void;
  onAdd: () => void;
}) {
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
                className="group flex items-center justify-between gap-2 px-3 py-1 rounded-md text-xs hover:bg-sand-50"
                title={`${a.institution} — ${a.name}`}
              >
                <span className="truncate text-ink-700">{a.institution || a.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className={`font-mono ${a.account_type === 'credit' ? 'text-accent-red' : 'text-ink-700'}`}
                    data-sensitive
                  >
                    {compactCurrency(a.balance)}
                  </span>
                  <button
                    onClick={() => onEdit(a)}
                    title="Edit"
                    className="w-4 h-4 flex items-center justify-center text-ink-300 hover:text-ink-600 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
      <button
        onClick={onAdd}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink-400 hover:text-ink-700 hover:bg-sand-50 rounded-md transition-colors mt-1"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add account
      </button>
    </div>
  );
}

export default function Sidebar({ accounts }: { accounts: SidebarAccount[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileAccountsOpen, setMobileAccountsOpen] = useState(false);
  // undefined = closed, null = new, SidebarAccount = editing existing
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
          <AccountsPanel accounts={accounts} onEdit={openEdit} onAdd={openAdd} />
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
              <AccountsPanel accounts={accounts} onEdit={openEdit} onAdd={openAdd} />
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

type SyncPhase = 'idle' | 'syncing' | 'done' | 'error';
type SyncStep = 'accounts' | 'transactions' | 'categorize' | 'snapshot';

interface SyncResult {
  accountsUpdated: number;
  transactionsAdded: number;
  holdingsUpdated: number;
  categorized: number;
  accountsSynced: string[];
  errors: string[];
}

const SYNC_STEPS: { key: SyncStep; label: string }[] = [
  { key: 'accounts',     label: 'Accounts & balances' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'categorize',   label: 'AI categorization' },
  { key: 'snapshot',     label: 'Net worth snapshot' },
];

function SyncButton() {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [result, setResult] = useState<SyncResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [doneSteps, setDoneSteps] = useState<Set<SyncStep>>(new Set());
  const [stepCounts, setStepCounts] = useState<Partial<Record<SyncStep, number>>>({});

  const handleSync = async () => {
    setPhase('syncing');
    setResult(null);
    setErrorMsg('');
    setDoneSteps(new Set());
    setStepCounts({});

    try {
      const res = await fetch('/api/plaid/sync', { method: 'POST' });

      if (!res.ok) {
        const text = await res.text();
        let msg = `Error ${res.status}`;
        try { msg = JSON.parse(text).error || msg; } catch {}
        setErrorMsg(msg);
        setPhase('error');
        return;
      }

      if (!res.body) {
        setErrorMsg('No response body');
        setPhase('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let receivedDone = false;

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
            const step = event.step as SyncStep;
            setDoneSteps((prev) => { const next = new Set(prev); next.add(step); return next; });
            if (event.count !== undefined) {
              setStepCounts((prev) => ({ ...prev, [step]: event.count }));
            }
          } else if (event.done) {
            receivedDone = true;
            if (event.ok) {
              setResult(event as SyncResult);
              setPhase('done');
              setTimeout(() => window.location.reload(), 3000);
            } else {
              setErrorMsg(event.error || 'Sync failed');
              setPhase('error');
            }
          }
        }
      }

      if (!receivedDone) {
        setErrorMsg('Sync ended without completing');
        setPhase('error');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Sync failed');
      setPhase('error');
    }
  };

  const reset = () => { setPhase('idle'); setResult(null); setErrorMsg(''); setDoneSteps(new Set()); setStepCounts({}); };

  if (phase === 'idle') {
    return (
      <button onClick={handleSync} className="w-full btn-secondary text-xs justify-center">
        ↻ Sync now
      </button>
    );
  }

  if (phase === 'syncing') {
    return (
      <div className="rounded-lg border border-sand-200 bg-sand-50 p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-ink-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span className="text-xs font-medium text-ink-600">Syncing…</span>
        </div>
        <div className="space-y-1.5">
          {SYNC_STEPS.map(({ key, label }) => {
            const done = doneSteps.has(key);
            const count = stepCounts[key];
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                {done ? (
                  <span className="w-3.5 h-3.5 rounded-sm bg-green-500 text-white flex items-center justify-center text-[9px] leading-none flex-shrink-0">✓</span>
                ) : (
                  <span className="w-3.5 h-3.5 rounded-sm border border-sand-300 bg-white flex-shrink-0" />
                )}
                <span className={done ? 'text-ink-600' : 'text-ink-300'}>
                  {label}
                  {done && count !== undefined && count > 0 ? (
                    <span className="text-ink-300 ml-1">({count})</span>
                  ) : null}
                </span>
              </div>
            );
          })}
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
