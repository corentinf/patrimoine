// Spending forecast for the rest of the current month. Two parts:
//
//   1. Subscriptions — recurring charges (same detection as the Subscriptions tab) whose next
//      charge is expected before month end, on the day it's expected.
//   2. Usual spending — for each category, what's still expected this month: your budget if you
//      set one, otherwise the median of the previous three full months, minus what you've already
//      spent. Spread over the remaining days with your own weekday pattern (weekends differ).
//
// Pure functions: everything is passed in, nothing is fetched. Amounts are YOUR share (split
// charges already reduced), positive numbers.

import { detectSubscriptions, subscriptionKey, type SubscriptionTx } from './subscriptions';

export interface SpendTx {
  /** Bank posting date, YYYY-MM-DD */
  date: string;
  /** Positive, your share of the charge */
  amount: number;
  /** Parent category id, or '__uncategorized__' */
  categoryKey: string;
  categoryName: string;
  categoryIcon?: string | null;
  payee: string | null;
  description: string;
}

export interface ForecastItem {
  name: string;
  amount: number;
  kind: 'subscription' | 'usual';
  categoryKey: string;
}

export interface ForecastDay {
  date: string;
  subscriptions: number;
  usual: number;
  total: number;
  items: ForecastItem[];
}

export interface Forecast {
  days: ForecastDay[];
  /** Still to come this month */
  subscriptionsRemaining: number;
  usualRemaining: number;
  remainingTotal: number;
  /** Already spent this month (all spending, subscriptions included) */
  spentSoFar: number;
  projectedMonthTotal: number;
  upcomingSubscriptions: { date: string; name: string; amount: number; categoryKey: string }[];
  byCategory: Record<string, { name: string; icon: string | null; subscriptions: number; usual: number }>;
  /** False when there isn't enough history for the "usual spending" part (subscriptions still shown). */
  hasUsualHistory: boolean;
}

export interface ForecastInput {
  spend: SpendTx[];
  /** "Today" as YYYY-MM-DD in the user's timezone */
  today: string;
  /** Last day of the month being forecast, YYYY-MM-DD */
  monthEnd: string;
  /** Monthly budget per category key */
  budgets?: Record<string, number>;
  /** Subscription merchant keys the user dismissed ("not a subscription") */
  dismissed?: Set<string>;
}

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(at(d) + n * DAY);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function previousMonths(today: string, count: number): string[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function forecastSpending({ spend, today, monthEnd, budgets = {}, dismissed = new Set() }: ForecastInput): Forecast | null {
  const month = today.slice(0, 7);
  if (monthEnd <= today) return null; // nothing left to forecast

  const remainingDates: string[] = [];
  for (let d = addDays(today, 1); d <= monthEnd; d = addDays(d, 1)) remainingDates.push(d);
  if (remainingDates.length === 0) return null;

  // ── 1. Subscriptions ──
  const asTx: SubscriptionTx[] = spend.map((t) => ({
    amount: -t.amount, payee: t.payee, description: t.description, posted_at: t.date, is_transfer: false, category: null,
  }));
  const detected = detectSubscriptions(asTx).filter((s) => !dismissed.has(s.merchantKey));
  const subKeys = new Set(detected.map((s) => s.merchantKey));
  const isSubTx = (t: SpendTx) => subKeys.has(subscriptionKey((t.payee || t.description || '').trim()));

  const upcoming: Forecast['upcomingSubscriptions'] = [];
  for (const s of detected) {
    const last = s.lastChargeDate.slice(0, 10);
    // Monthly cadence (≈26–35 days): bills land on the same day of the month, so predict that day
    // rather than "last + 30.4 days", which drifts. Anything else: last charge + the usual gap.
    let next: string;
    if (s.avgGapDays >= 26 && s.avgGapDays <= 35) {
      const y = Number(last.slice(0, 4));
      const m = Number(last.slice(5, 7));
      const dom = Number(last.slice(8, 10));
      const daysInNext = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      next = iso(Date.UTC(y, m, Math.min(dom, daysInNext), 12));
    } else {
      next = addDays(last, Math.max(20, Math.round(s.avgGapDays)));
    }
    if (next <= today || next > monthEnd) continue; // already charged this cycle, or due next month
    const latest = [...spend].reverse().find((t) => subscriptionKey((t.payee || t.description || '').trim()) === s.merchantKey);
    upcoming.push({ date: next, name: s.merchantName, amount: s.estimatedMonthlyCost, categoryKey: latest?.categoryKey ?? '__uncategorized__' });
  }

  // ── 2. Usual spending, per category ──
  const hist = previousMonths(today, 3);
  const monthsWithData = hist.filter((m) => spend.some((t) => t.date.slice(0, 7) === m)).length;
  const hasUsualHistory = monthsWithData >= 2;

  const cats = new Map<string, { name: string; icon: string | null; spentAll: number; spentNonSub: number; monthly: Record<string, number> }>();
  for (const t of spend) {
    const m = t.date.slice(0, 7);
    if (m !== month && !hist.includes(m)) continue;
    const c = cats.get(t.categoryKey) ?? { name: t.categoryName, icon: t.categoryIcon ?? null, spentAll: 0, spentNonSub: 0, monthly: {} };
    if (m === month) {
      if (t.date <= today) {
        c.spentAll += t.amount;
        if (!isSubTx(t)) c.spentNonSub += t.amount;
      }
    } else if (!isSubTx(t)) {
      c.monthly[m] = (c.monthly[m] ?? 0) + t.amount;
    }
    cats.set(t.categoryKey, c);
  }

  const upcomingByCat = new Map<string, number>();
  for (const u of upcoming) upcomingByCat.set(u.categoryKey, (upcomingByCat.get(u.categoryKey) ?? 0) + u.amount);

  const usualRemaining = new Map<string, { name: string; icon: string | null; amount: number }>();
  if (hasUsualHistory) {
    cats.forEach((c, key) => {
      const budget = budgets[key];
      let remaining: number;
      if (budget && budget > 0) {
        // A budget covers everything in the category, subscriptions included.
        remaining = budget - c.spentAll - (upcomingByCat.get(key) ?? 0);
      } else {
        const baseline = median(hist.map((m) => c.monthly[m] ?? 0));
        if (baseline < 5) return;
        remaining = baseline - c.spentNonSub;
      }
      if (remaining >= 1) usualRemaining.set(key, { name: c.name, icon: c.icon, amount: remaining });
    });
  }

  // Your weekday rhythm over the last 12 weeks (non-subscription spending).
  const weekdayTotals = Array(7).fill(0);
  const since = addDays(today, -84);
  for (const t of spend) {
    if (t.date <= since || t.date > today || isSubTx(t)) continue;
    weekdayTotals[new Date(at(t.date)).getUTCDay()] += t.amount;
  }
  const meanDay = weekdayTotals.reduce((a, b) => a + b, 0) / 7;
  const weights = weekdayTotals.map((v) => (meanDay > 0 ? 0.5 * v + 0.5 * meanDay : 1)); // smoothed toward even
  const weightOf = (d: string) => weights[new Date(at(d)).getUTCDay()];
  const weightSum = remainingDates.reduce((s, d) => s + weightOf(d), 0) || remainingDates.length;

  // ── Build the days ──
  const days: ForecastDay[] = remainingDates.map((date) => ({ date, subscriptions: 0, usual: 0, total: 0, items: [] }));
  const dayIndex = new Map(days.map((d, i) => [d.date, i]));

  for (const u of upcoming) {
    const d = days[dayIndex.get(u.date)!];
    d.subscriptions += u.amount;
    d.items.push({ name: u.name, amount: u.amount, kind: 'subscription', categoryKey: u.categoryKey });
  }
  usualRemaining.forEach((u, key) => {
    for (const d of days) {
      const share = (u.amount * weightOf(d.date)) / weightSum;
      d.usual += share;
      d.items.push({ name: u.name, amount: share, kind: 'usual', categoryKey: key });
    }
  });
  for (const d of days) {
    d.total = d.subscriptions + d.usual;
    // keep tooltips short: the few biggest items per day
    d.items = d.items.sort((a, b) => b.amount - a.amount).slice(0, 4);
  }

  const byCategory: Forecast['byCategory'] = {};
  for (const u of upcoming) {
    const c = byCategory[u.categoryKey] ?? { name: cats.get(u.categoryKey)?.name ?? 'Subscriptions', icon: cats.get(u.categoryKey)?.icon ?? null, subscriptions: 0, usual: 0 };
    c.subscriptions += u.amount;
    byCategory[u.categoryKey] = c;
  }
  usualRemaining.forEach((u, key) => {
    const c = byCategory[key] ?? { name: u.name, icon: u.icon, subscriptions: 0, usual: 0 };
    c.usual += u.amount;
    byCategory[key] = c;
  });

  const subscriptionsRemaining = upcoming.reduce((s, u) => s + u.amount, 0);
  const usualTotal = Array.from(usualRemaining.values()).reduce((s, u) => s + u.amount, 0);
  const spentSoFar = Array.from(cats.values()).reduce((s, c) => s + c.spentAll, 0);

  return {
    days,
    subscriptionsRemaining,
    usualRemaining: usualTotal,
    remainingTotal: subscriptionsRemaining + usualTotal,
    spentSoFar,
    projectedMonthTotal: spentSoFar + subscriptionsRemaining + usualTotal,
    upcomingSubscriptions: upcoming.sort((a, b) => a.date.localeCompare(b.date)),
    byCategory,
    hasUsualHistory,
  };
}
