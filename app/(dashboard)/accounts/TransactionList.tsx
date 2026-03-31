'use client';

import { formatCurrencyPrecise, formatShortDate, amountColor } from '@/app/lib/utils';

interface Transaction {
  id: string;
  amount: number;
  description: string;
  payee: string | null;
  posted_at: string;
  account: { name: string; institution: string } | null;
  category: { name: string; color: string; icon: string } | null;
}

interface TransactionListProps {
  transactions: Transaction[];
}

export default function TransactionList({ transactions }: TransactionListProps) {
  if (!transactions.length) {
    return (
      <div className="card text-center py-8">
        <p className="text-ink-300 text-sm">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="card p-0 divide-y divide-sand-100">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center gap-4 px-5 py-3.5 hover:bg-sand-50 transition-colors"
        >
          {/* Category icon */}
          <span className="text-lg w-8 text-center flex-shrink-0">
            {tx.category?.icon || '·'}
          </span>

          {/* Description + account */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-700 truncate">
              {tx.payee || tx.description}
            </p>
            <p className="text-xs text-ink-300 truncate mt-0.5">
              {tx.account?.institution} · {tx.account?.name}
              {tx.category && (
                <span
                  className="ml-2 inline-block px-1.5 py-px rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: tx.category.color + '18',
                    color: tx.category.color,
                  }}
                >
                  {tx.category.name}
                </span>
              )}
            </p>
          </div>

          {/* Date */}
          <span className="text-xs text-ink-300 flex-shrink-0 w-16 text-right">
            {formatShortDate(tx.posted_at)}
          </span>

          {/* Amount */}
          <span className={`font-mono text-sm font-medium flex-shrink-0 w-24 text-right ${
            amountColor(Number(tx.amount))
          }`}>
            {Number(tx.amount) > 0 ? '+' : ''}
            {formatCurrencyPrecise(Number(tx.amount))}
          </span>
        </div>
      ))}
    </div>
  );
}
