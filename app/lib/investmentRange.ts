import { subDays, startOfYear, format } from 'date-fns';

// Shared time-range vocabulary for the Investment tab — used by both the
// portfolio chart (InvestmentProgress) and the holdings table so the two
// selectors stay identical.

export type RangeKey = 'today' | '7d' | '30d' | '3m' | 'year' | 'all' | 'custom';

export const PRESETS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: '1D' },
  { key: '7d',   label: '1W' },
  { key: '30d',  label: '1M' },
  { key: '3m',   label: '3M' },
  { key: 'year', label: 'YTD' },
  { key: 'all',  label: 'All' },
];

export const isoDate = (d: Date) => format(d, 'yyyy-MM-dd');

// Resolve the inclusive start date (YYYY-MM-DD) for a range.
// `firstDate` is the earliest available data point (used for 'all'/fallbacks);
// `prevDate` is the point just before the latest (used for 'today').
export function resolveStart(
  range: RangeKey,
  opts: { now: Date; firstDate: string; prevDate?: string; customFrom?: string },
): string {
  const { now, firstDate, prevDate, customFrom } = opts;
  switch (range) {
    case 'today':  return prevDate ?? firstDate;
    case '7d':     return isoDate(subDays(now, 7));
    case '30d':    return isoDate(subDays(now, 30));
    case '3m':     return isoDate(subDays(now, 90));
    case 'year':   return isoDate(startOfYear(now));
    case 'custom': return customFrom ?? firstDate;
    case 'all':
    default:       return firstDate;
  }
}

// Index of the last date in `dates` (ascending) that is <= target. -1 if none.
export function idxAtOrBefore(dates: string[], target: string): number {
  let idx = -1;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] <= target) idx = i;
    else break;
  }
  return idx;
}

export interface SeriesPoint { date: string; value: number }

// Sum `accounts` values across the shared `dates` axis, requiring every account
// to have a value on a date before including it (a consistent basket — no jump
// when one account is linked later than the others). The final point is then
// overridden with `liveValue` (today's true current total) so the series always
// ends at today regardless of how stale the last snapshot date is.
export function buildCombinedSeries(
  dates: string[],
  accounts: { values: (number | null)[] }[],
  todayIso: string,
  liveValue: number,
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = 0; i < dates.length; i++) {
    let sum = 0;
    let ok = accounts.length > 0;
    for (const a of accounts) {
      const v = a.values[i];
      if (v == null) { ok = false; break; }
      sum += v;
    }
    if (ok) out.push({ date: dates[i], value: sum });
  }
  if (out.length === 0 || out[out.length - 1].date < todayIso) {
    if (accounts.length > 0) out.push({ date: todayIso, value: liveValue });
  } else {
    out[out.length - 1] = { ...out[out.length - 1], value: liveValue };
  }
  return out;
}

// Change in a combined series between `start` and `end` (inclusive ISO date
// bounds) — the baseline is the last point at or before `start` (so the change
// is flat, not zero, when the range starts before any data exists).
export function seriesChange(
  data: SeriesPoint[],
  start: string,
  end: string,
  liveValue: number,
): { startValue: number; endValue: number; change: number; pct: number } {
  let baseline: SeriesPoint | null = null;
  for (const p of data) {
    if (p.date <= start) baseline = p;
    else break;
  }
  const inRange = data.filter((p) => p.date >= start && p.date <= end);
  const startValue = baseline?.value ?? inRange[0]?.value ?? 0;
  const endValue = inRange.length ? inRange[inRange.length - 1].value : liveValue;
  const change = endValue - startValue;
  const pct = startValue !== 0 ? (change / startValue) * 100 : 0;
  return { startValue, endValue, change, pct };
}
