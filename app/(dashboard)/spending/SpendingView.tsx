'use client';

import { useState, useMemo } from 'react';
import { formatCurrency } from '@/app/lib/utils';
import SpendingCharts from './SpendingCharts';
import SpendingTransactions from './SpendingTransactions';
import CategoryManager, { type Category } from './CategoryManager';
import AICategorizeButton from './AICategorizeButton';

interface RawTransaction {
  id: string;
  amount: number;
  description: string;
  payee: string | null;
  memo: string | null;
  posted_at: string;
  account_id: string;
  account: { id: string; name: string; institution: string } | null;
  category: { id: string; name: string; color: string; icon: string; is_income: boolean } | null;
}

interface MonthlyRaw {
  amount: number;
  posted_at: string;
  account_id: string;
}

interface VenmoRequest {
  id: string;
  transaction_id: string;
  person_name: string;
  amount: number;
  status: 'pending' | 'requested' | 'settled';
}

interface SpendingViewProps {
  transactions: RawTransaction[];
  monthlyRaw: MonthlyRaw[];
  allCategories: Category[];
  venmoRequests: VenmoRequest[];
}

export default function SpendingView({ transactions, monthlyRaw, allCategories, venmoRequests }: SpendingViewProps) {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const accounts = useMemo(() => {
    const map = new Map<string, { id: string; name: string; institution: string }>();
    for (const tx of transactions) {
      if (tx.account && !map.has(tx.account_id)) {
        map.set(tx.account_id, {
          id: tx.account_id,
          name: tx.account.name,
          institution: tx.account.institution,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.institution || a.name).localeCompare(b.institution || b.name),
    );
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    if (!selectedAccount) return transactions;
    return transactions.filter((tx) => tx.account_id === selectedAccount);
  }, [transactions, selectedAccount]);

  const { sortedCategories, totalSpending } = useMemo(() => {
    const totals: Record<string, { name: string; color: string; icon: string; total: number; count: number }> = {};
    for (const tx of filteredTransactions) {
      const cat = tx.category;
      if (cat?.is_income) continue;
      const key = cat?.name || 'Uncategorized';
      if (!totals[key]) {
        totals[key] = { name: key, color: cat?.color || '#D1D5DB', icon: cat?.icon || '❓', total: 0, count: 0 };
      }
      totals[key].total += Math.abs(Number(tx.amount));
      totals[key].count += 1;
    }
    const sorted = Object.values(totals).sort((a, b) => b.total - a.total);
    return { sortedCategories: sorted, totalSpending: sorted.reduce((s, c) => s + c.total, 0) };
  }, [filteredTransactions]);

  const monthlyChartData = useMemo(() => {
    const src = selectedAccount
      ? monthlyRaw.filter((tx) => tx.account_id === selectedAccount)
      : monthlyRaw;
    const byMonth: Record<string, number> = {};
    for (const tx of src) {
      const month = tx.posted_at.substring(0, 7);
      byMonth[month] = (byMonth[month] || 0) + Math.abs(Number(tx.amount));
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        total: Math.round(total),
      }));
  }, [monthlyRaw, selectedAccount]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl text-ink-800">Spending</h2>
          <p className="text-sm text-ink-400 mt-1">Where your money goes</p>
        </div>
        <div className="text-right">
          <p className="stat-label">This month</p>
          <p className="stat-value text-accent-red">{formatCurrency(totalSpending)}</p>
        </div>
      </div>

      {/* Account tab bar */}
      {accounts.length > 1 && (
        <div className="flex items-center gap-0 border-b border-sand-200 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setSelectedAccount(null)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              !selectedAccount
                ? 'border-ink-800 text-ink-800'
                : 'border-transparent text-ink-400 hover:text-ink-600'
            }`}
          >
            All accounts
          </button>
          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => setSelectedAccount(selectedAccount === account.id ? null : account.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                selectedAccount === account.id
                  ? 'border-ink-800 text-ink-800'
                  : 'border-transparent text-ink-400 hover:text-ink-600'
              }`}
            >
              {account.institution || account.name}
            </button>
          ))}
        </div>
      )}

      {/* Charts */}
      <SpendingCharts
        categories={sortedCategories}
        monthlyData={monthlyChartData}
        totalSpending={totalSpending}
      />

      {/* Transaction list */}
      {filteredTransactions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wider">
              Transactions
            </h3>
            <div className="flex items-center gap-2">
              <AICategorizeButton />
              <button
                onClick={() => setShowCategoryManager(true)}
                className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 12h.01M7 17h.01M11 7h6M11 12h6M11 17h6" />
                </svg>
                Manage categories
              </button>
            </div>
          </div>
          <SpendingTransactions
            transactions={filteredTransactions as any}
            allCategories={allCategories}
            venmoRequests={venmoRequests}
          />
        </div>
      )}

      {/* Empty state */}
      {filteredTransactions.length === 0 && (
        <div className="card text-center py-16">
          <p className="text-4xl mb-4">📊</p>
          <h3 className="font-display text-xl text-ink-700 mb-2">No spending data yet</h3>
          <p className="text-ink-400 text-sm">
            Sync your accounts to see your spending breakdown.
          </p>
        </div>
      )}

      {/* Category manager modal */}
      {showCategoryManager && (
        <CategoryManager
          categories={allCategories}
          onClose={() => setShowCategoryManager(false)}
        />
      )}
    </div>
  );
}
