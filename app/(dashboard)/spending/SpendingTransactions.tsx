'use client';

import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
import { formatCurrencyPrecise } from '@/app/lib/utils';
import type { DateFilter } from './SpendingView';

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function CalendarMonth({
  year, month, rangeStart, rangeEnd, hoverDate, selecting,
  onDayClick, onDayHover,
}: {
  year: number; month: number;
  rangeStart: string | null; rangeEnd: string | null;
  hoverDate: string | null; selecting: boolean;
  onDayClick: (d: string) => void;
  onDayHover: (d: string | null) => void;
}) {
  const label = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Effective range including hover preview
  const [effStart, effEnd] = (() => {
    if (selecting && hoverDate && rangeStart) {
      return hoverDate >= rangeStart
        ? [rangeStart, hoverDate]
        : [hoverDate, rangeStart];
    }
    return [rangeStart, rangeEnd];
  })();

  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="min-w-[196px]">
      <p className="text-xs font-semibold text-ink-700 text-center mb-3">{label}</p>
      <div className="grid grid-cols-7 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <span key={i} className="text-center text-[10px] text-ink-300 font-medium">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} />;
          const ds = isoDate(year, month, day);
          const isStart = ds === effStart;
          const isEnd = ds === effEnd;
          const inRange = !!(effStart && effEnd && ds > effStart && ds < effEnd);
          return (
            <div
              key={day}
              className={`flex items-center justify-center h-8 ${
                inRange ? 'bg-sand-100' : ''
              } ${isStart && effEnd ? 'rounded-l-full' : ''} ${isEnd && effStart ? 'rounded-r-full' : ''}`}
            >
              <button
                onClick={() => onDayClick(ds)}
                onMouseEnter={() => onDayHover(ds)}
                onMouseLeave={() => onDayHover(null)}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors ${
                  isStart || isEnd
                    ? 'bg-ink-800 text-white font-medium'
                    : inRange
                      ? 'hover:bg-sand-200 text-ink-700'
                      : 'hover:bg-sand-100 text-ink-600'
                }`}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DateControl({
  dateFilter,
  dateFilterActive,
  onChange,
  onClear,
}: {
  dateFilter: DateFilter;
  dateFilterActive: boolean;
  onChange: (f: DateFilter) => void;
  onClear: () => void;
}) {
  const today = new Date();
  const [customOpen, setCustomOpen] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(Math.max(today.getMonth() - 1, 0));
  const [rangeStart, setRangeStart] = useState<string | null>(
    dateFilter.mode === 'custom' && dateFilterActive ? dateFilter.start : null
  );
  const [rangeEnd, setRangeEnd] = useState<string | null>(
    dateFilter.mode === 'custom' && dateFilterActive ? dateFilter.end : null
  );
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setCustomOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isMonthActive = dateFilter.mode === 'month' && dateFilterActive;
  const isCustomActive = dateFilter.mode === 'custom' && dateFilterActive;

  const monthYear = isMonthActive
    ? new Date(dateFilter.year, dateFilter.month, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : today.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const customLabel = isCustomActive
    ? `${dateFilter.start.slice(5).replace('-', '/')} – ${dateFilter.end.slice(5).replace('-', '/')}`
    : 'Custom';

  function goMonth(delta: number) {
    const base = isMonthActive ? new Date(dateFilter.year, dateFilter.month, 1) : new Date(today.getFullYear(), today.getMonth(), 1);
    base.setMonth(base.getMonth() + delta);
    onChange({ mode: 'month', year: base.getFullYear(), month: base.getMonth() });
  }

  function handleDayClick(ds: string) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(ds);
      setRangeEnd(null);
    } else {
      const [s, e] = ds >= rangeStart ? [rangeStart, ds] : [ds, rangeStart];
      setRangeStart(s);
      setRangeEnd(e);
      onChange({ mode: 'custom', start: s, end: e });
      setCustomOpen(false);
      setHoverDate(null);
    }
  }

  // Second calendar month
  const cal2Month = calMonth === 11 ? 0 : calMonth + 1;
  const cal2Year = calMonth === 11 ? calYear + 1 : calYear;

  function calPrev() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  }
  function calNext() {
    if (calMonth === 10) { setCalMonth(11); }
    else if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  }

  return (
    <div ref={ref} className="relative shrink-0 flex items-center gap-1.5">
      {/* Inline month navigator */}
      <div className={`flex items-center rounded-lg border bg-white ${isMonthActive ? 'border-ink-700' : 'border-sand-200'}`}>
        <button
          onClick={() => goMonth(-1)}
          className="px-1.5 py-1 text-ink-400 hover:text-ink-700 transition-colors"
          aria-label="Previous month"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => isMonthActive ? onClear() : onChange({ mode: 'month', year: today.getFullYear(), month: today.getMonth() })}
          className={`text-xs font-medium px-1 min-w-[76px] text-center transition-colors ${isMonthActive ? 'text-ink-800' : 'text-ink-400 hover:text-ink-700'}`}
        >
          {monthYear}
        </button>
        <button
          onClick={() => goMonth(1)}
          className="px-1.5 py-1 text-ink-400 hover:text-ink-700 transition-colors"
          aria-label="Next month"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Custom range button */}
      <button
        onClick={() => setCustomOpen((v) => !v)}
        className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
          isCustomActive
            ? 'bg-ink-800 text-white border-ink-800'
            : 'bg-white border-sand-200 text-ink-500 hover:border-sand-300'
        }`}
      >
        {customLabel}
      </button>

      {/* Calendar popover */}
      {customOpen && (
        <div className="absolute right-0 top-full mt-2 z-30 bg-white border border-sand-200 rounded-2xl shadow-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={calPrev} className="p-1.5 rounded-lg hover:bg-sand-100 text-ink-400 hover:text-ink-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={calNext} className="p-1.5 rounded-lg hover:bg-sand-100 text-ink-400 hover:text-ink-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="flex gap-8">
            <CalendarMonth
              year={calYear} month={calMonth}
              rangeStart={rangeStart} rangeEnd={rangeEnd}
              hoverDate={hoverDate} selecting={!!(rangeStart && !rangeEnd)}
              onDayClick={handleDayClick} onDayHover={setHoverDate}
            />
            <CalendarMonth
              year={cal2Year} month={cal2Month}
              rangeStart={rangeStart} rangeEnd={rangeEnd}
              hoverDate={hoverDate} selecting={!!(rangeStart && !rangeEnd)}
              onDayClick={handleDayClick} onDayHover={setHoverDate}
            />
          </div>
          {rangeStart && !rangeEnd && (
            <p className="text-xs text-ink-400 text-center mt-3">Select end date</p>
          )}
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
import { markReimbursable } from './actions';

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
  /** When false, clears the external filter (shows all time). */
  externalDateFilterActive?: boolean;
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
  externalDateFilterActive,
}: SpendingTransactionsProps) {
  // Local date filter — affects only the transactions list, not the page-level charts.
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    const n = new Date();
    return { mode: 'month', year: n.getFullYear(), month: n.getMonth() };
  });
  const [dateFilterActive, setDateFilterActive] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const pillsRef = useRef<HTMLDivElement>(null);

  const handleDateFilterChange = (f: DateFilter) => {
    setDateFilterActive(true);
    setDateFilter(f);
  };
  const clearDateFilter = () => setDateFilterActive(false);

  // Sync from the parent date picker when it changes (but not on first mount —
  // we want the transactions list to default to "all time").
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (!externalDateFilter) return;
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (externalDateFilterActive === false) {
      setDateFilterActive(false);
    } else {
      setDateFilter(externalDateFilter);
      setDateFilterActive(true);
    }
  }, [externalDateFilter, externalDateFilterActive]);

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
  const [showTransfers, setShowTransfers] = useState(true);
  const [expandedParent, setExpandedParent] = useState<string | null>(null);
  const [hoveredChip, setHoveredChip] = useState<string | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Optimistic overrides
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, Category>>({});
  const [payeeOverrides, setPayeeOverrides] = useState<Record<string, string>>({});
  const [transferOverrides, setTransferOverrides] = useState<Record<string, boolean>>({});
  const [reimbursableOverrides, setReimbursableOverrides] = useState<Record<string, boolean>>({});

  // Bulk select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tripStart, setTripStart] = useState('');
  const [tripEnd, setTripEnd] = useState('');
  const [markingReimbursable, setMarkingReimbursable] = useState(false);

  // Detail panel
  const [detailTxId, setDetailTxId] = useState<string | null>(null);

  const [visibleCount, setVisibleCount] = useState(50);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  function getEffectiveCategory(tx: Transaction): Transaction['category'] {
    return (categoryOverrides[tx.id] as any) ?? tx.category;
  }

  function getEffectivePayee(tx: Transaction): string {
    return payeeOverrides[tx.id] ?? tx.payee ?? tx.description ?? 'Unknown';
  }

  function getEffectiveReimbursable(tx: Transaction): boolean {
    return reimbursableOverrides[tx.id] ?? tx.is_reimbursable;
  }

  function enterSelectMode() {
    setSelectMode(true);
    setSelectedIds(new Set());
    setTripStart('');
    setTripEnd('');
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setTripStart('');
    setTripEnd('');
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((tx) => tx.id)));
    }
  }

  function applyTripRange() {
    if (!tripStart || !tripEnd) return;
    const ids = new Set(
      filtered
        .filter((tx) => {
          const d = tx.posted_at.slice(0, 10);
          return d >= tripStart && d <= tripEnd;
        })
        .map((tx) => tx.id),
    );
    setSelectedIds(ids);
  }

  async function handleMarkReimbursable() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setMarkingReimbursable(true);
    setReimbursableOverrides((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = true;
      return next;
    });
    try {
      await markReimbursable(ids, true);
      exitSelectMode();
    } catch {
      setReimbursableOverrides((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
    } finally {
      setMarkingReimbursable(false);
    }
  }

  const chipCategories = useMemo(() => {
    // Top-level (parent) categories only — subcategories appear on expansion.
    const list: { id: string; name: string; icon: string; color: string }[] = allCategories
      .filter((c) => !c.is_income && !c.parent_id)
      .map((c) => ({ id: c.id, name: c.name, icon: c.icon || '', color: c.color || '#6B7280' }));

    const knownNames = new Set(list.map((c) => c.name));

    // Capture any transaction categories not yet in allCategories (treat as top-level).
    for (const tx of transactions) {
      const cat = getEffectiveCategory(tx);
      const name = cat?.name || 'Uncategorized';
      if (!knownNames.has(name) && !allCategories.find((c) => c.name === name)?.parent_id) {
        list.push({ id: cat?.id || name, name, icon: cat?.icon || '❓', color: cat?.color || '#D1D5DB' });
        knownNames.add(name);
      }
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, allCategories, categoryOverrides]);

  const subChips = useMemo(() => {
    if (!expandedParent) return [];
    const parent = allCategories.find((c) => c.name === expandedParent);
    if (!parent) return [];
    return allCategories
      .filter((c) => c.parent_id === parent.id)
      .map((c) => ({ id: c.id, name: c.name, icon: c.icon || '', color: c.color || parent.color || '#6B7280' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [expandedParent, allCategories]);

  // Hide pills that overflow the row instead of clipping them mid-chip.
  useEffect(() => {
    const container = pillsRef.current;
    if (!container) return;

    function update() {
      if (!container) return;
      if (filtersExpanded) {
        (Array.from(container.children) as HTMLElement[]).forEach((el) => {
          el.style.opacity = '';
          el.style.pointerEvents = '';
        });
        return;
      }
      const right = container.getBoundingClientRect().right;
      (Array.from(container.children) as HTMLElement[]).forEach((el) => {
        const fits = el.getBoundingClientRect().right <= right + 1;
        el.style.opacity = fits ? '' : '0';
        el.style.pointerEvents = fits ? '' : 'none';
      });
    }

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [filtersExpanded, chipCategories]);

  const filtered = useMemo(() => {
    let result = transactions;

    if (dateFilterActive) {
      let start: string, end: string;
      if (dateFilter.mode === 'month') {
        const monthStr = `${dateFilter.year}-${String(dateFilter.month + 1).padStart(2, '0')}`;
        result = result.filter((tx) => tx.posted_at.substring(0, 7) === monthStr);
      } else {
        // Compare date portions only — avoids timezone/format string mismatches
        // (matches how the chart groups daily spending data)
        result = result.filter((tx) => {
          const d = tx.posted_at.slice(0, 10);
          return d >= dateFilter.start && d <= dateFilter.end;
        });
      }
    }

    if (filterCategories.length > 0) {
      // Expand parent selection to include its children's transactions.
      const matchNames = new Set<string>(filterCategories);
      for (const name of filterCategories) {
        const parent = allCategories.find((c) => c.name === name && !c.parent_id);
        if (parent) {
          allCategories.filter((c) => c.parent_id === parent.id).forEach((c) => matchNames.add(c.name));
        }
      }
      result = result.filter((tx) => matchNames.has(getEffectiveCategory(tx)?.name || 'Uncategorized'));
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

    if (!showTransfers) {
      result = result.filter((tx) => {
        const effectiveIsTransfer = (transferOverrides[tx.id] ?? tx.is_transfer) || tx.category?.name === 'Transfer';
        return !effectiveIsTransfer;
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
  }, [transactions, dateFilter, dateFilterActive, filterCategories, search, sortBy, sortDir, categoryOverrides, payeeOverrides, transferOverrides, showTransfers]);

  useEffect(() => { setVisibleCount(50); }, [filtered]);

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
    dateFilterActive ||
    !showTransfers;
  const detailTx = detailTxId ? transactions.find((t) => t.id === detailTxId) : null;

  return (
    <>
      <div>
        <div className="sticky top-0 md:top-14 z-10 bg-sand-50 space-y-3 pb-3">
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
          <button
            onClick={() => setShowTransfers((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              showTransfers
                ? 'bg-white border border-sand-200 text-ink-500 hover:border-sand-300'
                : 'bg-white border border-sand-200 text-ink-300'
            }`}
          >
            {showTransfers ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            )}
            Transfers: <span className={showTransfers ? 'text-ink-700' : 'text-ink-300'}>{showTransfers ? 'ON' : 'OFF'}</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <DateControl
              dateFilter={dateFilter}
              dateFilterActive={dateFilterActive}
              onChange={handleDateFilterChange}
              onClear={clearDateFilter}
            />
            {!selectMode && (
              <button
                onClick={enterSelectMode}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-sand-200 text-ink-500 hover:border-sand-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Select
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Filter controls */}
        <div className="flex items-start gap-2 min-w-0">
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
          <div className="hidden md:flex flex-1 min-w-0 items-start gap-1.5">
            <div
              ref={pillsRef}
              className={`flex gap-2 flex-1 min-w-0 ${filtersExpanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden'}`}
            >
              <button
                onClick={() => { setFilterCategories([]); setExpandedParent(null); }}
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
                const isExpanded = expandedParent === cat.name;
                const children = isExpanded ? subChips : [];
                return (
                  <Fragment key={cat.name}>
                    <button
                      onClick={() => {
                        if (isExpanded) {
                          setFilterCategories([]);
                          setExpandedParent(null);
                        } else {
                          setFilterCategories([cat.name]);
                          setExpandedParent(cat.name);
                        }
                      }}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                        active
                          ? 'text-white border-transparent'
                          : isExpanded
                            ? 'bg-white text-ink-600'
                            : 'bg-white border-sand-200 text-ink-500 hover:border-sand-300'
                      }`}
                      style={
                        active
                          ? { backgroundColor: cat.color, borderColor: cat.color }
                          : isExpanded
                            ? { borderColor: cat.color, color: cat.color }
                            : {}
                      }
                    >
                      <span>{cat.icon}</span>
                      {cat.name}
                    </button>
                    {children.map((sub) => {
                      const subActive = filterCategories.includes(sub.name);
                      return (
                        <button
                          key={sub.name}
                          onClick={() => setFilterCategories(subActive ? [cat.name] : [sub.name])}
                          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border-2 ${
                            subActive ? 'text-white' : 'bg-white'
                          }`}
                          style={
                            subActive
                              ? { backgroundColor: cat.color, borderColor: cat.color }
                              : { borderColor: cat.color, color: cat.color }
                          }
                        >
                          <span className="text-[10px]">{sub.icon}</span>
                          {sub.name}
                        </button>
                      );
                    })}
                  </Fragment>
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

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => {
                setFilterCategories([]);
                setExpandedParent(null);
                setSearch('');
                onAccountChange?.(null);
                clearDateFilter();
                setShowTransfers(true);
              }}
              className="shrink-0 text-xs text-ink-400 hover:text-ink-600 transition-colors whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>

        {/* Bulk select toolbar */}
        {selectMode && (
          <div className="rounded-xl border border-ink-200 bg-sand-50 px-4 py-3 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Select all */}
              <label className="flex items-center gap-2 text-xs font-medium text-ink-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                  ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
                  onChange={toggleAll}
                  className="w-4 h-4 rounded accent-ink-800 cursor-pointer"
                />
                {selectedIds.size === 0 ? 'Select all' : `${selectedIds.size} selected`}
              </label>

              {/* Trip date range */}
              <div className="flex items-center gap-1.5 text-xs text-ink-500">
                <span className="font-medium">Trip:</span>
                <input
                  type="date"
                  value={tripStart}
                  onChange={(e) => setTripStart(e.target.value)}
                  className="border border-sand-300 rounded px-2 py-1 text-ink-700 bg-white focus:outline-none focus:ring-1 focus:ring-sand-400 text-xs"
                />
                <span>→</span>
                <input
                  type="date"
                  value={tripEnd}
                  min={tripStart}
                  onChange={(e) => setTripEnd(e.target.value)}
                  className="border border-sand-300 rounded px-2 py-1 text-ink-700 bg-white focus:outline-none focus:ring-1 focus:ring-sand-400 text-xs"
                />
                <button
                  onClick={applyTripRange}
                  disabled={!tripStart || !tripEnd}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-sand-300 text-ink-600 hover:border-ink-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Apply
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleMarkReimbursable}
                  disabled={selectedIds.size === 0 || markingReimbursable}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ↩ Mark Reimbursable{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </button>
                <button
                  onClick={exitSelectMode}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink-500 hover:text-ink-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        </div>{/* /sticky controls */}

        {/* Transaction list */}
        <div className="card p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-ink-400 text-sm">
              No transactions match your search.
            </div>
          ) : (
            filtered.slice(0, visibleCount).map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={{ ...tx, payee: getEffectivePayee(tx) }}
                allCategories={allCategories}
                initialVenmo={venmoByTxId.get(tx.id) ?? null}
                knownVenmoNames={knownVenmoNames}
                localCategory={categoryOverrides[tx.id] ?? null}
                localIsTransfer={transferOverrides[tx.id] ?? tx.is_transfer}
                isReimbursable={getEffectiveReimbursable(tx)}
                selectMode={selectMode}
                selected={selectedIds.has(tx.id)}
                onToggleSelect={() => toggleOne(tx.id)}
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

        {filtered.length > 0 && (
          <p className="text-xs text-ink-400 text-center mt-3">
            {Math.min(visibleCount, filtered.length)} of {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
            {hasFilters && ` · filtered from ${transactions.length}`}
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
