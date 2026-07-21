'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { formatCurrency } from '@/app/lib/utils';
import SpendingCharts from '../spending/SpendingCharts';
import SpendingProgress from '../spending/SpendingProgress';
import TransactionRow from '../spending/TransactionRow';
import TransactionDetail from '../spending/TransactionDetail';
import type { Category } from '../spending/CategoryManager';
import { useGlobalFilter, type DateFilter } from '@/app/lib/globalFilter';

interface RawTransaction {
  id: string;
  amount: number;
  description: string;
  payee: string | null;
  memo: string | null;
  posted_at: string;
  account_id: string;
  is_transfer: boolean;
  is_reimbursable: boolean;
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
  dailyIncome?: { date: string; amount: number }[];
}

// Compare date portions only (not full ISO timestamps) — avoids timezone/format
// string mismatches, and matches how the daily chart groups its data by
// tx.posted_at.slice(0, 10). See SpendingView's applyDateFilter for the same fix.
function applyDateFilter(txs: RawTransaction[], filter: DateFilter) {
  if (filter.mode === 'month') {
    const monthStr = `${filter.year}-${String(filter.month + 1).padStart(2, '0')}`;
    return txs.filter((tx) => tx.posted_at.substring(0, 7) === monthStr);
  }
  return txs.filter((tx) => {
    const d = tx.posted_at.slice(0, 10);
    return d >= filter.start && d <= filter.end;
  });
}

export default function IncomeView({ transactions, categories, dailyIncome = [] }: Props) {
  const { dateFilter, resolvedRange, segment, category, setSegment, clearSegment, setCategory, clearCategory } = useGlobalFilter();
  const selectedCategoryId = category?.key ?? null;
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'category'>('date');
  const [visibleCount, setVisibleCount] = useState(50);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Optimistic overrides — mirrors Spending's inline-edit pattern.
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, Category>>({});
  const [payeeOverrides, setPayeeOverrides] = useState<Record<string, string>>({});
  const [transferOverrides, setTransferOverrides] = useState<Record<string, boolean>>({});
  const [detailTxId, setDetailTxId] = useState<string | null>(null);

  function getEffectiveCategory(tx: RawTransaction): RawTransaction['category'] {
    return (categoryOverrides[tx.id] as any) ?? tx.category;
  }

  function getEffectivePayee(tx: RawTransaction): string {
    return payeeOverrides[tx.id] ?? tx.payee ?? tx.description ?? 'Unknown';
  }

  // When a bar/period is selected (SpendingProgress), use that as the
  // display filter for everything else on the page — mirrors Spending.
  const viewFilter = useMemo<DateFilter>(
    () => (segment ? { mode: 'custom', start: segment.start, end: segment.end } : dateFilter),
    [segment, dateFilter],
  );

  // Drop any category drill-down when the effective date window changes —
  // it may no longer apply to the newly-filtered transactions.
  useEffect(() => {
    clearCategory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewFilter]);

  const filtered = useMemo(() => applyDateFilter(transactions, viewFilter), [transactions, viewFilter]);

  const totalIncome = useMemo(
    () => filtered.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0),
    [filtered],
  );

  const prevFilter = useMemo<DateFilter>(() => {
    if (viewFilter.mode === 'month') {
      let { year, month } = viewFilter;
      month -= 1;
      if (month < 0) { month = 11; year--; }
      return { mode: 'month', year, month };
    }
    const startMs = new Date(viewFilter.start).getTime();
    const endMs = new Date(viewFilter.end).getTime();
    const duration = endMs - startMs;
    const prevEnd = new Date(startMs - 86_400_000).toISOString().substring(0, 10);
    const prevStart = new Date(startMs - 86_400_000 - duration).toISOString().substring(0, 10);
    return { mode: 'custom', start: prevStart, end: prevEnd };
  }, [viewFilter]);

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

  // Effective daily series for "Income over time": narrowed whenever the
  // single category drill-down (donut/pill click) is active; otherwise
  // falls back to the server-computed full daily total.
  const narrowedDailyIncome = useMemo(() => {
    if (!category) return null;
    const isUncategorized = category.key === '__uncategorized__';
    const byDay = new Map<string, number>();
    for (const tx of filtered) {
      const matches = isUncategorized ? !tx.category : tx.category?.id === category.key;
      if (!matches) continue;
      const day = tx.posted_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + Math.abs(Number(tx.amount)));
    }
    return Array.from(byDay.entries())
      .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [category, filtered]);

  const tableBase = filtered;

  useEffect(() => { setVisibleCount(50); }, [tableBase, selectedCategoryId, search]);

  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount((n) => n + 50); },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const visibleTransactions = useMemo(() => {
    let result = tableBase;
    if (selectedCategoryId) result = result.filter((tx) => tx.category?.id === selectedCategoryId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((tx) => {
        const name = getEffectivePayee(tx).toLowerCase();
        const cat = (getEffectiveCategory(tx)?.name ?? '').toLowerCase();
        return name.includes(q) || cat.includes(q);
      });
    }
    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime();
      else if (sortBy === 'amount') cmp = Math.abs(a.amount) - Math.abs(b.amount);
      else if (sortBy === 'category') cmp = (getEffectiveCategory(a)?.name ?? '').localeCompare(getEffectiveCategory(b)?.name ?? '');
      return sortDir === 'desc' ? -cmp : cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableBase, selectedCategoryId, search, sortBy, sortDir, categoryOverrides, payeeOverrides]);

  function toggleSort(field: typeof sortBy) {
    if (sortBy === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir(field === 'category' ? 'asc' : 'desc'); }
  }

  return (
    <div className="space-y-5">
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
                onClick={() => {
                  if (category?.key === cat.id) clearCategory();
                  else setCategory({ key: cat.id, label: cat.name, color: cat.color, icon: cat.icon });
                }}
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

      {/* Income over time + By Category side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4 items-start">
        <SpendingProgress
          data={narrowedDailyIncome ?? dailyIncome}
          rangeStart={resolvedRange.start}
          rangeEnd={resolvedRange.end}
          label="Income over time"
          color="#16A34A"
          valueLabel="earned"
          onPeriodSelect={(range) => {
            if (!range) {
              clearSegment();
              return;
            }
            const label = range.start === range.end
              ? new Date(range.start + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : `${range.start} – ${range.end}`;
            setSegment({ label, start: range.start, end: range.end });
          }}
        />
        <div className="w-72 flex-shrink-0">
          <SpendingCharts
            categories={categoryRows.map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon, total: c.total, count: c.count }))}
            monthlyData={[]}
            totalSpending={totalIncome}
            selectedCategoryKey={selectedCategoryId}
            onCategoryClick={(id) => {
              if (category?.key === id) {
                clearCategory();
              } else {
                const row = categoryRows.find((c) => c.id === id);
                if (row) setCategory({ key: id, label: row.name, color: row.color, icon: row.icon });
              }
            }}
          />
        </div>
      </div>

      {/* Transaction list */}
      <div>
        <div className="sticky top-0 md:top-24 z-10 bg-sand-50 pb-2">
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
        </div>

        <div className="card p-0">
          {visibleTransactions.length === 0 ? (
            <div className="py-12 text-center text-ink-400 text-sm">No income transactions for this period.</div>
          ) : (
            visibleTransactions.slice(0, visibleCount).map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={{ ...tx, payee: getEffectivePayee(tx) }}
                allCategories={categories}
                initialVenmo={null}
                knownVenmoNames={[]}
                localCategory={categoryOverrides[tx.id] ?? null}
                localIsTransfer={transferOverrides[tx.id] ?? tx.is_transfer}
                isReimbursable={tx.is_reimbursable}
                selectMode={false}
                selected={false}
                onToggleSelect={() => {}}
                hideVenmo
                onCategoryChange={(txId, cat) => {
                  const source = transactions.find((t) => t.id === txId);
                  setCategoryOverrides((prev) => {
                    const next = { ...prev };
                    for (const t of transactions) {
                      const matches = source?.payee
                        ? t.payee === source.payee
                        : t.description === source?.description;
                      if (matches) next[t.id] = cat;
                    }
                    return next;
                  });
                }}
                onTransferChange={(txId, value) =>
                  setTransferOverrides((prev) => ({ ...prev, [txId]: value }))
                }
                onRowClick={() => setDetailTxId(tx.id)}
              />
            ))
          )}
        </div>

        <div ref={sentinelRef} className="h-1" />

        {visibleTransactions.length > 0 && (
          <p className="text-xs text-ink-400 text-center mt-3">
            {Math.min(visibleCount, visibleTransactions.length)} of {visibleTransactions.length} transaction{visibleTransactions.length !== 1 ? 's' : ''}
            {visibleTransactions.length !== transactions.length && ` · filtered from ${transactions.length}`}
          </p>
        )}
      </div>

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-8 right-8 z-30 w-10 h-10 rounded-full bg-ink-800 text-white shadow-lg flex items-center justify-center hover:bg-ink-700 transition-colors"
          aria-label="Scroll to top"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      )}

      {detailTxId && (() => {
        const detailTx = transactions.find((t) => t.id === detailTxId);
        if (!detailTx) return null;
        return (
          <TransactionDetail
            transaction={detailTx}
            allCategories={categories}
            onClose={() => setDetailTxId(null)}
            hideVenmo
            onCategoryChange={(txId, cat) => {
              const source = transactions.find((t) => t.id === txId);
              setCategoryOverrides((prev) => {
                const next = { ...prev };
                for (const t of transactions) {
                  const matches = source?.payee
                    ? t.payee === source.payee
                    : t.description === source?.description;
                  if (matches) next[t.id] = cat;
                }
                return next;
              });
            }}
            onPayeeChange={(txId, payee) =>
              setPayeeOverrides((prev) => ({ ...prev, [txId]: payee }))
            }
          />
        );
      })()}
    </div>
  );
}
