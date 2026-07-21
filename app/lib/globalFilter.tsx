'use client';

import { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { resolveStart, type RangeKey } from './investmentRange';

export type DateFilter =
  | { mode: 'month'; year: number; month: number }
  | { mode: 'custom'; start: string; end: string };

export interface SegmentSelection { label: string; start: string; end: string }
export interface CategorySelection { key: string; label: string; color?: string; icon?: string }

interface GlobalFilterContextValue {
  dateFilter: DateFilter;
  activePreset: RangeKey | null;
  showCustom: boolean;
  resolvedRange: { start: string; end: string };
  /** Display label for the current window — a month name in month mode, otherwise a date range. */
  rangeLabel: string;
  /** Whether stepPeriod(1) would move to a later window (false at the current period / for YTD & All). */
  canStepForward: boolean;
  /** Whether stepPeriod(-1) would move to an earlier window (false for YTD & All). */
  canStepBackward: boolean;
  goMonth: (delta: number) => void;
  goToMonth: (year: number, month: number) => void;
  /** Shifts the current window by its own span (a day/week/month/3-months/custom range/etc,
   *  whatever is currently active) — the natural "previous/next period" arrows. */
  stepPeriod: (delta: number) => void;
  applyPreset: (key: RangeKey) => void;
  activateCustom: () => void;
  backToMonth: () => void;
  resetFilter: () => void;
  setCustomStart: (v: string) => void;
  setCustomEnd: (v: string) => void;
  segment: SegmentSelection | null;
  setSegment: (seg: SegmentSelection | null) => void;
  clearSegment: () => void;
  category: CategorySelection | null;
  setCategory: (cat: CategorySelection | null) => void;
  clearCategory: () => void;
}

export function formatMonthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatShortDate(dateIso: string) {
  return new Date(dateIso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const isoDate = (d: Date) => d.toISOString().substring(0, 10);
const DAY_MS = 86_400_000;

// 'All'/'Today' presets need an earliest-date anchor, but this context doesn't own any
// page's dataset. Each page's own chart still clips to its real data range, so a generous
// fixed fallback here only affects the computed start of those two presets in the abstract.
const FALLBACK_FIRST_DATE_YEARS_BACK = 5;

const GlobalFilterContext = createContext<GlobalFilterContextValue | null>(null);

export function GlobalFilterProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const now = useMemo(() => new Date(), []);

  const [dateFilter, setDateFilter] = useState<DateFilter>({
    mode: 'month',
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [activePreset, setActivePreset] = useState<RangeKey | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [segment, setSegmentState] = useState<SegmentSelection | null>(null);
  const [category, setCategoryState] = useState<CategorySelection | null>(null);

  // Drill-down chips are page-scoped in meaning — clear them on navigation.
  // The shared time filter deliberately survives route changes.
  useEffect(() => {
    setSegmentState(null);
    setCategoryState(null);
  }, [pathname]);

  const monthNavBase = dateFilter.mode === 'month'
    ? { year: dateFilter.year, month: dateFilter.month }
    : { year: now.getFullYear(), month: now.getMonth() };

  const goMonth = (delta: number) => {
    let { year, month } = monthNavBase;
    month += delta;
    if (month < 0) { month = 11; year--; }
    if (month > 11) { month = 0; year++; }
    setDateFilter({ mode: 'month', year, month });
    setActivePreset(null);
    setShowCustom(false);
    setSegmentState(null);
  };

  const goToMonth = (year: number, month: number) => {
    setDateFilter({ mode: 'month', year, month });
    setActivePreset(null);
    setShowCustom(false);
    setSegmentState(null);
  };

  const activateCustom = () => {
    setShowCustom(true);
    setActivePreset(null);
    setSegmentState(null);
    const start = dateFilter.mode === 'month'
      ? new Date(dateFilter.year, dateFilter.month, 1).toISOString().substring(0, 10)
      : dateFilter.start;
    const end = dateFilter.mode === 'month'
      ? new Date(dateFilter.year, dateFilter.month + 1, 0).toISOString().substring(0, 10)
      : dateFilter.end;
    setDateFilter({ mode: 'custom', start, end });
  };

  const backToMonth = () => {
    setShowCustom(false);
    setActivePreset(null);
    setSegmentState(null);
    setDateFilter({ mode: 'month', year: now.getFullYear(), month: now.getMonth() });
  };

  const applyPreset = (key: RangeKey) => {
    if (key === 'custom') {
      activateCustom();
      return;
    }
    const todayIso = now.toISOString().substring(0, 10);
    // 'today' resolves via prevDate (meant for "just the latest data point vs. the
    // one before it" in a real series) — this context has no series, so special-case
    // it to exactly today rather than letting it fall back to firstDate.
    let start: string;
    if (key === 'today') {
      start = todayIso;
    } else {
      const firstDate = new Date(now.getFullYear() - FALLBACK_FIRST_DATE_YEARS_BACK, now.getMonth(), now.getDate())
        .toISOString().substring(0, 10);
      start = resolveStart(key, { now, firstDate });
    }
    setShowCustom(false);
    setSegmentState(null);
    setDateFilter({ mode: 'custom', start, end: todayIso });
    setActivePreset(key);
  };

  const resetFilter = () => {
    setShowCustom(false);
    setActivePreset(null);
    setSegmentState(null);
    setDateFilter({ mode: 'month', year: now.getFullYear(), month: now.getMonth() });
  };

  const setCustomStart = (v: string) => {
    if (dateFilter.mode === 'custom') setDateFilter({ ...dateFilter, start: v });
  };
  const setCustomEnd = (v: string) => {
    if (dateFilter.mode === 'custom') setDateFilter({ ...dateFilter, end: v });
  };

  const resolvedRange = useMemo(() => {
    if (dateFilter.mode === 'month') {
      const start = new Date(dateFilter.year, dateFilter.month, 1).toISOString().substring(0, 10);
      const end = new Date(dateFilter.year, dateFilter.month + 1, 0).toISOString().substring(0, 10);
      return { start, end };
    }
    return { start: dateFilter.start, end: dateFilter.end };
  }, [dateFilter]);

  const todayIso = isoDate(now);

  // YTD and All don't have a natural "previous/next period" — every other preset,
  // plain custom range, or month has a fixed span that can be shifted.
  const isSteppable = !(activePreset === 'year' || activePreset === 'all');

  const canStepForward = dateFilter.mode === 'month'
    ? !(dateFilter.year === now.getFullYear() && dateFilter.month === now.getMonth())
    : isSteppable && dateFilter.end < todayIso;

  const canStepBackward = dateFilter.mode === 'month' ? true : isSteppable;

  const stepPeriod = (delta: number) => {
    if (dateFilter.mode === 'month') { goMonth(delta); return; }
    if (!isSteppable) return;
    const start = new Date(dateFilter.start + 'T00:00:00');
    const end = new Date(dateFilter.end + 'T00:00:00');
    const spanDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
    const shiftMs = spanDays * delta * DAY_MS;
    let newStart = new Date(start.getTime() + shiftMs);
    let newEnd = new Date(end.getTime() + shiftMs);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (newEnd.getTime() > today.getTime()) {
      newEnd = today;
      newStart = new Date(today.getTime() - (spanDays - 1) * DAY_MS);
    }
    setDateFilter({ mode: 'custom', start: isoDate(newStart), end: isoDate(newEnd) });
    setSegmentState(null);
  };

  const rangeLabel = dateFilter.mode === 'month'
    ? formatMonthLabel(dateFilter.year, dateFilter.month)
    : `${formatShortDate(dateFilter.start)} – ${formatShortDate(dateFilter.end)}`;

  const setSegment = (seg: SegmentSelection | null) => setSegmentState(seg);
  const clearSegment = () => setSegmentState(null);
  const setCategory = (cat: CategorySelection | null) => setCategoryState(cat);
  const clearCategory = () => setCategoryState(null);

  const value: GlobalFilterContextValue = {
    dateFilter, activePreset, showCustom, resolvedRange, rangeLabel, canStepForward, canStepBackward,
    goMonth, goToMonth, stepPeriod, applyPreset, activateCustom, backToMonth, resetFilter,
    setCustomStart, setCustomEnd,
    segment, setSegment, clearSegment,
    category, setCategory, clearCategory,
  };

  return (
    <GlobalFilterContext.Provider value={value}>
      {children}
    </GlobalFilterContext.Provider>
  );
}

export function useGlobalFilter() {
  const ctx = useContext(GlobalFilterContext);
  if (!ctx) throw new Error('useGlobalFilter must be used within a GlobalFilterProvider');
  return ctx;
}
