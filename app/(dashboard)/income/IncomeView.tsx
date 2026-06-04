'use client';

import { useState, useMemo } from 'react';
import { formatCurrency, formatCurrencyPrecise, formatShortDate } from '@/app/lib/utils';
import SpendingCharts from '../spending/SpendingCharts';
import type { DateFilter } from '../spending/SpendingView';

interface RawTransaction {
  id: string;
  amount: number;
  description: string;
  payee: string | null;
  posted_at: string;
  account_id: string;
  is_transfer: boolean;
  account: { id: string; name: string; institution: string } | null;
  category: { id: string; name: string; color: string; icon: string; is_income: boolean } | null;
}

interface IncomeCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_income: boolean;
  parent_id: string | null;
}

interface Props {
  transactions: RawTransaction[];
  categories: IncomeCategory[];
  dateFilter: DateFilter;
}

function applyDateFilter(txs: RawTransaction[], filter: DateFilter) {
  let start: string, end: string;
  if (filter.mode === 'month') {
    start = new Date(filter.year, filter.month, 1).toISOString();
    end = new Date(filter.year, filter.month + 1, 0, 23, 59, 59, 999).toISOString();
  } else {
    start = filter.start + 'T00:00:00.000Z';
    end = filter.end + 'T23:59:59.999Z';
  }
  return txs.filter((tx) => tx.posted_at >= start && tx.posted_at <= end);
}

export default function IncomeView({ transactions, categories, dateFilter }: Props) {
  const now = new Date();
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'category'>('date');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const filtered = useMemo(() => applyDateFilter(transactions, dateFilter), [transactions, dateFilter]);

  const totalIncome = useMemo(
    () => filtered.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0),
    [filtered],
  );

  const prevFilter = useMemo<DateFilter>(() => {
    if (dateFilter.mode === 'month') {
      let { year, month } = dateFilter;
      month -= 1;
      if (month < 0) { month = 11; year--; }
      return { mode: 'month', year, month };
    }
    const startMs = new Date(dateFilter.start).getTime();
    const endMs = new Date(dateFilter.end).getTime();
    const duration = endMs - startMs;
    const prevEnd = new Date(startMs - 86_400_000).toISOString().substring(0, 10);
    const prevStart = new Date(startMs - 86_400_000 - duration).toISOString().substring(0, 10);
    return { mode: 'custom', start: prevStart, end: prevEnd };
  }, [dateFilter]);

  const prevTotal = useMemo(
    () => applyDateFilter(transactions, prevFilter).reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0),
    [transactions, prevFilter],
  );

  const momDelta = prevTotal > 0 ? ((totalIncome - prevTotal) / prevTotal) * 100 : null;

  const categoryRows = useMemo(() => {
    const map = new Map<string, { name: string; color: string; icon: string; total: number; count: number }>();
    for (const tx of filtered) {
      const cat = tx.category;
      const key = cat?.id ?? '__uncategorized__';
      if (!map.has(key)) {
        map.set(key, { name: cat?.name ?? 'Uncategorized', color: cat?.color ?? '#D1D5DB', icon: cat?.icon ?? '❓', total: 0, count: 0 });
      }
      const entry = map.get(key)!;
      entry.total += Math.abs(Number(tx.amount));
      entry.count += 1;
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const monthlyChartData = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const tx of transactions) {
      const month = tx.posted_at.substring(0, 7);
      byMonth[month] = (byMonth[month] || 0) + Math.abs(Number(tx.amount));
    }
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        total: Math.round(total),
        isCurrentMonth: month === currentMonthKey,
      }));
  }, [transactions, now]);

  const visibleTransactions = useMemo(() => {
    let result = filtered;
    if (selectedCategoryId) result = result.filter((tx) => tx.category?.id === selectedCategoryId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((tx) => {
        const name = (tx.payee ?? tx.description ?? '').toLowerCase();
        const cat = (tx.category?.name ?? '').toLowerCase();
        return name.includes(q) || cat.includes(q);
      });
    }
    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime();
      else if (sortBy === 'amount') cmp = Math.abs(a.amount) - Math.abs(b.amount);
      else if (sortBy === 'category') cmp = (a.category?.name ?? '').localeCompare(b.category?.name ?? '');
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, selectedCategoryId, search, sortBy, sortDir]);

  function toggleSort(field: typeof sortBy) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir(field === 'category' ? 'asc' : 'desc'); }
  }

  return (
    <div className="space-y-8">
      {/* Summary card */}
      <div className="card flex flex-wrap gap-x-10 gap-y-4 items-center">
        <div>
          <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-1">Total income</p>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-3xl font-semibold tabular-nums text-accent-green">
              {formatCurrency(totalIncome)}
            </span>
            {momDelta !== null && (
              <span className={`flex items-center gap-0.5 text-xs font-medium ${momDelta > 0 ? 'text-accent-green' : momDelta < 0 ? 'text-accent-red' : 'text-ink-300'}`}>
                {momDelta > 0 ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                  </svg>
                ) : momDelta < 0 ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : null}
                {Math.abs(momDelta).toFixed(1)}% vs prior period
              </span>
            )}
          </div>
          {prevTotal > 0 && (
            <p className="text-xs text-ink-400 mt-1">Prior period: <span className="font-mono">{formatCurrency(prevTotal)}</span></p>
          )}
        </div>

        {categoryRows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {categoryRows.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId((prev) => prev === cat.id ? null : cat.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  selectedCategoryId === cat.id ? 'text-white border-transparent' : 'bg-white border-sand-200 text-ink-600 hover:border-sand-300'
                }`}
                style={selectedCategoryId === cat.id ? { backgroundColor: cat.color, borderColor: cat.color } : {}}
              >
                <span>{cat.icon}</span>
                {cat.name}
                <span className={`font-mono ${selectedCategoryId === cat.id ? 'text-white/80' : 'text-ink-400'}`}>
                  {formatCurrency(cat.total)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Charts */}
      <SpendingCharts
        categories={categoryRows.map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon, total: c.total, count: c.count }))}
        monthlyData={monthlyChartData}
        totalSpending={totalIncome}
        selectedCategoryKey={selectedCategoryId}
        onCategoryClick={(id) => setSelectedCategoryId((prev) => prev === id ? null : id)}
        barColor="#16A34A"
        barLabel="Monthly income"
      />

      {/* Transaction list */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-ink-400 shrink-0">Sort by</span>
          {(['date', 'amount', 'category'] as const).map((field) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                sortBy === field ? 'bg-ink-800 text-white' : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
              }`}
            >
              {field.charAt(0).toUpperCase() + field.slice(1)}
              {sortBy === field && (
                <svg className={`w-3 h-3 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          ))}
          <div className="relative ml-auto">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1 bg-white border border-sand-200 rounded-lg text-xs text-ink-700 placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-sand-300 w-40"
            />
          </div>
        </div>

        <div className="card p-0">
          {visibleTransactions.length === 0 ? (
            <div className="py-12 text-center text-ink-400 text-sm">No income transactions for this period.</div>
          ) : (
            visibleTransactions.map((tx) => {
              const displayName = tx.payee ?? tx.description ?? 'Unknown';
              const catColor = tx.category?.color ?? '#D1D5DB';
              const catName = tx.category?.name ?? 'Uncategorized';
              const catIcon = tx.category?.icon ?? '❓';
              return (
                <div key={tx.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-sand-100 last:border-0 hover:bg-sand-50 transition-colors">
                  <span className="text-lg w-8 text-center flex-shrink-0">{catIcon}</span>
                  <div className="flex-1 min-w-0">
                    <p data-sensitive className="text-sm font-medium text-ink-700 truncate">{displayName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="inline-block px-1.5 py-px rounded text-[10px] font-medium" style={{ backgroundColor: catColor + '20', color: catColor }}>
                        {catName}
                      </span>
                      {tx.account && (
                        <span className="text-xs text-ink-300">{tx.account.institution || tx.account.name}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-ink-300 flex-shrink-0 hidden sm:block w-14 text-right">
                    {formatShortDate(tx.posted_at)}
                  </span>
                  <span className="font-mono text-sm font-medium flex-shrink-0 w-20 text-right text-accent-green">
                    +{formatCurrencyPrecise(Math.abs(tx.amount))}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {visibleTransactions.length > 0 && (
          <p className="text-xs text-ink-400 text-center">
            {visibleTransactions.length} transaction{visibleTransactions.length !== 1 ? 's' : ''}
            {(search || selectedCategoryId) && ` · filtered from ${filtered.length}`}
          </p>
        )}
      </div>
    </div>
  );
}
