'use client';

import { formatCurrencyPrecise, formatDate } from '@/app/lib/utils';

interface AccountCardProps {
  account: {
    id: string;
    name: string;
    institution: string;
    account_type: string;
    balance: number;
    balance_date: string;
  };
}

export default function AccountCard({ account }: AccountCardProps) {
  const isCredit = account.account_type === 'credit';
  const displayBalance = isCredit ? -Number(account.balance) : Number(account.balance);

  return (
    <div className="card-hover flex items-center justify-between group">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-700 truncate">
          {account.name}
        </p>
        <p className="text-xs text-ink-300 mt-0.5">
          {account.institution}
          {account.balance_date && (
            <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              · updated {formatDate(account.balance_date)}
            </span>
          )}
        </p>
      </div>
      <div className="text-right flex-shrink-0 ml-4">
        <p className={`font-mono text-base font-medium ${
          isCredit ? 'text-accent-red' : 'text-ink-800'
        }`}>
          {isCredit && displayBalance > 0 ? '-' : ''}
          {formatCurrencyPrecise(Math.abs(displayBalance))}
        </p>
      </div>
    </div>
  );
}
