import { format, subDays, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';

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
  return format(new Date(date), 'MMM d, yyyy');
}

/**
 * Format a short date.
 */
export function formatShortDate(date: Date | string): string {
  return format(new Date(date), 'MMM d');
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
