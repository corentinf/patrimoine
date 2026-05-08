'use client';

import { useState } from 'react';
import { formatCurrencyPrecise, formatDate } from '@/app/lib/utils';

interface AccountCardProps {
  account: {
    id: string;
    name: string;
    institution: string;
    institution_domain: string | null;
    account_type: string;
    balance: number;
    available_balance: number | null;
    balance_date: string;
  };
}

export default function AccountCard({ account }: AccountCardProps) {
  const isManual = account.id.startsWith('manual_');
  const isCredit = account.account_type === 'credit';

  const [editing, setEditing] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(Math.abs(Number(account.balance))));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentBalance, setCurrentBalance] = useState(Number(account.balance));

  const handleSave = async () => {
    setSaving(true);
    const newBalance = isCredit ? -Math.abs(parseFloat(balanceInput)) : parseFloat(balanceInput);
    const res = await fetch('/api/accounts/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: account.name,
        institution: account.institution,
        account_type: account.account_type,
        balance: newBalance,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setCurrentBalance(newBalance);
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Remove "${account.name}"?`)) return;
    setDeleting(true);
    await fetch('/api/accounts/manual', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: account.id }),
    });
    window.location.reload();
  };

  const currentDisplay = isCredit ? -currentBalance : currentBalance;

  const institutionUrl = !isManual && account.institution_domain
    ? `https://${account.institution_domain}`
    : null;

  const availableBalance = account.available_balance != null ? Number(account.available_balance) : null;
  const creditLimit = isCredit && availableBalance != null
    ? Math.abs(Number(account.balance)) + availableBalance
    : null;

  const Wrapper = institutionUrl ? 'a' : 'div';
  const wrapperProps = institutionUrl
    ? { href: institutionUrl, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className="card-hover flex items-center justify-between group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p data-sensitive className="text-sm font-medium text-ink-700 truncate">{account.name}</p>
          {isManual && (
            <span className="text-xs text-ink-300 shrink-0">manual</span>
          )}
        </div>
        <p data-sensitive className="text-xs text-ink-300 mt-0.5">
          {account.institution}
          {isCredit && creditLimit != null && (
            <span className="ml-2">
              · {formatCurrencyPrecise(availableBalance!)} available of {formatCurrencyPrecise(creditLimit)}
            </span>
          )}
          {account.balance_date && (
            <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              · updated {formatDate(account.balance_date)}
            </span>
          )}
        </p>
      </div>

      <div className="text-right flex-shrink-0 ml-4 flex items-center gap-2">
        {isManual && editing ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-ink-400">$</span>
            <input
              type="number"
              step="0.01"
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-28 text-right font-mono text-sm border border-sand-200 rounded px-2 py-0.5 focus:outline-none focus:border-ink-400"
              autoFocus
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs text-ink-600 hover:text-ink-900 font-medium"
            >
              {saving ? '…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-ink-400 hover:text-ink-600"
            >
              ✕
            </button>
          </div>
        ) : (
          <>
            <p className={`font-mono text-base font-medium ${
              isCredit ? 'text-accent-red' : 'text-ink-800'
            }`}>
              {isCredit && currentDisplay > 0 ? '-' : ''}
              {formatCurrencyPrecise(Math.abs(currentDisplay))}
            </p>
            {isManual && (
              <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => { setBalanceInput(String(Math.abs(currentBalance))); setEditing(true); }}
                  className="text-xs text-ink-400 hover:text-ink-700"
                  title="Edit balance"
                >
                  ✎
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-ink-300 hover:text-red-500"
                  title="Remove account"
                >
                  ✕
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Wrapper>
  );
}
