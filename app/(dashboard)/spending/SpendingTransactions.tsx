'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { formatCurrencyPrecise } from '@/app/lib/utils';
import type { DateFilter } from './SpendingView';

type Segment = '7d' | '30d' | '3m' | '6m' | 'ytd' | 'all' | 'custom';

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: 'ytd', label: 'YTD' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
];

function computeSegmentRange(seg: Segment): { start: string; end: string } | null {
  if (seg === 'all' || seg === 'custom') return null;
  const today = new Date();
  const end = today.toISOString().substring(0, 10);
  const from = new Date(today);
  if (seg === '7d') from.setDate(from.getDate() - 6);
  else if (seg === '30d') from.setDate(from.getDate() - 29);
  else if (seg === '3m') from.setMonth(from.getMonth() - 3);
  else if (seg === '6m') from.setMonth(from.getMonth() - 6);
  else { from.setMonth(0); from.setDate(1); } // ytd
  return { start: from.toISOString().substring(0, 10), end };
}

function DateSegmentControl({
  value,
  customRange,
  onSelect,
  onCustomRange,
}: {
  value: Segment;
  customRange: { start: string; end: string };
  onSelect: (seg: Segment) => void;
  onCustomRange: (range: { start: string; end: string }) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setCustomOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSegment(seg: Segment) {
    if (seg === 'custom') {
      setCustomOpen((v) => !v);
    } else {
      setCustomOpen(false);
    }
    onSelect(seg);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <div className="inline-flex items-center rounded-lg border border-sand-200 bg-white overflow-hidden divide-x divide-sand-200">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            onClick={() => handleSegment(s.id)}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              value === s.id
                ? 'bg-ink-800 text-white'
                : 'text-ink-500 hover:bg-sand-50 hover:text-ink-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {customOpen && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-sand-200 rounded-xl shadow-lg p-3 space-y-2 w-52">
          <p className="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">Custom range</p>
          <div className="flex items-center gap-1.5 text-xs">
            <label className="text-ink-400 w-7 shrink-0">From</label>
            <input
              type="date"
              value={customRange.start}
              max={customRange.end || undefined}
              onChange={(e) => onCustomRange({ ...customRange, start: e.target.value })}
              className="flex-1 px-2 py-1 border border-sand-200 rounded-md focus:outline-none focus:border-ink-400 text-ink-700"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <label className="text-ink-400 w-7 shrink-0">To</label>
            <input
              type="date"
              value={customRange.end}
              min={customRange.start || undefined}
              onChange={(e) => onCustomRange({ ...customRange, end: e.target.value })}
              className="flex-1 px-2 py-1 border border-sand-200 rounded-md focus:outline-none focus:border-ink-400 text-ink-700"
            />
          </div>
        </div>
      )}
    </div>
  );
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
import TransactionDetail, { type FullTransaction } from './TransactionDetail';
import TransactionRow from './TransactionRow';
import type { Category } from './CategoryManager';

interface Transaction extends FullTransaction {
  account_id: string;
}

interface VenmoRequestSummary {
  transaction_id: string;
  person_name: string;
  amount: number;
  status: 'pending' | 'requested' | 'settled';
  id: string;
}

interface SpendingTransactionsProps {
  transactions: Transaction[];
  allCategories: Category[];
  venmoRequests?: VenmoRequestSummary[];
  accounts?: { id: string; name: string; institution: string }[];
  selectedAccount?: string | null;
  onAccountChange?: (id: string | null) => void;
  /** External date filter (e.g. from the page-level month picker) — when it
   *  changes, the transactions list syncs to it. The user can still override
   *  via the local dropdown without affecting the parent. */
  externalDateFilter?: DateFilter;
}

type SortField = 'date' | 'amount' | 'category';
type SortDir = 'asc' | 'desc';

export default function SpendingTransactions({
  transactions,
  allCategories,
  venmoRequests = [],
  accounts = [],
  selectedAccount = null,
  onAccountChange,
  externalDateFilter,
}: SpendingTransactionsProps) {
  // Local date filter — affects only the transactions list, not the page-level charts.
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    const n = new Date();
    return { mode: 'month', year: n.getFullYear(), month: n.getMonth() };
  });
  const [dateFilterActive, setDateFilterActive] = useState(false);
  const [activeSegment, setActiveSegment] = useState<Segment>('all');
  const [customDateRange, setCustomDateRange] = useState(() => {
    const today = new Date();
    return { start: `${today.getFullYear()}-01-01`, end: today.toISOString().substring(0, 10) };
  });
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const handleDateFilterChange = (f: DateFilter) => {
    setDateFilterActive(true);
    setDateFilter(f);
  };
  const clearDateFilter = () => setDateFilterActive(false);

  function handleSegmentSelect(seg: Segment) {
    setActiveSegment(seg);
    if (seg === 'all') {
      clearDateFilter();
    } else if (seg === 'custom') {
      if (customDateRange.start && customDateRange.end) {
        handleDateFilterChange({ mode: 'custom', start: customDateRange.start, end: customDateRange.end });
      }
    } else {
      const range = computeSegmentRange(seg)!;
      handleDateFilterChange({ mode: 'custom', start: range.start, end: range.end });
    }
  }

  function handleCustomRangeChange(range: { start: string; end: string }) {
    setCustomDateRange(range);
    if (range.start && range.end) {
      handleDateFilterChange({ mode: 'custom', start: range.start, end: range.end });
    }
  }

  // Sync from the parent date picker when it changes (but not on first mount —
  // we want the transactions list to default to "all time").
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (!externalDateFilter) return;
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    setDateFilter(externalDateFilter);
    setDateFilterActive(true);
    setActiveSegment('custom');
    if (externalDateFilter.mode === 'custom') {
      setCustomDateRange({ start: externalDateFilter.start, end: externalDateFilter.end });
    } else if (externalDateFilter.mode === 'month') {
      const start = new Date(externalDateFilter.year, externalDateFilter.month, 1).toISOString().substring(0, 10);
      const end = new Date(externalDateFilter.year, externalDateFilter.month + 1, 0).toISOString().substring(0, 10);
      setCustomDateRange({ start, end });
    }
  }, [externalDateFilter]);
  const venmoByTxId = useMemo(
    () => new Map(venmoRequests.map((r) => [r.transaction_id, r])),
    [venmoRequests],
  );

  const [knownVenmoNames, setKnownVenmoNames] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/venmo?names=1').then((r) => r.json()).then((d) => setKnownVenmoNames(d.names ?? []));
  }, []);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [hoveredChip, setHoveredChip] = useState<string | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Optimistic overrides
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, Category>>({});
  const [payeeOverrides, setPayeeOverrides] = useState<Record<string, string>>({});
  const [transferOverrides, setTransferOverrides] = useState<Record<string, boolean>>({});

  // Detail panel
  const [detailTxId, setDetailTxId] = useState<string | null>(null);

  function getEffectiveCategory(tx: Transaction): Transaction['category'] {
    return (categoryOverrides[tx.id] as any) ?? tx.category;
  }

  function getEffectivePayee(tx: Transaction): string {
    return payeeOverrides[tx.id] ?? tx.payee ?? tx.description ?? 'Unknown';
  }

  const chipCategories = useMemo(() => {
    const map = new Map<string, { name: string; icon: string; color: string }>();
    for (const tx of transactions) {
      const cat = getEffectiveCategory(tx);
      const name = cat?.name || 'Uncategorized';
      if (!map.has(name)) map.set(name, { name, icon: cat?.icon || '❓', color: cat?.color || '#D1D5DB' });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, categoryOverrides]);

  const filtered = useMemo(() => {
    let result = transactions;

    if (dateFilterActive) {
      let start: string, end: string;
      if (dateFilter.mode === 'month') {
        start = new Date(dateFilter.year, dateFilter.month, 1).toISOString();
        end = new Date(dateFilter.year, dateFilter.month + 1, 0, 23, 59, 59, 999).toISOString();
      } else {
        start = dateFilter.start + 'T00:00:00.000Z';
        end = dateFilter.end + 'T23:59:59.999Z';
      }
      result = result.filter((tx) => tx.posted_at >= start && tx.posted_at <= end);
    }

    if (filterCategories.length > 0) {
      result = result.filter((tx) =>
        filterCategories.includes(getEffectiveCategory(tx)?.name || 'Uncategorized'),
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((tx) => {
        const name = getEffectivePayee(tx).toLowerCase();
        const cat = (getEffectiveCategory(tx)?.name || 'Uncategorized').toLowerCase();
        const amount = formatCurrencyPrecise(Math.abs(tx.amount)).toLowerCase();
        return name.includes(q) || cat.includes(q) || amount.includes(q);
      });
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') {
        cmp = new Date(a.posted_at).getTime() - new Date(b.posted_at).getTime();
      } else if (sortBy === 'amount') {
        cmp = Math.abs(a.amount) - Math.abs(b.amount);
      } else if (sortBy === 'category') {
        cmp = (getEffectiveCategory(a)?.name || 'Uncategorized').localeCompare(
          getEffectiveCategory(b)?.name || 'Uncategorized',
        );
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, dateFilter, dateFilterActive, filterCategories, search, sortBy, sortDir, categoryOverrides, payeeOverrides]);

  function toggleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir(field === 'category' ? 'asc' : 'desc');
    }
  }

  const hasFilters =
    filterCategories.length > 0 ||
    !!search.trim() ||
    !!selectedAccount ||
    dateFilterActive;
  const detailTx = detailTxId ? transactions.find((t) => t.id === detailTxId) : null;

  return (
    <>
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, category, or amount…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-sand-200 rounded-xl text-sm text-ink-700 placeholder-ink-300 focus:outline-none focus:ring-2 focus:ring-sand-300"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Row 1: Sort controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-ink-400 shrink-0">Sort by</span>
          {(['date', 'amount', 'category'] as SortField[]).map((field) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                sortBy === field
                  ? 'bg-ink-800 text-white'
                  : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
              }`}
            >
              {field.charAt(0).toUpperCase() + field.slice(1)}
              {sortBy === field && (
                <svg
                  className={`w-3 h-3 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
          ))}
          {accounts.length > 1 && (
            <AccountDropdown
              accounts={accounts}
              selectedAccount={selectedAccount}
              onChange={onAccountChange ?? (() => {})}
            />
          )}
        </div>

        {/* Row 2: Filter controls */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-ink-400 shrink-0">Filter by</span>

          {/* Mobile: category dropdown */}
          <div className="md:hidden relative shrink-0">
            {showCategoryDropdown && (
              <div className="fixed inset-0 z-10" onClick={() => setShowCategoryDropdown(false)} />
            )}
            <button
              onClick={() => setShowCategoryDropdown((v) => !v)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filterCategories.length > 0
                  ? 'bg-ink-800 text-white border-ink-800'
                  : 'bg-white border-sand-200 text-ink-600'
              }`}
            >
              {filterCategories.length === 0
                ? 'All categories'
                : filterCategories.length === 1
                  ? `${chipCategories.find((c) => c.name === filterCategories[0])?.icon ?? ''} ${filterCategories[0]}`
                  : `${filterCategories.length} categories`}
              <svg
                className={`w-3 h-3 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showCategoryDropdown && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-sand-200 rounded-xl shadow-lg overflow-hidden w-56 max-h-72 overflow-y-auto">
                <button
                  onClick={() => { setFilterCategories([]); setShowCategoryDropdown(false); }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors border-b border-sand-100 ${
                    filterCategories.length === 0 ? 'font-medium text-ink-800 bg-sand-50' : 'text-ink-500 hover:bg-sand-50'
                  }`}
                >
                  All categories
                  {filterCategories.length === 0 && (
                    <svg className="ml-auto w-3.5 h-3.5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                {chipCategories.map((cat) => {
                  const active = filterCategories.includes(cat.name);
                  return (
                    <button
                      key={cat.name}
                      onClick={() => {
                        setFilterCategories(active ? filterCategories.filter((n) => n !== cat.name) : [cat.name]);
                        setShowCategoryDropdown(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors border-b border-sand-50 last:border-0 ${
                        active ? 'font-medium text-ink-800 bg-sand-50' : 'text-ink-500 hover:bg-sand-50'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span className="flex-1">{cat.name}</span>
                      {active && (
                        <svg className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desktop: collapsible pills */}
          <div className="hidden md:flex flex-1 min-w-0 items-center gap-1.5">
            <div className={`flex gap-2 flex-1 min-w-0 ${filtersExpanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden'}`}>
              <button
                onClick={() => setFilterCategories([])}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterCategories.length === 0
                    ? 'bg-ink-800 text-white'
                    : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
                }`}
              >
                All
              </button>
              {chipCategories.map((cat) => {
                const active = filterCategories.includes(cat.name);
                const showAdd = filterCategories.length > 0 && !active && hoveredChip === cat.name;
                return (
                  <div
                    key={cat.name}
                    className="relative shrink-0"
                    onMouseEnter={() => setHoveredChip(cat.name)}
                    onMouseLeave={() => setHoveredChip(null)}
                  >
                    <button
                      onClick={() => {
                        if (active) {
                          setFilterCategories(filterCategories.filter((n) => n !== cat.name));
                        } else {
                          setFilterCategories([cat.name]);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        active ? 'text-white' : 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
                      }`}
                      style={active ? { backgroundColor: cat.color } : {}}
                    >
                      <span>{cat.icon}</span>
                      {cat.name}
                    </button>
                    {showAdd && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFilterCategories([...filterCategories, cat.name]);
                        }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-ink-800 text-white rounded-full flex items-center justify-center shadow-sm hover:bg-ink-600 transition-colors"
                        title={`Add ${cat.name} to filter`}
                      >
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setFiltersExpanded((v) => !v)}
              title={filtersExpanded ? 'Show less' : 'Show all categories'}
              className="shrink-0 p-0.5 text-ink-300 hover:text-ink-600 transition-colors"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${filtersExpanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Date segment control */}
          <DateSegmentControl
            value={activeSegment}
            customRange={customDateRange}
            onSelect={handleSegmentSelect}
            onCustomRange={handleCustomRangeChange}
          />

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => {
                setFilterCategories([]);
                setSearch('');
                onAccountChange?.(null);
                clearDateFilter();
                setActiveSegment('all');
              }}
              className="shrink-0 text-xs text-ink-400 hover:text-ink-600 transition-colors whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>

        {/* Transaction list */}
        <div className="card p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-ink-400 text-sm">
              No transactions match your search.
            </div>
          ) : (
            filtered.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={{ ...tx, payee: getEffectivePayee(tx) }}
                allCategories={allCategories}
                initialVenmo={venmoByTxId.get(tx.id) ?? null}
                knownVenmoNames={knownVenmoNames}
                localCategory={categoryOverrides[tx.id] ?? null}
                localIsTransfer={transferOverrides[tx.id] ?? tx.is_transfer}
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

        {filtered.length > 0 && (
          <p className="text-xs text-ink-400 text-center">
            {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
            {hasFilters && ` · filtered from ${transactions.length}`}
          </p>
        )}
      </div>

      {/* Transaction detail panel */}
      {detailTx && (
        <TransactionDetail
          transaction={detailTx}
          allCategories={allCategories}
          onClose={() => setDetailTxId(null)}
          onCategoryChange={(txId, cat) => {
            // Mirror server behaviour: bulk-update all transactions sharing
            // the same original payee (or description when payee is absent).
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
      )}
    </>
  );
}
