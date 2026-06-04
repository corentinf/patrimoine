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
  budgets: Record<string, number>;
}

export type DateFilter =
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

// Rolls sub-categories up to their parent for aggregation.
// Returns a map keyed by parent category ID (or '__uncategorized__').
// Each entry includes a subBreakdown for sub-categories that contributed to this total.
function sumByCategory(
  txs: RawTransaction[],
  subCatToParent: Map<string, string>,
  catMeta: Map<string, { name: string; color: string; icon: string }>,
): Map<string, {
  name: string; color: string; icon: string; total: number;
  subBreakdown: Map<string, { id: string; name: string; color: string; icon: string; total: number }>;
}> {
  const map = new Map<string, {
    name: string; color: string; icon: string; total: number;
    subBreakdown: Map<string, { id: string; name: string; color: string; icon: string; total: number }>;
  }>();

  for (const tx of txs) {
    if (isExcludedFromSpending(tx)) continue;
    const cat = tx.category;
    const amount = Math.abs(Number(tx.amount));
    const parentId = cat ? (subCatToParent.get(cat.id) ?? cat.id) : null;
    const key = parentId ?? '__uncategorized__';

    if (!map.has(key)) {
      const meta = parentId ? (catMeta.get(parentId) ?? { name: cat?.name ?? 'Uncategorized', color: cat?.color ?? '#D1D5DB', icon: cat?.icon ?? '❓' }) : { name: 'Uncategorized', color: '#D1D5DB', icon: '❓' };
      map.set(key, { ...meta, total: 0, subBreakdown: new Map() });
    }
    const entry = map.get(key)!;
    entry.total += amount;

    // Track sub-breakdown if this is a sub-category transaction
    if (cat && subCatToParent.has(cat.id)) {
      if (!entry.subBreakdown.has(cat.id)) {
        entry.subBreakdown.set(cat.id, { id: cat.id, name: cat.name, color: cat.color, icon: cat.icon, total: 0 });
      }
      entry.subBreakdown.get(cat.id)!.total += amount;
    }
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
  subBreakdown: Array<{ id: string; name: string; color: string; icon: string; total: number }>;
}

type SumByCatMap = Map<string, {
  name: string; color: string; icon: string; total: number;
  subBreakdown: Map<string, { id: string; name: string; color: string; icon: string; total: number }>;
}>;

function buildCategoryRows(current: SumByCatMap, previous: SumByCatMap): CategoryRow[] {
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
    const subBreakdown = Array.from(cur?.subBreakdown?.values() ?? [])
      .sort((a, b) => b.total - a.total);
    rows.push({ key, name: meta.name, color: meta.color, icon: meta.icon, current: currentTotal, previous: previousTotal, delta, subBreakdown });
  }
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

export default function SpendingView({ transactions, monthlyRaw, allCategories, venmoRequests, subscriptionOverrides, monthlyIncome, budgets: initialBudgets }: SpendingViewProps) {
  const now = new Date();
  const [dateFilter, setDateFilter] = useState<DateFilter>({
    mode: 'month',
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);

  // Derived lookup maps for sub-category hierarchy
  const subCatToParent = useMemo(() => {
    const m = new Map<string, string>();
    for (const cat of allCategories) { if (cat.parent_id) m.set(cat.id, cat.parent_id); }
    return m;
  }, [allCategories]);

  const catMeta = useMemo(() => {
    return new Map(allCategories.map((c) => [c.id, { name: c.name, color: c.color, icon: c.icon }]));
  }, [allCategories]);

  // Child IDs by parent — used so clicking a parent key also includes sub-cat transactions
  const childIdsByParent = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const cat of allCategories) {
      if (cat.parent_id) {
        if (!m.has(cat.parent_id)) m.set(cat.parent_id, []);
        m.get(cat.parent_id)!.push(cat.id);
      }
    }
    return m;
  }, [allCategories]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [activeTab, setActiveTab] = useState<'categories' | 'subscriptions' | 'transactions'>('transactions');
  const [budgets, setBudgets] = useState<Record<string, number>>(initialBudgets);
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [budgetDraft, setBudgetDraft] = useState('');

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
    const childIds = childIdsByParent.get(selectedCategoryKey) ?? [];
    const allowed = new Set([selectedCategoryKey, ...childIds]);
    return filteredTransactions.filter((tx) => allowed.has(tx.category?.id ?? ''));
  }, [filteredTransactions, selectedCategoryKey, childIdsByParent]);

  // Transactions tab: full dataset (all months) — its own toolbar lets the user
  // filter independently of the page-level date picker that drives the charts.
  const allAccountFiltered = useMemo(() => {
    if (!selectedAccount) return transactions;
    return transactions.filter((tx) => tx.account_id === selectedAccount);
  }, [transactions, selectedAccount]);

  const allTabTransactions = useMemo(() => {
    if (!selectedCategoryKey) return allAccountFiltered;
    if (selectedCategoryKey === '__uncategorized__') {
      return allAccountFiltered.filter((tx) => !tx.category);
    }
    const childIds = childIdsByParent.get(selectedCategoryKey) ?? [];
    const allowed = new Set([selectedCategoryKey, ...childIds]);
    return allAccountFiltered.filter((tx) => allowed.has(tx.category?.id ?? ''));
  }, [allAccountFiltered, selectedCategoryKey, childIdsByParent]);

  const prevFiltered = useMemo(() => {
    const prev = applyDateFilter(transactions, getPrevPeriodFilter(dateFilter));
    if (!selectedAccount) return prev;
    return prev.filter((tx) => tx.account_id === selectedAccount);
  }, [transactions, dateFilter, selectedAccount]);

  const categoryRows = useMemo(() =>
    buildCategoryRows(
      sumByCategory(filteredTransactions, subCatToParent, catMeta),
      sumByCategory(prevFiltered, subCatToParent, catMeta),
    ),
  [filteredTransactions, prevFiltered, subCatToParent, catMeta]);

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
    const rolled = sumByCategory(filteredTransactions, subCatToParent, catMeta);
    const sorted = Array.from(rolled.entries()).map(([key, v]) => ({
      id: key === '__uncategorized__' ? undefined : key,
      name: v.name,
      color: v.color,
      icon: v.icon,
      total: v.total,
      count: Array.from(filteredTransactions).filter((tx) => {
        if (isExcludedFromSpending(tx)) return false;
        const parentId = tx.category ? (subCatToParent.get(tx.category.id) ?? tx.category.id) : null;
        return (parentId ?? '__uncategorized__') === key;
      }).length,
    })).sort((a, b) => b.total - a.total);
    return { sortedCategories: sorted, totalSpending: sorted.reduce((s, c) => s + c.total, 0) };
  }, [filteredTransactions, subCatToParent, catMeta]);

  const monthlyChartData = useMemo(() => {
    const src = selectedAccount
      ? monthlyRaw.filter((tx) => tx.account_id === selectedAccount)
      : monthlyRaw;
    const byMonth: Record<string, number> = {};
    for (const tx of src) {
      const month = tx.posted_at.substring(0, 7);
      byMonth[month] = (byMonth[month] || 0) + Math.abs(Number(tx.amount));
    }

    // Always include the current month using the full transactions dataset,
    // which is more up-to-date than the separately-fetched monthlyRaw query.
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    const currentMonthTotal = (selectedAccount ? transactions.filter((t) => t.account_id === selectedAccount) : transactions)
      .filter((t) => t.posted_at >= currentMonthStart && t.posted_at <= currentMonthEnd)
      .reduce((sum, t) => (isExcludedFromSpending(t) ? sum : sum + Math.abs(Number(t.amount))), 0);
    if (currentMonthTotal > 0) byMonth[currentMonthKey] = currentMonthTotal;

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        total: Math.round(total),
        isCurrentMonth: month === currentMonthKey,
      }));
  }, [monthlyRaw, selectedAccount, transactions, now]);

  const saveBudget = async (categoryId: string) => {
    const val = parseFloat(budgetDraft);
    if (isNaN(val) || val <= 0) {
      await deleteBudget(categoryId);
      return;
    }
    const prev = budgets;
    setBudgets((b) => ({ ...b, [categoryId]: val }));
    setEditingBudget(null);
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId, monthly_amount: val }),
      });
      if (!res.ok) {
        console.error('Budget save failed:', await res.json().catch(() => ({})));
        setBudgets(prev);
      }
    } catch (e) {
      console.error('Budget save error:', e);
      setBudgets(prev);
    }
  };

  const deleteBudget = async (categoryId: string) => {
    const prev = budgets;
    setBudgets((b) => { const n = { ...b }; delete n[categoryId]; return n; });
    setEditingBudget(null);
    try {
      const res = await fetch('/api/budgets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId }),
      });
      if (!res.ok) setBudgets(prev);
    } catch {
      setBudgets(prev);
    }
  };

  const periodLabel = dateFilter.mode === 'month'
    ? formatMonthLabel(dateFilter.year, dateFilter.month)
    : `${dateFilter.start} – ${dateFilter.end}`;

  const pacedTotal = useMemo(() => {
    if (dateFilter.mode !== 'month') return null;
    if (dateFilter.year !== now.getFullYear() || dateFilter.month !== now.getMonth()) return null;
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(dateFilter.year, dateFilter.month + 1, 0).getDate();
    if (dayOfMonth >= daysInMonth - 1) return null;
    const LARGE_THRESHOLD = 500;
    let recurringSpend = 0;
    let largeSpend = 0;
    for (const tx of filteredTransactions) {
      if (isExcludedFromSpending(tx)) continue;
      const amount = Math.abs(Number(tx.amount));
      if (amount >= LARGE_THRESHOLD) largeSpend += amount;
      else recurringSpend += amount;
    }
    const paced = Math.round((recurringSpend / dayOfMonth) * daysInMonth);
    return { paced, largeTotal: Math.round(largeSpend) };
  }, [dateFilter, filteredTransactions, now]);

  const goMonth = (delta: number) => {
    if (dateFilter.mode !== 'month') return;
    let { year, month } = dateFilter;
    month += delta;
    if (month < 0) { month = 11; year--; }
    if (month > 11) { month = 0; year++; }
    setDateFilter({ mode: 'month', year, month });
  };

  const isCurrentMonth =
    dateFilter.mode === 'month' &&
    dateFilter.year === now.getFullYear() &&
    dateFilter.month === now.getMonth();

  const activateCustom = () => {
    setShowCustom(true);
    const monthStart = dateFilter.mode === 'month'
      ? new Date(dateFilter.year, dateFilter.month, 1).toISOString().substring(0, 10)
      : (dateFilter as any).start;
    const monthEnd = dateFilter.mode === 'month'
      ? new Date(dateFilter.year, dateFilter.month + 1, 0).toISOString().substring(0, 10)
      : (dateFilter as any).end;
    setDateFilter({ mode: 'custom', start: monthStart, end: monthEnd });
  };

  const backToMonth = () => {
    setShowCustom(false);
    setDateFilter({ mode: 'month', year: now.getFullYear(), month: now.getMonth() });
  };

  return (
    <div className="space-y-8">
      {(() => {
        const dateNav = showCustom && dateFilter.mode === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-ink-400">From</label>
              <input
                type="date"
                value={dateFilter.start}
                max={dateFilter.end}
                onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
                className="text-xs px-2 py-1 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-ink-400">To</label>
              <input
                type="date"
                value={dateFilter.end}
                min={dateFilter.start}
                max={now.toISOString().substring(0, 10)}
                onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
                className="text-xs px-2 py-1 border border-sand-200 rounded-lg focus:outline-none focus:border-ink-400 text-ink-700"
              />
            </div>
            <button onClick={backToMonth} className="text-xs text-ink-400 hover:text-ink-600 transition-colors whitespace-nowrap">
              ← Month view
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => goMonth(-1)}
              className="p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-sand-100 transition-colors"
              aria-label="Previous month"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="stat-label px-1">{periodLabel}</span>
            <button
              onClick={() => goMonth(1)}
              disabled={isCurrentMonth}
              className="p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-sand-100 transition-colors disabled:opacity-30 disabled:cursor-default"
              aria-label="Next month"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={activateCustom}
              className="ml-0.5 p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-sand-100 transition-colors"
              title="Custom date range"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        );

        return (
          <div className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-2 bg-sand-50/95 backdrop-blur-sm border-b border-sand-200/60 md:static md:mx-0 md:px-0 md:pt-0 md:pb-0 md:bg-transparent md:backdrop-blur-none md:border-0">
            {/* Mobile: compact 2-row layout */}
            <div className="md:hidden space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl text-ink-800 leading-none">Spending</h2>
                <p className="font-display text-2xl tracking-tight text-accent-red leading-none">
                  {formatCurrency(totalSpending)}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0 [&>*]:flex-wrap">{dateNav}</div>
              </div>
            </div>

            {/* Desktop: title + date nav */}
            <div className="hidden md:flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl text-ink-800">Spending</h2>
                <p className="text-sm text-ink-400 mt-1">Where your money goes</p>
              </div>
              <div className="flex justify-end">{dateNav}</div>
            </div>
          </div>
        );
      })()}

      {/* Spending + savings rate combined card */}
      <SavingsRateModule
        currentSpending={totalSpending}
        prevSpending={prevTotalSpending}
        monthlyIncome={monthlyIncome}
        periodDays={periodDays}
        pacedTotal={pacedTotal}
      />

      {/* Charts — always visible above tabs */}
      <SpendingCharts
        categories={sortedCategories}
        monthlyData={monthlyChartData}
        totalSpending={totalSpending}
        selectedCategoryKey={selectedCategoryKey}
        onCategoryClick={(id) => {
          setSelectedCategoryKey((prev) => prev === id ? null : id);
          setActiveTab('transactions');
        }}
      />

      {/* Section tabs */}
      <div className="flex items-center gap-0 border-b border-sand-200">
        {(['transactions', 'categories', 'subscriptions'] as const).map((tab) => (
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
                const budget = row.key !== '__uncategorized__' ? budgets[row.key] : undefined;
                const isEditingBudget = editingBudget === row.key;
                const pct = budget ? Math.min((row.current / budget) * 100, 100) : 0;
                const overBudget = budget ? row.current > budget : false;
                const barColor = !budget ? '' : overBudget ? 'bg-accent-red' : pct >= 80 ? 'bg-yellow-400' : 'bg-accent-green';
                return (
                  <div
                    key={row.key}
                    className={`border-b border-sand-50 last:border-0 transition-colors ${isSelected ? 'bg-sand-100' : 'hover:bg-sand-50'}`}
                  >
                    {/* Main row */}
                    <button
                      onClick={() => {
                        setSelectedCategoryKey(isSelected ? null : row.key);
                        setActiveTab('transactions');
                      }}
                      className="w-full px-5 pt-3 pb-1 grid grid-cols-[1fr_auto_auto_auto] gap-x-6 items-center text-left"
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

                    {/* Sub-category breakdown (when sub-cats contributed to this parent's total) */}
                    {row.subBreakdown.length > 0 && (
                      <div className="mx-5 mb-1 rounded-lg bg-sand-50 overflow-hidden">
                        {row.subBreakdown.map((sub) => (
                          <button
                            key={sub.id}
                            onClick={() => { setSelectedCategoryKey(sub.id); setActiveTab('transactions'); }}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-sand-100 transition-colors border-b border-sand-100/60 last:border-0"
                          >
                            <span className="text-xs w-4 text-center flex-shrink-0">{sub.icon}</span>
                            <span className="flex-1 text-xs text-ink-500">{sub.name}</span>
                            <span className="font-mono text-xs text-ink-500">{formatCurrency(sub.total)}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Budget row */}
                    {row.key !== '__uncategorized__' && (
                      <div className="px-5 pb-2.5">
                        {isEditingBudget ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-ink-400">$</span>
                              <input
                                type="number"
                                min="0"
                                step="50"
                                value={budgetDraft}
                                onChange={(e) => setBudgetDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveBudget(row.key);
                                  if (e.key === 'Escape') setEditingBudget(null);
                                }}
                                autoFocus
                                placeholder="0"
                                className="pl-5 pr-2 py-0.5 text-xs border border-sand-200 rounded-md focus:outline-none focus:border-ink-400 text-ink-700 w-24"
                              />
                            </div>
                            <span className="text-xs text-ink-400">/mo budget</span>
                            <button
                              onClick={() => saveBudget(row.key)}
                              className="text-xs px-2 py-0.5 rounded-md bg-ink-800 text-white hover:bg-ink-700 transition-colors"
                            >
                              Save
                            </button>
                            {budget && (
                              <button
                                onClick={() => deleteBudget(row.key)}
                                className="text-xs text-ink-300 hover:text-accent-red transition-colors"
                              >
                                Remove
                              </button>
                            )}
                            <button onClick={() => setEditingBudget(null)} className="text-xs text-ink-300 hover:text-ink-500">
                              Cancel
                            </button>
                          </div>
                        ) : budget ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex-1 h-1.5 bg-sand-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${barColor}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`text-xs tabular-nums shrink-0 ${overBudget ? 'text-accent-red font-medium' : 'text-ink-300'}`}>
                              {overBudget
                                ? `${formatCurrency(row.current - budget)} over`
                                : `${formatCurrency(budget - row.current)} left`}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setBudgetDraft(String(budget)); setEditingBudget(row.key); }}
                              className="text-xs text-ink-300 hover:text-ink-500 transition-colors shrink-0"
                            >
                              {formatCurrency(budget)}/mo
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setBudgetDraft(''); setEditingBudget(row.key); }}
                            className="text-xs text-ink-300 hover:text-ink-500 transition-colors mt-0.5"
                          >
                            + Set budget
                          </button>
                        )}
                      </div>
                    )}
                  </div>
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
          monthlyIncome={monthlyIncome}
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
          {allTabTransactions.length > 0 ? (
            <SpendingTransactions
              transactions={allTabTransactions as any}
              allCategories={allCategories}
              venmoRequests={venmoRequests}
              accounts={accounts}
              selectedAccount={selectedAccount}
              onAccountChange={setSelectedAccount}
              externalDateFilter={dateFilter}
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
