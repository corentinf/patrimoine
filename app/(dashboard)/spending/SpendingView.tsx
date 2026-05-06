'use client';

import { useState, useMemo } from 'react';
import { formatCurrency } from '@/app/lib/utils';
import SpendingCharts from './SpendingCharts';
import SpendingTransactions from './SpendingTransactions';
import CategoryManager, { type Category } from './CategoryManager';
import AICategorizeButton from './AICategorizeButton';
import VenmoImport from './VenmoImport';

interface RawTransaction {
  id: string;
  amount: number;
  description: string;
  payee: string | null;
  memo: string | null;
  posted_at: string;
  account_id: string;
  is_transfer: boolean;
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

type DateFilter =
  | { mode: 'month'; year: number; month: number }
  | { mode: 'custom'; start: string; end: string };

function getMonthBounds(year: number, month: number) {
  const start = new Date(year, month, 1).toISOString();
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();
  return { start, end };
}

function applyDateFilter(txs: RawTransaction[], filter: DateFilter) {
  let start: string, end: string;
  if (filter.mode === 'month') {
    ({ start, end } = getMonthBounds(filter.year, filter.month));
  } else {
    start = filter.start + 'T00:00:00.000Z';
    end = filter.end + 'T23:59:59.999Z';
  }
  return txs.filter((tx) => tx.posted_at >= start && tx.posted_at <= end);
}

function formatMonthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function DateNav({ filter, onChange }: { filter: DateFilter; onChange: (f: DateFilter) => void }) {
  const [showCustom, setShowCustom] = useState(filter.mode === 'custom');
  const now = new Date();

  const goMonth = (delta: number) => {
    if (filter.mode !== 'month') return;
    let { year, month } = filter;
    month += delta;
    if (month < 0) { month = 11; year--; }
    if (month > 11) { month = 0; year++; }
    onChange({ mode: 'month', year, month });
  };

  const isCurrentMonth =
    filter.mode === 'month' &&
    filter.year === now.getFullYear() &&
    filter.month === now.getMonth();

  const activateCustom = () => {
    setShowCustom(true);
    const today = now.toISOString().substring(0, 10);
    const monthStart = filter.mode === 'month'
      ? new Date(filter.year, filter.month, 1).toISOString().substring(0, 10)
      : filter.start;
    const monthEnd = filter.mode === 'month'
      ? new Date(filter.year, filter.month + 1, 0).toISOString().substring(0, 10)
      : filter.end;
    onChange({ mode: 'custom', start: monthStart, end: monthEnd });
  };

  const backToMonth = () => {
    setShowCustom(false);
    onChange({ mode: 'month', year: now.getFullYear(), month: now.getMonth() });
  };

  if (showCustom && filter.mode === 'custom') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm">
          <label className="text-xs text-ink-400 whitespace-nowrap">From</label>
          <input
            type="date"
            value={filter.start}
            max={filter.end}
            onChange={(e) => onChange({ ...filter, start: e.target.value })}
            className="text-xs px-2 py-1 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700"
          />
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <label className="text-xs text-ink-400 whitespace-nowrap">To</label>
          <input
            type="date"
            value={filter.end}
            min={filter.start}
            max={now.toISOString().substring(0, 10)}
            onChange={(e) => onChange({ ...filter, end: e.target.value })}
            className="text-xs px-2 py-1 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700"
          />
        </div>
        <button
          onClick={backToMonth}
          className="text-xs text-ink-400 hover:text-ink-600 transition-colors whitespace-nowrap"
        >
          ← Month view
        </button>
      </div>
    );
  }

  const label = filter.mode === 'month'
    ? formatMonthLabel(filter.year, filter.month)
    : 'Custom range';

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => goMonth(-1)}
        className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-sand-100 transition-colors"
        aria-label="Previous month"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span className="text-sm font-medium text-ink-700 min-w-[140px] text-center">{label}</span>
      <button
        onClick={() => goMonth(1)}
        disabled={isCurrentMonth}
        className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-sand-100 transition-colors disabled:opacity-30 disabled:cursor-default"
        aria-label="Next month"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <button
        onClick={activateCustom}
        className="ml-1 p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-sand-100 transition-colors"
        title="Custom date range"
        aria-label="Custom date range"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
    </div>
  );
}

export default function SpendingView({ transactions, monthlyRaw, allCategories, venmoRequests }: SpendingViewProps) {
  const now = new Date();
  const [dateFilter, setDateFilter] = useState<DateFilter>({
    mode: 'month',
    year: now.getFullYear(),
    month: now.getMonth(),
  });
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

  const dateFiltered = useMemo(() => applyDateFilter(transactions, dateFilter), [transactions, dateFilter]);

  const filteredTransactions = useMemo(() => {
    if (!selectedAccount) return dateFiltered;
    return dateFiltered.filter((tx) => tx.account_id === selectedAccount);
  }, [dateFiltered, selectedAccount]);

  const { sortedCategories, totalSpending } = useMemo(() => {
    const totals: Record<string, { name: string; color: string; icon: string; total: number; count: number }> = {};
    for (const tx of filteredTransactions) {
      const cat = tx.category;
      if (cat?.is_income || tx.is_transfer) continue;
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

  const periodLabel = dateFilter.mode === 'month'
    ? formatMonthLabel(dateFilter.year, dateFilter.month)
    : `${dateFilter.start} – ${dateFilter.end}`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ink-800">Spending</h2>
          <p className="text-sm text-ink-400 mt-1">Where your money goes</p>
        </div>
        <div className="sm:text-right">
          <p className="stat-label">{periodLabel}</p>
          <p className="stat-value text-accent-red">{formatCurrency(totalSpending)}</p>
        </div>
      </div>

      {/* Date navigation */}
      <DateNav filter={dateFilter} onChange={setDateFilter} />

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
              <VenmoImport />
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
          <h3 className="font-display text-xl text-ink-700 mb-2">No transactions</h3>
          <p className="text-ink-400 text-sm">
            No spending found for this period.
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
