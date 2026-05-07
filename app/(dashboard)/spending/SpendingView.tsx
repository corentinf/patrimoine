'use client';

import { useState, useMemo } from 'react';
import { formatCurrency } from '@/app/lib/utils';
import SpendingCharts from './SpendingCharts';
import SpendingTransactions from './SpendingTransactions';
import CategoryManager, { type Category } from './CategoryManager';
import AICategorizeButton from './AICategorizeButton';
import VenmoImport from './VenmoImport';
import SubscriptionsSection from './SubscriptionsSection';
import SavingsRateModule from './SavingsRateModule';

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
  subscriptionOverrides: Record<string, 'confirmed' | 'dismissed'>;
  monthlyIncome: number;
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

function getPrevPeriodFilter(filter: DateFilter): DateFilter {
  if (filter.mode === 'month') {
    let { year, month } = filter;
    month -= 1;
    if (month < 0) { month = 11; year--; }
    return { mode: 'month', year, month };
  }
  const startMs = new Date(filter.start).getTime();
  const endMs = new Date(filter.end).getTime();
  const duration = endMs - startMs;
  const prevEnd = new Date(startMs - 86_400_000).toISOString().substring(0, 10);
  const prevStart = new Date(startMs - 86_400_000 - duration).toISOString().substring(0, 10);
  return { mode: 'custom', start: prevStart, end: prevEnd };
}

function isExcludedFromSpending(tx: RawTransaction): boolean {
  return tx.is_transfer || !!tx.category?.is_income || tx.category?.name === 'Transfer';
}

function sumByCategory(txs: RawTransaction[]): Map<string, { name: string; color: string; icon: string; total: number }> {
  const map = new Map<string, { name: string; color: string; icon: string; total: number }>();
  for (const tx of txs) {
    if (isExcludedFromSpending(tx)) continue;
    const key = tx.category?.id ?? '__uncategorized__';
    if (!map.has(key)) {
      map.set(key, {
        name: tx.category?.name ?? 'Uncategorized',
        color: tx.category?.color ?? '#D1D5DB',
        icon: tx.category?.icon ?? '❓',
        total: 0,
      });
    }
    map.get(key)!.total += Math.abs(Number(tx.amount));
  }
  return map;
}

interface CategoryRow {
  key: string;
  name: string;
  color: string;
  icon: string;
  current: number;
  previous: number;
  delta: number | null; // null = brand new category
}

function buildCategoryRows(
  current: Map<string, { name: string; color: string; icon: string; total: number }>,
  previous: Map<string, { name: string; color: string; icon: string; total: number }>,
): CategoryRow[] {
  const keys = Array.from(new Set([...Array.from(current.keys()), ...Array.from(previous.keys())]));
  const rows: CategoryRow[] = [];
  for (const key of keys) {
    const cur = current.get(key);
    const prev = previous.get(key);
    const currentTotal = cur?.total ?? 0;
    const previousTotal = prev?.total ?? 0;
    const meta = cur ?? prev!;
    const delta = previousTotal === 0
      ? (currentTotal > 0 ? null : 0)
      : ((currentTotal - previousTotal) / previousTotal) * 100;
    rows.push({ key, name: meta.name, color: meta.color, icon: meta.icon, current: currentTotal, previous: previousTotal, delta });
  }
  // Sort: new categories first (null delta), then by delta descending
  return rows
    .filter((r) => r.current > 0 || r.previous > 0)
    .sort((a, b) => {
      if (a.delta === null && b.delta === null) return b.current - a.current;
      if (a.delta === null) return -1;
      if (b.delta === null) return 1;
      return b.delta - a.delta;
    });
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

export default function SpendingView({ transactions, monthlyRaw, allCategories, venmoRequests, subscriptionOverrides, monthlyIncome }: SpendingViewProps) {
  const now = new Date();
  const [dateFilter, setDateFilter] = useState<DateFilter>({
    mode: 'month',
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [activeTab, setActiveTab] = useState<'categories' | 'subscriptions' | 'transactions'>('categories');

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

  const dateFiltered = useMemo(() => {
    setSelectedCategoryKey(null);
    return applyDateFilter(transactions, dateFilter);
  }, [transactions, dateFilter]);

  const filteredTransactions = useMemo(() => {
    if (!selectedAccount) return dateFiltered;
    return dateFiltered.filter((tx) => tx.account_id === selectedAccount);
  }, [dateFiltered, selectedAccount]);

  const visibleTransactions = useMemo(() => {
    if (!selectedCategoryKey) return filteredTransactions;
    if (selectedCategoryKey === '__uncategorized__') {
      return filteredTransactions.filter((tx) => !tx.category);
    }
    return filteredTransactions.filter((tx) => tx.category?.id === selectedCategoryKey);
  }, [filteredTransactions, selectedCategoryKey]);

  const prevFiltered = useMemo(() => {
    const prev = applyDateFilter(transactions, getPrevPeriodFilter(dateFilter));
    if (!selectedAccount) return prev;
    return prev.filter((tx) => tx.account_id === selectedAccount);
  }, [transactions, dateFilter, selectedAccount]);

  const categoryRows = useMemo(() =>
    buildCategoryRows(sumByCategory(filteredTransactions), sumByCategory(prevFiltered)),
  [filteredTransactions, prevFiltered]);

  const prevTotalSpending = useMemo(() =>
    prevFiltered.reduce((sum, tx) => {
      if (isExcludedFromSpending(tx)) return sum;
      return sum + Math.abs(Number(tx.amount));
    }, 0),
  [prevFiltered]);

  const periodDays = useMemo(() => {
    if (dateFilter.mode === 'month') {
      return new Date(dateFilter.year, dateFilter.month + 1, 0).getDate();
    }
    const ms = new Date(dateFilter.end).getTime() - new Date(dateFilter.start).getTime();
    return Math.max(1, Math.round(ms / 86_400_000) + 1);
  }, [dateFilter]);

  const { sortedCategories, totalSpending } = useMemo(() => {
    const totals: Record<string, { name: string; color: string; icon: string; total: number; count: number }> = {};
    for (const tx of filteredTransactions) {
      const cat = tx.category;
      if (isExcludedFromSpending(tx)) continue;
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

      {/* Savings rate */}
      <SavingsRateModule
        currentSpending={totalSpending}
        prevSpending={prevTotalSpending}
        monthlyIncome={monthlyIncome}
        periodDays={periodDays}
      />

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

      {/* Section tabs */}
      <div className="flex items-center gap-0 border-b border-sand-200">
        {(['categories', 'subscriptions', 'transactions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-ink-800 text-ink-800'
                : 'border-transparent text-ink-400 hover:text-ink-600'
            }`}
          >
            {tab === 'transactions' && selectedCategoryKey ? (
              <span className="flex items-center gap-1.5">
                Transactions
                <span className="w-1.5 h-1.5 rounded-full bg-ink-600 inline-block" />
              </span>
            ) : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab: Categories */}
      {activeTab === 'categories' && (
        <div className="space-y-6">
          <SpendingCharts
            categories={sortedCategories}
            monthlyData={monthlyChartData}
            totalSpending={totalSpending}
          />

          {categoryRows.length > 0 && (
            <div className="card p-0">
              <div className="px-5 py-3.5 border-b border-sand-100 grid grid-cols-[1fr_auto_auto_auto] gap-x-6 items-center">
                <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider">Category</span>
                <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider text-right w-20">This period</span>
                <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider text-right w-20 hidden sm:block">Last period</span>
                <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider text-right w-16">Change</span>
              </div>
              {categoryRows.map((row) => {
                const isNew = row.delta === null;
                const isIncrease = !isNew && row.delta! > 0;
                const isDecrease = !isNew && row.delta! < 0;
                const isSelected = selectedCategoryKey === row.key;
                return (
                  <button
                    key={row.key}
                    onClick={() => {
                      setSelectedCategoryKey(isSelected ? null : row.key);
                      setActiveTab('transactions');
                    }}
                    className={`w-full px-5 py-3 grid grid-cols-[1fr_auto_auto_auto] gap-x-6 items-center border-b border-sand-50 last:border-0 text-left transition-colors ${
                      isSelected ? 'bg-sand-100' : 'hover:bg-sand-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                      <span className={`text-sm truncate ${isSelected ? 'font-semibold text-ink-800' : 'text-ink-700'}`}>
                        {row.icon} {row.name}
                      </span>
                    </div>
                    <span className="font-mono text-sm text-ink-700 text-right w-20">
                      {row.current > 0 ? formatCurrency(row.current) : <span className="text-ink-300">—</span>}
                    </span>
                    <span className="font-mono text-sm text-ink-400 text-right w-20 hidden sm:block">
                      {row.previous > 0 ? formatCurrency(row.previous) : <span className="text-ink-300">—</span>}
                    </span>
                    <span className={`text-xs font-medium text-right w-16 ${
                      isNew ? 'text-ink-400' : isIncrease ? 'text-accent-red' : isDecrease ? 'text-accent-green' : 'text-ink-300'
                    }`}>
                      {isNew ? 'new' : row.delta === 0 ? '—' : `${isIncrease ? '+' : ''}${row.delta!.toFixed(0)}%`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {filteredTransactions.length === 0 && (
            <div className="card text-center py-16">
              <p className="text-4xl mb-4">📊</p>
              <h3 className="font-display text-xl text-ink-700 mb-2">No transactions</h3>
              <p className="text-ink-400 text-sm">No spending found for this period.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Subscriptions */}
      {activeTab === 'subscriptions' && (
        <SubscriptionsSection
          transactions={transactions}
          initialOverrides={subscriptionOverrides}
        />
      )}

      {/* Tab: Transactions */}
      {activeTab === 'transactions' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {selectedCategoryKey && (() => {
                const row = categoryRows.find((r) => r.key === selectedCategoryKey);
                return row ? (
                  <button
                    onClick={() => setSelectedCategoryKey(null)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-sand-200 bg-sand-100 text-ink-600 hover:bg-sand-200 transition-colors"
                  >
                    <span style={{ color: row.color }}>{row.icon}</span>
                    {row.name}
                    <span className="ml-0.5 text-ink-400">✕</span>
                  </button>
                ) : null;
              })()}
            </div>
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
          {filteredTransactions.length > 0 ? (
            <SpendingTransactions
              transactions={visibleTransactions as any}
              allCategories={allCategories}
              venmoRequests={venmoRequests}
            />
          ) : (
            <div className="card text-center py-16">
              <p className="text-4xl mb-4">📊</p>
              <h3 className="font-display text-xl text-ink-700 mb-2">No transactions</h3>
              <p className="text-ink-400 text-sm">No spending found for this period.</p>
            </div>
          )}
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
