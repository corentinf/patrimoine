import { format, parseISO, subDays, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';

/**
 * Format a number as USD currency.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format with cents for detail views.
 */
export function formatCurrencyPrecise(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date for display.
 */
export function formatDate(date: Date | string): string {
  // Slice to date-only before parsing so timezone offsets in the string don't
  // shift the calendar date (e.g. "2026-06-19T00:30:00+02:00" → Jun 19, not Jun 18).
  const d = typeof date === 'string' ? parseISO(date.slice(0, 10)) : date;
  return format(d, 'MMM d, yyyy');
}

/**
 * Format a short date.
 */
export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date.slice(0, 10)) : date;
  return format(d, 'MMM d');
}

/**
 * Get color for positive/negative amounts.
 */
export function amountColor(amount: number): string {
  if (amount > 0) return 'text-accent-green';
  if (amount < 0) return 'text-accent-red';
  return 'text-ink-400';
}

/**
 * Account type display info.
 */
export const accountTypeConfig: Record<string, { label: string; icon: string }> = {
  checking:   { label: 'Checking',   icon: '🏦' },
  savings:    { label: 'Savings',    icon: '🐖' },
  credit:     { label: 'Credit',     icon: '💳' },
  investment: { label: 'Investment', icon: '📈' },
};

/**
 * Get a unix timestamp for N days ago.
 */
export function daysAgoTimestamp(days: number): number {
  return Math.floor(subDays(new Date(), days).getTime() / 1000);
}

export interface GroupedCategory<T extends { id: string; name: string; parent_id: string | null }> {
  parent: T;
  children: T[];
}

/** Returns top-level categories sorted A→Z, each with their children sorted A→Z. */
export function groupAndSortCategories<T extends { id: string; name: string; parent_id: string | null }>(cats: T[]): GroupedCategory<T>[] {
  const childrenByParent = new Map<string, T[]>();
  const topLevel: T[] = [];
  for (const c of cats) {
    if (c.parent_id) {
      if (!childrenByParent.has(c.parent_id)) childrenByParent.set(c.parent_id, []);
      childrenByParent.get(c.parent_id)!.push(c);
    } else {
      topLevel.push(c);
    }
  }
  topLevel.sort((a, b) => a.name.localeCompare(b.name));
  return topLevel.map((parent) => {
    const children = (childrenByParent.get(parent.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    return { parent, children };
  });
}

/**
 * Filters grouped categories by a search query, matching against parent and child names.
 * If a parent matches, all of its children are kept; otherwise only matching children are kept.
 */
export function filterCategoryGroups<T extends { id: string; name: string; parent_id: string | null }>(
  groups: GroupedCategory<T>[],
  query: string,
): GroupedCategory<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  const result: GroupedCategory<T>[] = [];
  for (const { parent, children } of groups) {
    const parentMatches = parent.name.toLowerCase().includes(q);
    const matchedChildren = parentMatches ? children : children.filter((c) => c.name.toLowerCase().includes(q));
    if (parentMatches || matchedChildren.length > 0) {
      result.push({ parent, children: matchedChildren });
    }
  }
  return result;
}
