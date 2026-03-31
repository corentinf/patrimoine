'use client';

import { useState } from 'react';
import { formatCurrency, formatCurrencyPrecise, formatDate } from '@/app/lib/utils';

interface Category {
  name: string;
  color: string;
  icon: string;
  total: number;
  count: number;
}

interface Transaction {
  id: string;
  amount: number;
  description: string;
  payee: string | null;
  posted_at: string;
  category: {
    name: string;
    color: string;
    icon: string;
    is_income: boolean;
  } | null;
}

interface CategoryListProps {
  categories: Category[];
  transactions: Transaction[];
  totalSpending: number;
}

export default function CategoryList({ categories, transactions, totalSpending }: CategoryListProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const selectedCat = categories.find((c) => c.name === selectedCategory);

  const filteredTxns = transactions.filter((tx) => {
    const catName = tx.category?.name || 'Uncategorized';
    return catName === selectedCategory;
  });

  return (
    <>
      <div className="card p-0 divide-y divide-sand-100">
        {categories.map((cat) => {
          const percentage = totalSpending > 0 ? (cat.total / totalSpending) * 100 : 0;
          const isSelected = selectedCategory === cat.name;

          return (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(isSelected ? null : cat.name)}
              className="w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-sand-50 focus:outline-none"
            >
              <span className="text-lg w-8 text-center flex-shrink-0">{cat.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-ink-700">{cat.name}</p>
                  <p className="font-mono text-sm text-ink-700">{formatCurrency(cat.total)}</p>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-sand-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%`, backgroundColor: cat.color }}
                  />
                </div>
                <p className="text-xs text-ink-300 mt-1">
                  {cat.count} transaction{cat.count !== 1 ? 's' : ''} · {percentage.toFixed(1)}%
                </p>
              </div>
              <svg
                className={`w-4 h-4 text-ink-300 flex-shrink-0 transition-transform ${isSelected ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          );
        })}
      </div>

      {/* Slide-over panel */}
      {selectedCategory && selectedCat && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setSelectedCategory(null)}
          />
          {/* Panel */}
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedCat.icon}</span>
                <div>
                  <h3 className="font-semibold text-ink-800">{selectedCategory}</h3>
                  <p className="text-sm text-ink-400">
                    {filteredTxns.length} transaction{filteredTxns.length !== 1 ? 's' : ''} · {formatCurrency(selectedCat.total)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCategory(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-sand-100 text-ink-400 hover:text-ink-700 transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Transaction list */}
            <div className="flex-1 overflow-y-auto divide-y divide-sand-100">
              {filteredTxns.map((tx) => {
                const displayName = tx.payee || tx.description || 'Unknown';
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-700 truncate">{displayName}</p>
                      <p className="text-xs text-ink-400 mt-0.5">{formatDate(tx.posted_at)}</p>
                    </div>
                    <p className="font-mono text-sm text-ink-700 flex-shrink-0">
                      {formatCurrencyPrecise(Math.abs(tx.amount))}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
