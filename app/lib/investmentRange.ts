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
