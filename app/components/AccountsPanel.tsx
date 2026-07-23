'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, accountTypeConfig, resolveInstitutionDomain } from '@/app/lib/utils';

export interface SidebarAccount {
  id: string;
  name: string;
  mask?: string | null;
  institution: string;
  institution_domain?: string | null;
  account_type: string;
  balance: number;
}

export function InstitutionLogo({
  institution,
  institutionDomain,
  size = 32,
}: {
  institution: string;
  institutionDomain?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const domain = resolveInstitutionDomain(institution, institutionDomain);

  if (!domain || failed) {
    return (
      <div
        className="rounded-full bg-sand-100 text-ink-500 font-semibold flex items-center justify-center shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {(institution || '?').charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=${size * 2}`}
      alt=""
      onError={() => setFailed(true)}
      className="rounded-full bg-white border border-sand-200 object-contain shrink-0"
      style={{ width: size, height: size, padding: Math.round(size * 0.14) }}
    />
  );
}

function compactCurrency(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `$${(amount / 1000).toFixed(0)}K`;
  if (abs >= 1_000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${Math.round(amount)}`;
}

const TYPE_ORDER = ['checking', 'savings', 'investment', 'credit'];

export function AccountModal({
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

export function AccountsPanel({ accounts, onEdit, onAdd }: {
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
                title={`${a.institution} — ${a.name}${a.mask ? ` (••${a.mask})` : ''}`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <InstitutionLogo institution={a.institution || a.name} institutionDomain={a.institution_domain} size={16} />
                  <span className="truncate text-ink-700">{a.institution || a.name}</span>
                </span>
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

export default function AccountsWidget({ accounts }: { accounts: SidebarAccount[] }) {
  const router = useRouter();
  const [modalAccount, setModalAccount] = useState<SidebarAccount | null | undefined>(undefined);

  return (
    <>
      {modalAccount !== undefined && (
        <AccountModal
          account={modalAccount}
          onClose={() => setModalAccount(undefined)}
          onSuccess={() => { router.refresh(); }}
        />
      )}
      <AccountsPanel
        accounts={accounts}
        onEdit={(a) => setModalAccount(a)}
        onAdd={() => setModalAccount(null)}
      />
    </>
  );
}
