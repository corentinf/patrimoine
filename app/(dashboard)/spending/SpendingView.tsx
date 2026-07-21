'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { formatCurrency, formatCurrencyPrecise } from '@/app/lib/utils';
import { useGlobalFilter, type DateFilter } from '@/app/lib/globalFilter';
import { useSetPageFilterSlot } from '@/app/lib/pageFilterSlot';
import SpendingCharts from './SpendingCharts';
import SpendingProgress from './SpendingProgress';
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
  dailySpending: { date: string; amount: number }[];
}

export type { DateFilter };

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

// Applies the header's category-pill + search filters to a transaction list.
// `filterCategories` holds category names; selecting a parent also matches its children.
function applySearchAndCategoryFilter(
  txs: RawTransaction[],
  filterCategories: string[],
  search: string,
  allCategories: Category[],
): RawTransaction[] {
  let result = txs;
  if (filterCategories.length > 0) {
    const matchNames = new Set<string>(filterCategories);
    for (const name of filterCategories) {
      const parent = allCategories.find((c) => c.name === name && !c.parent_id);
      if (parent) {
        allCategories.filter((c) => c.parent_id === parent.id).forEach((c) => matchNames.add(c.name));
      }
    }
    result = result.filter((tx) => matchNames.has(tx.category?.name || 'Uncategorized'));
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter((tx) => {
      const name = (tx.payee ?? tx.description ?? 'Unknown').toLowerCase();
      const cat = (tx.category?.name || 'Uncategorized').toLowerCase();
      const amount = formatCurrencyPrecise(Math.abs(tx.amount)).toLowerCase();
      return name.includes(q) || cat.includes(q) || amount.includes(q);
    });
  }
  return result;
}

function isExcludedFromSpending(tx: RawTransaction): boolean {
  // "Transfer" category = investment/brokerage transfers, credit card payments → excluded.
  // "Personal Payments" category = Venmo/Zelle P2P → included (not named "Transfer").
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

function AccountDropdown({
  accounts,
  selectedAccount,
  onChange,
}: {
  accounts: { id: string; name: string; institution: string }[];
  selectedAccount: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = accounts.find((a) => a.id === selectedAccount);
  const label = selected ? (selected.institution || selected.name) : 'Account';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
          selectedAccount
            ? 'bg-ink-800 text-white'
            : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
        }`}
      >
        {label}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-sand-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]">
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left border-b border-sand-100 transition-colors ${
              !selectedAccount ? 'font-medium text-ink-800 bg-sand-50' : 'text-ink-500 hover:bg-sand-50'
            }`}
          >
            All accounts
            {!selectedAccount && (
              <svg className="w-3.5 h-3.5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => { onChange(a.id); setOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left border-b border-sand-50 last:border-0 transition-colors ${
                selectedAccount === a.id ? 'font-medium text-ink-800 bg-sand-50' : 'text-ink-500 hover:bg-sand-50'
              }`}
            >
              <span>
                <span className="block text-ink-700">{a.institution || a.name}</span>
                {a.institution && a.name !== a.institution && (
                  <span className="text-xs text-ink-300">{a.name}</span>
                )}
              </span>
              {selectedAccount === a.id && (
                <svg className="w-3.5 h-3.5 text-ink-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LONG_PRESS_MS = 500;

// Tap: select only this category (replacing any existing selection), or
// deselect if already active. Desktop: hover reveals a "+" to add this
// category to the current selection instead of replacing it. Touch has no
// hover, so a long-press does the same "add" action there.
function CategoryPill({
  cat, active, hasActivity, hasSelection, onSelectOnly, onDeselect, onAddToSelection,
}: {
  cat: { name: string; icon: string; color: string };
  active: boolean;
  hasActivity: boolean;
  hasSelection: boolean;
  onSelectOnly: () => void;
  onDeselect: () => void;
  onAddToSelection: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  function clearPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setPressed(false);
  }

  function handleTouchStart() {
    longPressFired.current = false;
    setPressed(true);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setPressed(false);
      onAddToSelection();
    }, LONG_PRESS_MS);
  }

  function handleClick() {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (active) onDeselect();
    else onSelectOnly();
  }

  return (
    <div
      className={`relative group/catpill inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        pressed ? 'scale-95' : ''
      } ${
        active
          ? 'text-white border-transparent'
          : hasActivity
            ? 'bg-white border-sand-200 text-ink-600 hover:border-sand-300'
            : 'bg-white border-sand-100 text-ink-300 hover:border-sand-200'
      }`}
      style={{
        ...(active ? { backgroundColor: cat.color, borderColor: cat.color } : {}),
        ...(!active && hasActivity ? { backgroundColor: cat.color + '14' } : {}),
      }}
    >
      <button
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={clearPress}
        onTouchMove={clearPress}
        onTouchCancel={clearPress}
        title={
          active
            ? 'Remove from selection'
            : !hasActivity
              ? 'No spending in this category for the selected period'
              : hasSelection
                ? 'Switch selection to this category — hold (or hover the +) to add instead'
                : 'Select this category'
        }
        className="inline-flex items-center gap-1"
      >
        <span className={active || hasActivity ? '' : 'opacity-40'}>{cat.icon}</span>
        {cat.name}
      </button>
      {active && (
        <button
          onClick={(e) => { e.stopPropagation(); onDeselect(); }}
          aria-label={`Remove ${cat.name} filter`}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-ink-800 text-white text-xs flex items-center justify-center leading-none shadow-sm hover:bg-ink-700 transition-colors"
        >
          ✕
        </button>
      )}
      {!active && hasSelection && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddToSelection(); }}
          aria-label={`Add ${cat.name} to filter`}
          title="Add to selection"
          className="hidden md:flex absolute -top-2 -right-2 w-5 h-5 rounded-full bg-ink-800 text-white text-sm items-center justify-center leading-none shadow-sm hover:bg-ink-700 transition-colors md:opacity-0 md:group-hover/catpill:opacity-100"
        >
          +
        </button>
      )}
    </div>
  );
}

export default function SpendingView({ transactions, monthlyRaw, allCategories, venmoRequests, subscriptionOverrides, monthlyIncome, budgets: initialBudgets, dailySpending }: SpendingViewProps) {
  const now = new Date();
  const { dateFilter, resolvedRange, segment, category, setSegment, clearSegment, setCategory, clearCategory } = useGlobalFilter();
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const selectedCategoryKey = category?.key ?? null;

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

  // Top-level categories for the header's filter pills, plus any category name
  // present on transactions but missing from allCategories (treated as top-level).
  const chipCategories = useMemo(() => {
    const list: { name: string; icon: string; color: string }[] = allCategories
      .filter((c) => !c.is_income && !c.parent_id)
      .map((c) => ({ name: c.name, icon: c.icon || '', color: c.color || '#6B7280' }));
    const knownNames = new Set(list.map((c) => c.name));
    for (const tx of transactions) {
      const name = tx.category?.name || 'Uncategorized';
      if (!knownNames.has(name) && !allCategories.find((c) => c.name === name)?.parent_id) {
        list.push({ name, icon: tx.category?.icon || '❓', color: tx.category?.color || '#D1D5DB' });
        knownNames.add(name);
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [transactions, allCategories]);

  const [showCategoryManager, setShowCategoryManager] = useState(false);
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

  // When a bar/period is selected (SpendingProgress), use that as the
  // display filter for the pie chart, category rows, and savings stats.
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

  const dateFiltered = useMemo(
    () => applyDateFilter(transactions, viewFilter),
    [transactions, viewFilter],
  );

  // Date + account filtered, but not yet narrowed by the category pills / search —
  // used to tell which category pills have any activity in the selected time frame.
  const dateAndAccountFiltered = useMemo(() => {
    if (!selectedAccount) return dateFiltered;
    return dateFiltered.filter((tx) => tx.account_id === selectedAccount);
  }, [dateFiltered, selectedAccount]);

  const filteredTransactions = useMemo(
    () => applySearchAndCategoryFilter(dateAndAccountFiltered, filterCategories, search, allCategories),
    [dateAndAccountFiltered, filterCategories, search, allCategories],
  );

  // Category names with actual spending in the selected time frame (for dimming
  // pills that have nothing to show, independent of which pill is selected).
  const activeCategoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const tx of dateAndAccountFiltered) {
      if (isExcludedFromSpending(tx)) continue;
      names.add(tx.category?.name || 'Uncategorized');
    }
    return names;
  }, [dateAndAccountFiltered]);

  // Whether each top-level pill (including its rolled-up sub-categories) has
  // any activity in the selected time frame.
  const chipHasActivity = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const cat of chipCategories) {
      const namesToCheck = new Set([cat.name]);
      const parent = allCategories.find((c) => c.name === cat.name && !c.parent_id);
      if (parent) {
        allCategories.filter((c) => c.parent_id === parent.id).forEach((c) => namesToCheck.add(c.name));
      }
      map.set(cat.name, Array.from(namesToCheck).some((n) => activeCategoryNames.has(n)));
    }
    return map;
  }, [chipCategories, allCategories, activeCategoryNames]);

  // Effective daily series for "Spending over time": narrowed whenever a category
  // pill, search, or the single category drill-down (donut/table click) is active;
  // otherwise falls back to the server-computed full daily total.
  const narrowedDailySpending = useMemo(() => {
    const hasNarrowing = !!category || filterCategories.length > 0 || !!search.trim();
    if (!hasNarrowing) return null;
    const isUncategorized = category?.key === '__uncategorized__';
    const childIds = category ? (childIdsByParent.get(category.key) ?? []) : [];
    const allowed = category ? new Set([category.key, ...childIds]) : null;
    const byDay = new Map<string, number>();
    for (const tx of filteredTransactions) {
      if (isExcludedFromSpending(tx)) continue;
      if (allowed) {
        const matches = isUncategorized ? !tx.category : allowed.has(tx.category?.id ?? '');
        if (!matches) continue;
      }
      const day = tx.posted_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + Math.abs(Number(tx.amount)));
    }
    return Array.from(byDay.entries())
      .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [category, filterCategories, search, filteredTransactions, childIdsByParent]);

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
    let prev = applyDateFilter(transactions, getPrevPeriodFilter(viewFilter));
    if (selectedAccount) prev = prev.filter((tx) => tx.account_id === selectedAccount);
    return applySearchAndCategoryFilter(prev, filterCategories, search, allCategories);
  }, [transactions, viewFilter, selectedAccount, filterCategories, search, allCategories]);

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
    if (viewFilter.mode === 'month') {
      return new Date(viewFilter.year, viewFilter.month + 1, 0).getDate();
    }
    const ms = new Date(viewFilter.end).getTime() - new Date(viewFilter.start).getTime();
    return Math.max(1, Math.round(ms / 86_400_000) + 1);
  }, [viewFilter]);

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

  const pacedTotal = useMemo(() => {
    if (dateFilter.mode !== 'month') return null;
    if (dateFilter.year !== now.getFullYear() || dateFilter.month !== now.getMonth()) return null;
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(dateFilter.year, dateFilter.month + 1, 0).getDate();
    if (dayOfMonth >= daysInMonth - 1) return null;
    const monthStr = `${dateFilter.year}-${String(dateFilter.month + 1).padStart(2, '0')}`;
    const currentMonthTxs = (selectedAccount
      ? transactions.filter((tx) => tx.account_id === selectedAccount)
      : transactions
    ).filter((tx) => tx.posted_at.substring(0, 7) === monthStr);
    const LARGE_THRESHOLD = 500;
    let recurringSpend = 0;
    let largeSpend = 0;
    for (const tx of currentMonthTxs) {
      if (isExcludedFromSpending(tx)) continue;
      const amount = Math.abs(Number(tx.amount));
      if (amount >= LARGE_THRESHOLD) largeSpend += amount;
      else recurringSpend += amount;
    }
    const paced = Math.round((recurringSpend / dayOfMonth) * daysInMonth);
    return { paced, largeTotal: Math.round(largeSpend) };
  }, [dateFilter, transactions, selectedAccount, now]);

  // Search + category-pills filters — rendered in the shared header (below the date
  // filter row) so they can drive the charts above as well as the transaction list.
  useSetPageFilterSlot(
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:w-56">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-300 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-7 py-1 bg-white border border-sand-200 rounded-lg text-xs text-ink-700 placeholder-ink-300 focus:outline-none focus:ring-1 focus:ring-sand-300"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-500"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {accounts.length > 1 && (
        <AccountDropdown accounts={accounts} selectedAccount={selectedAccount} onChange={setSelectedAccount} />
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setFilterCategories([])}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            filterCategories.length === 0 ? 'bg-ink-800 text-white' : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
          }`}
        >
          All
        </button>
        {chipCategories.map((cat) => (
          <CategoryPill
            key={cat.name}
            cat={cat}
            active={filterCategories.includes(cat.name)}
            hasActivity={chipHasActivity.get(cat.name) ?? false}
            hasSelection={filterCategories.length > 0}
            onSelectOnly={() => setFilterCategories([cat.name])}
            onDeselect={() => setFilterCategories(filterCategories.filter((n) => n !== cat.name))}
            onAddToSelection={() => {
              if (!filterCategories.includes(cat.name)) setFilterCategories([...filterCategories, cat.name]);
            }}
          />
        ))}
        {filterCategories.length > 0 && (
          <button
            onClick={() => setFilterCategories([])}
            className="text-xs text-ink-400 hover:text-ink-600 transition-colors"
          >
            Deselect all
          </button>
        )}
      </div>
    </div>,
  );

  return (
    <div className="space-y-5">
      {/* Spending over time + By Category side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4 items-start">
        <SpendingProgress
          data={narrowedDailySpending ?? dailySpending}
          rangeStart={resolvedRange.start}
          rangeEnd={resolvedRange.end}
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
        <div className="w-full xl:w-72 xl:flex-shrink-0">
          <SpendingCharts
            categories={sortedCategories}
            monthlyData={[]}
            totalSpending={totalSpending}
            selectedCategoryKey={selectedCategoryKey}
            onCategoryClick={(id) => {
              if (category?.key === id) {
                clearCategory();
              } else {
                const row = sortedCategories.find((c) => (c.id ?? '__uncategorized__') === id);
                if (row) setCategory({ key: id, label: row.name, color: row.color, icon: row.icon });
              }
              setActiveTab('transactions');
            }}
          />
        </div>
      </div>

      {/* Spending + savings rate combined card */}
      <SavingsRateModule
        currentSpending={totalSpending}
        prevSpending={prevTotalSpending}
        monthlyIncome={monthlyIncome}
        periodDays={periodDays}
        pacedTotal={pacedTotal}
      />


      {/* Section tabs */}
      <div className="flex items-center gap-0 border-b border-sand-200 overflow-x-auto">
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
        {activeTab === 'transactions' && (
          <div className="ml-auto flex items-center gap-2 pb-px">
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
        )}
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
                        if (isSelected) clearCategory();
                        else setCategory({ key: row.key, label: row.name, color: row.color, icon: row.icon });
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
                            onClick={() => { setCategory({ key: sub.id, label: sub.name, color: sub.color, icon: sub.icon }); setActiveTab('transactions'); }}
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
          {selectedCategoryKey && (() => {
            const row = categoryRows.find((r) => r.key === selectedCategoryKey);
            return row ? (
              <div className="mt-3">
                <button
                  onClick={clearCategory}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-sand-200 bg-sand-100 text-ink-600 hover:bg-sand-200 transition-colors"
                >
                  <span style={{ color: row.color }}>{row.icon}</span>
                  {row.name}
                  <span className="ml-0.5 text-ink-400">✕</span>
                </button>
              </div>
            ) : null;
          })()}
          {allTabTransactions.length > 0 ? (
            <SpendingTransactions
              transactions={allTabTransactions as any}
              allCategories={allCategories}
              venmoRequests={venmoRequests}
              selectedAccount={selectedAccount}
              onAccountChange={setSelectedAccount}
              externalDateFilter={viewFilter}
              externalDateFilterActive={true}
              search={search}
              onSearchChange={setSearch}
              filterCategories={filterCategories}
              onFilterCategoriesChange={setFilterCategories}
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
