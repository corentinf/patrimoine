'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { formatCurrency, formatCurrencyPrecise, amountColor } from '@/app/lib/utils';
import { getPersonalAmount, isShared, type SplitSource } from '@/app/lib/split';
import { useGlobalFilter, type DateFilter } from '@/app/lib/globalFilter';
import { useSetPageFilterSlot } from '@/app/lib/pageFilterSlot';
import { useStableMinHeight } from '@/app/lib/useStableMinHeight';
import { useMeasureCssVar } from '@/app/lib/useMeasureCssVar';
import { usePrivacy } from '@/app/lib/privacy';
import SpendingCharts from './SpendingCharts';
import SpendingProgress from './SpendingProgress';
import SpendingTransactions from './SpendingTransactions';
import CategoryManager, { type Category } from './CategoryManager';
import AICategorizeButton from './AICategorizeButton';
import VenmoImport from './VenmoImport';
import AmazonImport from './AmazonImport';
import SubscriptionsSection from './SubscriptionsSection';
import SavingsRateModule from './SavingsRateModule';
import { settleSharedSplits, dismissSplitMatch } from './actions';

interface RawTransaction {
  id: string;
  amount: number;
  description: string;
  payee: string | null;
  memo: string | null;
  posted_at: string;
  account_id: string;
  is_transfer: boolean;
  /** Secondary provenance badge (e.g. "Amazon") — separate from category,
   *  never counted in spending totals/budgets. */
  source_tag?: string | null;
  /** Set once the shared portion of this transaction has been paid back. */
  split_settled_at?: string | null;
  /** Per-transaction split override — independent of the account's own
   *  setting, for a one-off shared expense (e.g. a dinner split with a
   *  friend on an otherwise-personal card). */
  is_shared?: boolean | null;
  personal_percentage?: number | null;
  account: { id: string; name: string; institution: string; is_shared?: boolean | null; personal_percentage?: number | null } | null;
  category: { id: string; name: string; color: string; icon: string; is_income: boolean } | null;
}

interface MonthlyRaw {
  amount: number;
  posted_at: string;
  account_id: string;
  is_shared?: boolean | null;
  personal_percentage?: number | null;
  account?: SplitSource | null;
}

interface PersonalPaymentCandidate {
  id: string;
  amount: number;
  payee: string | null;
  description: string | null;
  posted_at: string;
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
  personalPaymentCandidates: PersonalPaymentCandidate[];
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

// A transaction's badges: its persisted source_tag (e.g. "Amazon", "Venmo",
// set by an importer) plus a synthesized "Transfer" tag for anything already
// treated as a transfer — computed, never stored, so it stays in sync with
// the category/is_transfer fields instead of needing its own bookkeeping.
function effectiveTags(tx: { source_tag?: string | null; is_transfer: boolean; category?: { name: string } | null }): string[] {
  const tags: string[] = [];
  if (tx.source_tag) tags.push(tx.source_tag);
  if (tx.is_transfer || tx.category?.name === 'Transfer') tags.push('Transfer');
  return tags;
}

// Applies the header's category-pill + tag-pill + search filters to a transaction list.
// `filterCategories` holds category names; selecting a parent also matches its children.
function applySearchAndCategoryFilter(
  txs: RawTransaction[],
  filterCategories: string[],
  filterTags: string[],
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
  if (filterTags.length > 0) {
    result = result.filter((tx) => effectiveTags(tx).some((t) => filterTags.includes(t)));
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter((tx) => {
      const name = (tx.payee ?? tx.description ?? 'Unknown').toLowerCase();
      const cat = (tx.category?.name || 'Uncategorized').toLowerCase();
      const tags = effectiveTags(tx).join(' ').toLowerCase();
      const amount = formatCurrencyPrecise(Math.abs(tx.amount)).toLowerCase();
      return name.includes(q) || cat.includes(q) || tags.includes(q) || amount.includes(q);
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
    const amount = Math.abs(getPersonalAmount(Number(tx.amount), tx.account, tx));
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
            ? 'bg-ink-800/10 text-ink-800 border border-ink-800/15'
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
  cat, active, hasActivity, hasSelection, onSelectOnly, onDeselect, onAddToSelection, isSubcategory,
}: {
  cat: { name: string; icon: string; color: string };
  active: boolean;
  hasActivity: boolean;
  hasSelection: boolean;
  onSelectOnly: () => void;
  onDeselect: () => void;
  onAddToSelection: () => void;
  /** Sub-category pills render visibly smaller/muted than top-level ones —
   *  same size made a group hard to tell apart from an unrelated top-level
   *  pill sitting right next to it once expanded. */
  isSubcategory?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
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

  // Only unselected pills get the + affordance — clicking an active pill's
  // body already removes it, so a dedicated × button would be redundant.
  const showAction = !active && hasSelection;
  // On hover, the trailing text fades into the + icon instead of the icon
  // sitting in an overlapping badge — keeps the pill's box completely static.
  const fade = 'linear-gradient(to right, black, black calc(100% - 30px), transparent calc(100% - 8px))';
  const maskStyle = hovered && showAction ? { maskImage: fade, WebkitMaskImage: fade } : undefined;

  return (
    <div
      className={`relative group/catpill inline-flex items-center gap-1 rounded-full font-medium border transition-colors ${
        isSubcategory ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${
        pressed ? 'scale-95' : ''
      } ${
        active
          ? 'text-white border-transparent'
          : hasActivity
            ? isSubcategory
              ? 'bg-sand-50 border-dashed border-sand-300 text-ink-500 hover:border-sand-400 hover:bg-sand-100'
              : 'bg-white border-sand-200 text-ink-600 hover:border-sand-300'
            : isSubcategory
              ? 'bg-sand-50 border-dashed border-sand-200 text-ink-300 hover:border-sand-300'
              : 'bg-white border-sand-100 text-ink-300 hover:border-sand-200'
      }`}
      style={{
        ...(active ? { backgroundColor: cat.color, borderColor: cat.color } : {}),
        ...(!active && hasActivity && !isSubcategory ? { backgroundColor: cat.color + '14' } : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
        <span className="whitespace-nowrap transition-[mask-image] duration-150" style={maskStyle}>{cat.name}</span>
      </button>
      {showAction && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddToSelection(); }}
          aria-label={`Add ${cat.name} to filter`}
          title="Add to selection"
          className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 text-ink-800 hover:text-ink-900 opacity-0 group-hover/catpill:opacity-100 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  );
}

// Tags are simpler than categories — no icon/hierarchy, and a transaction can
// carry more than one at once — so this is a plain multi-select toggle rather
// than CategoryPill's select-only/add-to-selection distinction.
function TagPill({ tag, active, hasActivity, onToggle }: { tag: string; active: boolean; hasActivity: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={active ? 'Remove from filter' : !hasActivity ? 'No spending tagged this way in the selected period' : 'Filter by this tag'}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-ink-700 text-white border-transparent'
          : hasActivity
            ? 'bg-white border-sand-200 text-ink-600 hover:border-sand-300'
            : 'bg-white border-sand-100 text-ink-300 hover:border-sand-200'
      }`}
    >
      <span className={active || hasActivity ? '' : 'opacity-40'}>🏷️</span>
      {tag}
    </button>
  );
}

export default function SpendingView({ transactions, monthlyRaw, allCategories, venmoRequests, subscriptionOverrides, monthlyIncome, budgets: initialBudgets, dailySpending, personalPaymentCandidates }: SpendingViewProps) {
  // Not otherwise used here — but subscribing is what makes this component
  // re-render (and every formatCurrency() call below re-check demo mode)
  // when the toggle in Header/Profile changes it.
  usePrivacy();
  const now = new Date();
  const {
    dateFilter, resolvedRange, segment, category, setSegment, clearSegment, setCategory, clearCategory,
    stepPeriod, canStepBackward, canStepForward,
  } = useGlobalFilter();
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const selectedCategoryKey = category?.key ?? null;
  const { ref: txListRef, minHeight: txListMinHeight } = useStableMinHeight<HTMLDivElement>();
  const tabsRef = useRef<HTMLDivElement>(null);
  useMeasureCssVar(tabsRef, '--tabs-h');

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

  // Distinct tags across all transactions (source_tag from an importer, plus
  // the synthesized "Transfer" tag) — for the header's tag-pill row.
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const tx of transactions) {
      for (const t of effectiveTags(tx)) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  // Sub-categories grouped by their parent's name, for the drill-down row
  // under the header pills (e.g. "Gas & Fuel" under "Transport").
  const childrenByParentName = useMemo(() => {
    const map = new Map<string, { name: string; icon: string; color: string }[]>();
    for (const cat of allCategories) {
      if (!cat.parent_id || cat.is_income) continue;
      const parent = allCategories.find((c) => c.id === cat.parent_id);
      if (!parent) continue;
      const list = map.get(parent.name) ?? [];
      list.push({ name: cat.name, icon: cat.icon || '', color: cat.color || '#6B7280' });
      map.set(parent.name, list);
    }
    for (const list of Array.from(map.values())) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [allCategories]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Category row: collapsed by default to just the categories with activity
  // in the current time frame (one line) — hovering (or pinning, via the
  // button) reveals the full list. Since this row lives in the sticky page
  // header (see useSetPageFilterSlot below), it also collapses back down
  // whenever the page is scrolled, even if pinned, to give the transaction
  // list room; hovering still peeks it open regardless of scroll.
  const [categoryRowPinned, setCategoryRowPinned] = useState(false);
  const [categoryRowHovered, setCategoryRowHovered] = useState(false);
  const [pageScrolled, setPageScrolled] = useState(false);
  useEffect(() => {
    function onScroll() { setPageScrolled(window.scrollY > 4); }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const categoryRowExpanded = categoryRowHovered || (categoryRowPinned && !pageScrolled);

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

  // Drop any category drill-down when the base date filter changes (month
  // step, preset, custom range) — it may no longer apply to the newly-
  // filtered transactions. Deliberately keyed on `dateFilter`, not
  // `viewFilter`/`segment`: a live hover preview over the "Spending over
  // time" bars also moves `segment`, and that must NOT clear the pie
  // chart's selection out from under the user mid-hover. Pin/unpin of a
  // bar (a real, non-preview segment change) clears it explicitly via
  // onPeriodSelect below instead.
  useEffect(() => {
    clearCategory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter]);

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
    () => applySearchAndCategoryFilter(dateAndAccountFiltered, filterCategories, filterTags, search, allCategories),
    [dateAndAccountFiltered, filterCategories, filterTags, search, allCategories],
  );

  // A second pipeline that ignores `segment` — used only to feed the "Spending
  // over time" chart's own data. Hovering a bar narrows `viewFilter` above to
  // that single day (so the pie chart/category rows preview it), but the trend
  // chart must keep showing the whole period; otherwise every other bar would
  // vanish the moment you hover one (feedback loop via narrowedDailySpending).
  const chartDateFiltered = useMemo(
    () => applyDateFilter(transactions, dateFilter),
    [transactions, dateFilter],
  );
  const chartDateAndAccountFiltered = useMemo(() => {
    if (!selectedAccount) return chartDateFiltered;
    return chartDateFiltered.filter((tx) => tx.account_id === selectedAccount);
  }, [chartDateFiltered, selectedAccount]);
  const chartFilteredTransactions = useMemo(
    () => applySearchAndCategoryFilter(chartDateAndAccountFiltered, filterCategories, filterTags, search, allCategories),
    [chartDateAndAccountFiltered, filterCategories, filterTags, search, allCategories],
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

  // Split once, into two fixed groups, rather than toggling between an
  // "active only" and a re-sorted "everyone" list — that would reshuffle
  // where each active pill sits (an inactive one could land alphabetically
  // ahead of it) every time the row expands/collapses. Instead active pills
  // live in their own row that never changes, and inactive ones reveal in a
  // second row below without touching the first.
  const activeChipCategories = useMemo(
    () => chipCategories.filter((c) => chipHasActivity.get(c.name) || filterCategories.includes(c.name)),
    [chipCategories, chipHasActivity, filterCategories],
  );
  const inactiveChipCategories = useMemo(
    () => chipCategories.filter((c) => !(chipHasActivity.get(c.name) || filterCategories.includes(c.name))),
    [chipCategories, chipHasActivity, filterCategories],
  );

  // Whether each tag has any activity in the selected time frame (for dimming
  // pills that have nothing to show), mirroring chipHasActivity above.
  const tagHasActivity = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const tag of availableTags) {
      map.set(tag, dateAndAccountFiltered.some((tx) => !isExcludedFromSpending(tx) && effectiveTags(tx).includes(tag)));
    }
    return map;
  }, [availableTags, dateAndAccountFiltered]);

  // Effective daily series for "Spending over time": narrowed whenever a category
  // pill, search, or the single category drill-down (donut/table click) is active;
  // otherwise falls back to the server-computed full daily total.
  const narrowedDailySpending = useMemo(() => {
    const hasNarrowing = !!category || filterCategories.length > 0 || filterTags.length > 0 || !!search.trim();
    if (!hasNarrowing) return null;
    const isUncategorized = category?.key === '__uncategorized__';
    const childIds = category ? (childIdsByParent.get(category.key) ?? []) : [];
    const allowed = category ? new Set([category.key, ...childIds]) : null;
    const byDay = new Map<string, number>();
    for (const tx of chartFilteredTransactions) {
      if (isExcludedFromSpending(tx)) continue;
      if (allowed) {
        const matches = isUncategorized ? !tx.category : allowed.has(tx.category?.id ?? '');
        if (!matches) continue;
      }
      const day = tx.posted_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + Math.abs(getPersonalAmount(Number(tx.amount), tx.account, tx)));
    }
    return Array.from(byDay.entries())
      .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [category, filterCategories, filterTags, search, chartFilteredTransactions, childIdsByParent]);

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
    return applySearchAndCategoryFilter(prev, filterCategories, filterTags, search, allCategories);
  }, [transactions, viewFilter, selectedAccount, filterCategories, filterTags, search, allCategories]);

  const categoryRows = useMemo(() =>
    buildCategoryRows(
      sumByCategory(filteredTransactions, subCatToParent, catMeta),
      sumByCategory(prevFiltered, subCatToParent, catMeta),
    ),
  [filteredTransactions, prevFiltered, subCatToParent, catMeta]);

  const prevTotalSpending = useMemo(() =>
    prevFiltered.reduce((sum, tx) => {
      if (isExcludedFromSpending(tx)) return sum;
      return sum + Math.abs(getPersonalAmount(Number(tx.amount), tx.account, tx));
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

  // "Awaiting reimbursement" — Jenny's unpaid half of every shared-card charge.
  // A running balance, not scoped to the selected date range like the stats above.
  const awaitingReimbursement = useMemo(() => {
    return transactions.reduce((sum, tx) => {
      if (!isShared(tx, tx.account) || tx.split_settled_at || isExcludedFromSpending(tx)) return sum;
      const full = Math.abs(Number(tx.amount));
      const personal = Math.abs(getPersonalAmount(Number(tx.amount), tx.account, tx));
      return sum + (full - personal);
    }, 0);
  }, [transactions]);

  // Newest incoming personal payment whose amount roughly matches the running
  // awaiting-reimbursement total — offered as a one-click "mark all settled".
  const [dismissedMatchIds, setDismissedMatchIds] = useState<Set<string>>(new Set());
  const matchCandidate = useMemo(() => {
    if (awaitingReimbursement <= 0) return null;
    const tolerance = Math.max(2, awaitingReimbursement * 0.03);
    return personalPaymentCandidates.find((c) =>
      !dismissedMatchIds.has(c.id) && Math.abs(c.amount - awaitingReimbursement) <= tolerance
    ) ?? null;
  }, [personalPaymentCandidates, awaitingReimbursement, dismissedMatchIds]);

  const [matching, setMatching] = useState(false);
  async function handleConfirmMatch() {
    if (!matchCandidate) return;
    setMatching(true);
    try {
      await settleSharedSplits();
    } finally {
      setMatching(false);
    }
  }
  function handleDismissMatch() {
    if (!matchCandidate) return;
    setDismissedMatchIds((prev) => new Set(prev).add(matchCandidate.id));
    dismissSplitMatch(matchCandidate.id);
  }

  // Which parent category the pie chart should be "drilled into": the
  // selection itself if it's a top-level category, or its parent if a
  // specific sub-category is selected (so the sibling breakdown stays
  // visible with that sub-category highlighted).
  const drilldownParentId = useMemo(() => {
    if (!selectedCategoryKey) return null;
    return subCatToParent.get(selectedCategoryKey) ?? selectedCategoryKey;
  }, [selectedCategoryKey, subCatToParent]);

  const pieDrilldownRow = useMemo(
    () => (drilldownParentId ? categoryRows.find((r) => r.key === drilldownParentId) ?? null : null),
    [drilldownParentId, categoryRows],
  );

  // Selecting a category via the pie chart / breakdown table sets `category`
  // (a drill-down, keyed by id) — a separate mechanism from the header pills'
  // own `filterCategories` (a multi-select, keyed by name). Resolve the
  // drill-down's id(s) to name(s) so the matching pill can visually highlight
  // in sync, without merging the two selection mechanisms themselves.
  const drilldownCategoryName = useMemo(
    () => (drilldownParentId ? catMeta.get(drilldownParentId)?.name ?? null : null),
    [drilldownParentId, catMeta],
  );
  const drilldownSubCategoryName = useMemo(
    () => (selectedCategoryKey && selectedCategoryKey !== drilldownParentId ? catMeta.get(selectedCategoryKey)?.name ?? null : null),
    [selectedCategoryKey, drilldownParentId, catMeta],
  );

  // Pie chart data: the parent's sub-categories when drilled in, else the
  // normal top-level breakdown.
  const pieCategories = useMemo(() => {
    if (pieDrilldownRow && pieDrilldownRow.subBreakdown.length > 0) {
      return pieDrilldownRow.subBreakdown
        .map((s) => ({ id: s.id, name: s.name, color: s.color, icon: s.icon, total: s.total }))
        .sort((a, b) => b.total - a.total);
    }
    return sortedCategories;
  }, [pieDrilldownRow, sortedCategories]);


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
      const amount = Math.abs(getPersonalAmount(Number(tx.amount), tx.account, tx));
      if (amount >= LARGE_THRESHOLD) largeSpend += amount;
      else recurringSpend += amount;
    }
    const paced = Math.round((recurringSpend / dayOfMonth) * daysInMonth);
    return { paced, largeTotal: Math.round(largeSpend) };
  }, [dateFilter, transactions, selectedAccount, now]);

  // Shared between the active and inactive pill rows below.
  // Returns an array of independent sibling pills (parent-group first, then
  // each expanded sub-category) rather than one wrapping element — each pill
  // needs to be its own item in the row's flex-wrap flow. Bundling them into
  // a single inline-flex box made the whole group (parent included) jump to
  // a new line together whenever it didn't fit the remaining row width,
  // instead of just the overflowing sub-pills wrapping on their own.
  function renderCategoryPill(cat: { name: string; icon: string; color: string }) {
    const children = childrenByParentName.get(cat.name);
    const isExpanded = expandedCategory === cat.name;
    const items: React.ReactNode[] = [
      <span key={cat.name} className="inline-flex items-center">
        <CategoryPill
          cat={cat}
          active={filterCategories.includes(cat.name) || cat.name === drilldownCategoryName}
          hasActivity={chipHasActivity.get(cat.name) ?? false}
          hasSelection={filterCategories.length > 0}
          onSelectOnly={() => { clearCategory(); setFilterCategories([cat.name]); }}
          onDeselect={() => { clearCategory(); setFilterCategories(filterCategories.filter((n) => n !== cat.name)); }}
          onAddToSelection={() => {
            clearCategory();
            if (!filterCategories.includes(cat.name)) setFilterCategories([...filterCategories, cat.name]);
          }}
        />
        {children && children.length > 0 && (
          <button
            onClick={() => setExpandedCategory((v) => (v === cat.name ? null : cat.name))}
            aria-label={`${isExpanded ? 'Hide' : 'Show'} ${cat.name} sub-categories`}
            title="Sub-categories"
            className={`ml-0.5 flex items-center justify-center w-4 h-4 rounded-full transition-colors ${
              isExpanded ? 'text-ink-700 bg-sand-200' : 'text-ink-300 hover:text-ink-500 hover:bg-sand-100'
            }`}
          >
            <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </span>,
    ];
    if (isExpanded && children) {
      children.forEach((sub, i) => {
        items.push(
          <span
            key={sub.name}
            className="inline-flex animate-[pill-in_150ms_ease-out_backwards]"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <CategoryPill
              cat={sub}
              isSubcategory
              active={filterCategories.includes(sub.name) || sub.name === drilldownSubCategoryName}
              hasActivity={activeCategoryNames.has(sub.name)}
              hasSelection={filterCategories.length > 0}
              onSelectOnly={() => { clearCategory(); setFilterCategories([sub.name]); }}
              onDeselect={() => { clearCategory(); setFilterCategories(filterCategories.filter((n) => n !== sub.name)); }}
              onAddToSelection={() => {
                clearCategory();
                if (!filterCategories.includes(sub.name)) setFilterCategories([...filterCategories, sub.name]);
              }}
            />
          </span>,
        );
      });
    }
    return items;
  }

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
      <div
        onMouseEnter={() => setCategoryRowHovered(true)}
        onMouseLeave={() => setCategoryRowHovered(false)}
      >
        {/* Active categories — fixed position, wraps to as many lines as it
            needs, never reshuffled by hover/pin/scroll. */}
        <div className="flex items-center flex-wrap gap-1.5">
          <button
            onClick={() => { setFilterCategories([]); setFilterTags([]); setExpandedCategory(null); }}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              filterCategories.length === 0 && filterTags.length === 0 ? 'bg-ink-800/10 text-ink-800 border border-ink-800/15' : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
            }`}
          >
            All
          </button>
          {inactiveChipCategories.length > 0 && (
            <button
              onClick={() => setCategoryRowPinned((v) => !v)}
              aria-label={categoryRowPinned ? 'Unpin inactive categories' : 'Keep inactive categories expanded'}
              title={categoryRowPinned ? 'Unpin inactive categories' : 'Keep inactive categories expanded'}
              className={`flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
                categoryRowPinned ? 'text-ink-700 bg-sand-200' : 'text-ink-300 hover:text-ink-500 hover:bg-sand-100'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill={categoryRowPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}
          {activeChipCategories.flatMap(renderCategoryPill)}
          {filterCategories.length > 0 && (
            <button
              onClick={() => { setFilterCategories([]); setExpandedCategory(null); }}
              className="text-xs text-ink-400 hover:text-ink-600 transition-colors"
            >
              Deselect all
            </button>
          )}
        </div>
        {/* Inactive categories — revealed below on hover/pin, collapsing back
            on scroll (this row lives in the sticky header). Never affects the
            active row's layout above. */}
        {inactiveChipCategories.length > 0 && (
          <div
            className={`transition-[grid-template-rows] duration-300 ease-in-out grid ${categoryRowExpanded ? 'grid-rows-[1fr] mt-1.5' : 'grid-rows-[0fr]'}`}
          >
            <div className="overflow-hidden min-h-0">
              <div className="flex items-center flex-wrap gap-1.5">
                {inactiveChipCategories.flatMap(renderCategoryPill)}
              </div>
            </div>
          </div>
        )}
      </div>
      {availableTags.length > 0 && (
        <span className="w-full flex items-center gap-1.5 flex-wrap pl-3 border-l-2 border-sand-200 ml-1">
          <span className="text-xs text-ink-300 whitespace-nowrap">Tags ›</span>
          {availableTags.map((tag) => (
            <TagPill
              key={tag}
              tag={tag}
              active={filterTags.includes(tag)}
              hasActivity={tagHasActivity.get(tag) ?? false}
              onToggle={() => setFilterTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
            />
          ))}
          {filterTags.length > 0 && (
            <button
              onClick={() => setFilterTags([])}
              className="text-xs text-ink-400 hover:text-ink-600 transition-colors"
            >
              Clear tags
            </button>
          )}
        </span>
      )}
    </div>,
  );

  const spendingChange = totalSpending - prevTotalSpending;
  const spendingPct = prevTotalSpending > 0 ? (spendingChange / prevTotalSpending) * 100 : null;

  return (
    <div className="space-y-5">
      {/* Hero: title + total spending + savings rate */}
      <div className="card px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-lg text-ink-800">Spending</h2>
          <span className="stat-label">Total spending</span>
          <span className="stat-value text-xl text-accent-red" data-sensitive>{formatCurrency(totalSpending)}</span>
          {awaitingReimbursement > 0 && (
            <span
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-100"
              title="Jenny's unpaid half of shared-card charges"
            >
              ½ Awaiting reimbursement
              <span className="font-mono" data-sensitive>{formatCurrency(awaitingReimbursement)}</span>
            </span>
          )}
        </div>
        {/* Always mounted (even with no prior-period data) so this line's height
            is reserved — otherwise hovering a bar/category can toggle it away
            and the whole page jumps vertically. */}
        <p className={`text-xs font-mono mt-1 ${prevTotalSpending > 0 ? amountColor(-spendingChange) : 'invisible'}`}>
          {prevTotalSpending > 0 ? (
            <>
              {spendingChange >= 0 ? '+' : ''}{formatCurrency(spendingChange)}
              {spendingPct !== null && ` (${spendingPct >= 0 ? '+' : ''}${spendingPct.toFixed(1)}%)`} vs prior period
            </>
          ) : '—'}
        </p>
        {pacedTotal !== null && (
          <p className="text-xs text-ink-400 mt-1">
            on pace for ~<span className="font-mono text-ink-600">{formatCurrency(pacedTotal.paced)}</span>
            {pacedTotal.largeTotal > 0 && (
              <span className="text-ink-300">
                {' '}(excl. <span className="font-mono">{formatCurrency(pacedTotal.largeTotal)}</span> in large purchases)
              </span>
            )}
          </p>
        )}
        <div className="mt-3 pt-3 border-t border-sand-100">
          <SavingsRateModule
            currentSpending={totalSpending}
            prevSpending={prevTotalSpending}
            monthlyIncome={monthlyIncome}
            periodDays={periodDays}
          />
        </div>
      </div>

      {/* Match a recent incoming personal payment to pending Amex splits */}
      {matchCandidate && (
        <div className="card px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 bg-amber-50/60 border-amber-100">
          <p className="text-sm text-ink-700">
            <span className="font-mono font-medium" data-sensitive>{formatCurrencyPrecise(matchCandidate.amount)}</span>
            {' '}from {matchCandidate.payee ?? matchCandidate.description ?? 'a personal payment'} — match to pending Amex splits?
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDismissMatch}
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-ink-500 hover:bg-white/60 transition-colors"
            >
              Not this one
            </button>
            <button
              onClick={handleConfirmMatch}
              disabled={matching}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-ink-800 text-white hover:bg-ink-700 transition-colors disabled:opacity-50"
            >
              {matching ? 'Matching…' : 'Match'}
            </button>
          </div>
        </div>
      )}

      {/* Spending over time + By Category side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4 items-stretch">
        <SpendingProgress
          data={narrowedDailySpending ?? dailySpending}
          rangeStart={resolvedRange.start}
          rangeEnd={resolvedRange.end}
          onStepPeriod={stepPeriod}
          canStepBackward={canStepBackward}
          canStepForward={canStepForward}
          onPeriodSelect={(range, meta) => {
            if (!range) {
              clearSegment();
              if (!meta?.preview) clearCategory();
              return;
            }
            const label = range.start === range.end
              ? new Date(range.start + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : `${range.start} – ${range.end}`;
            setSegment({ label, start: range.start, end: range.end });
            if (!meta?.preview) clearCategory();
          }}
        />
        <div className="w-full xl:w-72 xl:flex-shrink-0">
          <SpendingCharts
            categories={pieCategories}
            monthlyData={[]}
            totalSpending={totalSpending}
            selectedCategoryKey={selectedCategoryKey}
            drilldown={pieDrilldownRow && pieDrilldownRow.subBreakdown.length > 0
              ? { label: pieDrilldownRow.name, icon: pieDrilldownRow.icon, color: pieDrilldownRow.color }
              : null}
            onDrilldownBack={clearCategory}
            onCategoryClick={(id) => {
              if (category?.key === id) {
                clearCategory();
              } else {
                const meta = catMeta.get(id);
                setCategory({
                  key: id,
                  label: meta?.name ?? (id === '__uncategorized__' ? 'Uncategorized' : id),
                  color: meta?.color ?? '#D1D5DB',
                  icon: meta?.icon ?? '❓',
                });
              }
              setActiveTab('transactions');
            }}
          />
        </div>
      </div>

      {/* Section tabs */}
      <div
        ref={tabsRef}
        className="sticky z-10 bg-sand-50 flex items-center gap-0 border-b border-sand-200 overflow-x-auto"
        style={{ top: 'var(--header-h, 96px)' }}
      >
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
            <AmazonImport />
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
        <div ref={txListRef} style={{ minHeight: txListMinHeight || undefined }}>
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
              filterTags={filterTags}
              onFilterTagsChange={setFilterTags}
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
