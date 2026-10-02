// Turns the last few days of activity into a ranked list of plain-language
// "what happened" headlines for the Home page (salary landed, big purchase,
// a holding that moved a lot, net worth swing, stale balances…).
//
// Pure functions only — all data is passed in, so it can be unit-tested and runs
// on the server without touching Supabase or the network.

import { deepLinkHref, type DeepLink } from './deepLinkUrl';

export type InsightTone = 'positive' | 'alert' | 'neutral';
export type InsightKind =
  | 'salary'
  | 'income'
  | 'big-spend'
  | 'category-spike'
  | 'mover'
  | 'net-worth'
  | 'stale'
  | 'quiet';

/** A piece of a headline. A part with an `amount` is a money value: the client formats it
 *  (so demo mode applies) and blurs it in privacy mode. `prefix` is an optional sign. */
export interface InsightPart {
  t: string;
  amount?: number;
  prefix?: string;
}

export interface Insight {
  id: string;
  kind: InsightKind;
  tone: InsightTone;
  icon: string;
  /** Headline sentence as parts (so amounts can be blurred individually). */
  parts: InsightPart[];
  /** Short supporting line under the headline. */
  detail?: string;
  /** Where clicking the insight should go (path + query), and the same target as data. */
  href?: string;
  link?: { path: string } & DeepLink;
  /** Higher = more newsworthy. Used to pick the lead headline. */
  priority: number;
  /** Coarse recency bucket shown as a label ("Today", "Yesterday", "This week"). */
  when: 'today' | 'yesterday' | 'this week';
}

export interface InsightTx {
  id: string;
  amount: number;
  description: string | null;
  payee: string | null;
  posted_at: string; // ISO timestamp; the date part is the bank's posting date
  is_transfer?: boolean | null;
  is_reimbursable?: boolean | null;
  category?: { id?: string; name: string; icon?: string | null; is_income?: boolean | null } | null;
  account?: { institution: string | null; name: string | null } | null;
}

export interface HoldingMove {
  symbol: string;
  name: string | null;
  /** 1-session change, as a fraction (0.05 = +5%). */
  pct1d: number;
  /** Approx. dollar effect of that move on the position. */
  usd1d: number;
  /** Change over the last 5 sessions, as a fraction. */
  pct5d: number | null;
  usd5d: number | null;
  /** Date of the most recent close used. */
  lastDate: string;
}

export interface InsightInput {
  /** "Today" as YYYY-MM-DD in the user's timezone. */
  todayIso: string;
  transactions: InsightTx[];
  movers: HoldingMove[];
  netWorthHistory: { snapshot_date: string; net_worth: number | string }[];
  accounts: {
    id: string;
    institution: string | null;
    name: string | null;
    account_type: string;
    balance_date: string | null;
  }[];
}

// ── helpers ───────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${dayOf(fromIso)}T12:00:00Z`);
  const b = Date.parse(`${dayOf(toIso)}T12:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

function shiftDay(iso: string, days: number): string {
  return new Date(Date.parse(`${dayOf(iso)}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function whenLabel(ageDays: number): Insight['when'] {
  if (ageDays <= 0) return 'today';
  if (ageDays === 1) return 'yesterday';
  return 'this week';
}

function dayWord(ageDays: number): string {
  if (ageDays <= 0) return 'today';
  if (ageDays === 1) return 'yesterday';
  return `${ageDays} days ago`;
}

function withLink(path: string, link: DeepLink): { href: string; link: { path: string } & DeepLink } {
  return { href: deepLinkHref(path, link), link: { path, ...link } };
}

const $ = (n: number): InsightPart => ({ t: '', amount: Math.abs(n) });
const t = (text: string): InsightPart => ({ t: text });

function merchant(tx: InsightTx): string {
  const raw = (tx.payee || tx.description || 'a merchant').replace(/\s+/g, ' ').trim();
  // Bank descriptors are SHOUTY and carry ids; title-case and trim them.
  const cleaned = raw.replace(/\b(PPD|WEB|ACH)\b.*$/i, '').replace(/#\d+.*$/, '').trim() || raw;
  const words = cleaned.split(' ').slice(0, 4).join(' ');
  return words === words.toUpperCase()
    ? words.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : words;
}

function accountName(tx: InsightTx): string {
  return tx.account?.institution || tx.account?.name || 'your account';
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Categories whose big amounts are expected, not news.
const EXPECTED_BIG = /^(rent|rent & housing|transfer|credit card payment|mortgage|taxes?)$/i;

// ── detectors ─────────────────────────────────────────────────────────────

function detectSalary(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const candidates = input.transactions
    .filter((tx) => Number(tx.amount) > 0 && !tx.is_transfer)
    .filter((tx) => {
      const text = `${tx.payee ?? ''} ${tx.description ?? ''}`;
      return /payroll|salary/i.test(text) || /salary/i.test(tx.category?.name ?? '');
    })
    .map((tx) => ({ tx, age: daysBetween(tx.posted_at, input.todayIso) }))
    .filter(({ age }) => age >= 0 && age <= 6)
    .sort((a, b) => a.age - b.age);

  const best = candidates[0];
  if (best) {
    const { tx, age } = best;
    out.push({
      id: `salary-${tx.id}`,
      kind: 'salary',
      tone: 'positive',
      icon: '🎉',
      parts: [t('You received your salary — '), $(Number(tx.amount)), t('!')],
      detail: `Deposited to ${accountName(tx)} ${dayWord(age)}`,
      ...withLink('/income', { day: dayOf(tx.posted_at), tx: tx.id }),
      priority: age <= 1 ? 100 : 72,
      when: whenLabel(age),
    });
  } else {
    // Any sizeable non-salary income in the last 3 days (refund, bonus, dividend…).
    const income = input.transactions
      .filter((tx) => Number(tx.amount) >= 500 && !tx.is_transfer && tx.category?.is_income)
      .map((tx) => ({ tx, age: daysBetween(tx.posted_at, input.todayIso) }))
      .filter(({ age }) => age >= 0 && age <= 3)
      .sort((a, b) => Number(b.tx.amount) - Number(a.tx.amount))[0];
    if (income) {
      out.push({
        id: `income-${income.tx.id}`,
        kind: 'income',
        tone: 'positive',
        icon: '💰',
        parts: [t('Money in: '), $(Number(income.tx.amount)), t(` from ${merchant(income.tx)}`)],
        detail: `${income.tx.category?.name ?? 'Income'} · ${dayWord(income.age)}`,
        ...withLink('/income', { day: dayOf(income.tx.posted_at), tx: income.tx.id }),
        priority: 66,
        when: whenLabel(income.age),
      });
    }
  }
  return out;
}

function detectBigSpend(input: InsightInput): Insight[] {
  const expenses = input.transactions.filter(
    (tx) => Number(tx.amount) < 0 && !tx.is_transfer && !tx.is_reimbursable,
  );
  // "Big" is relative to this person's normal purchase size, with a floor.
  const typical = median(expenses.map((tx) => Math.abs(Number(tx.amount))));
  const threshold = Math.max(250, typical * 6);

  const hit = expenses
    .filter((tx) => !EXPECTED_BIG.test(tx.category?.name ?? ''))
    .map((tx) => ({ tx, age: daysBetween(tx.posted_at, input.todayIso), amt: Math.abs(Number(tx.amount)) }))
    .filter(({ age, amt }) => age >= 0 && age <= 2 && amt >= threshold)
    .sort((a, b) => b.amt - a.amt)[0];
  if (!hit) return [];

  return [{
    id: `big-spend-${hit.tx.id}`,
    kind: 'big-spend',
    tone: 'alert',
    icon: '💸',
    parts: [t('Big spend '), t(dayWord(hit.age) === 'today' ? 'today: ' : `${dayWord(hit.age)}: `), $(hit.amt), t(` at ${merchant(hit.tx)}`)],
    detail: `${hit.tx.category?.name ?? 'Uncategorized'} · ${accountName(hit.tx)}`,
    ...withLink('/spending', { day: dayOf(hit.tx.posted_at), tx: hit.tx.id }),
    priority: hit.age === 0 ? 90 : 78,
    when: whenLabel(hit.age),
  }];
}

function detectCategorySpike(input: InsightInput): Insight[] {
  const WEEK = 7;
  const byCat = new Map<string, { thisWeek: number; before: number; icon: string; id?: string }>();
  for (const tx of input.transactions) {
    const amt = Number(tx.amount);
    if (amt >= 0 || tx.is_transfer || tx.is_reimbursable) continue;
    const name = tx.category?.name;
    if (!name || EXPECTED_BIG.test(name)) continue;
    const age = daysBetween(tx.posted_at, input.todayIso);
    if (age < 0 || age > 27) continue;
    const row = byCat.get(name) ?? { thisWeek: 0, before: 0, icon: tx.category?.icon || '🧾', id: tx.category?.id };
    if (age < WEEK) row.thisWeek += Math.abs(amt);
    else row.before += Math.abs(amt);
    byCat.set(name, row);
  }
  let best: { name: string; thisWeek: number; ratio: number; icon: string; id?: string } | null = null;
  for (const [name, row] of Array.from(byCat.entries())) {
    const weeklyBaseline = row.before / 3; // previous three weeks
    if (weeklyBaseline < 25 || row.thisWeek < 150) continue;
    const ratio = row.thisWeek / weeklyBaseline;
    if (ratio < 1.6) continue;
    if (!best || row.thisWeek > best.thisWeek) best = { name, thisWeek: row.thisWeek, ratio, icon: row.icon, id: row.id };
  }
  if (!best) return [];
  const up = Math.round((best.ratio - 1) * 100);
  return [{
    id: `category-${best.name}`,
    kind: 'category-spike',
    tone: 'alert',
    icon: best.icon,
    parts: [t(`${best.name} is up ${up}% this week — `), $(best.thisWeek)],
    detail: 'Compared with your average of the previous three weeks',
    ...withLink('/spending', { from: shiftDay(input.todayIso, -6), to: dayOf(input.todayIso), cat: best.id }),
    priority: 55,
    when: 'this week',
  }];
}

function detectMovers(input: InsightInput): Insight[] {
  const scored = input.movers
    .map((m) => ({ m, abs: Math.abs(m.usd1d), pct: Math.abs(m.pct1d) }))
    .filter(({ abs, pct }) => pct >= 0.03 && abs >= 150)
    .sort((a, b) => b.abs - a.abs);
  const top = scored[0];
  if (!top) return [];
  const { m } = top;
  const up = m.usd1d >= 0;
  const sessionWord = m.lastDate === input.todayIso ? 'today' : 'in the last session';
  return [{
    id: `mover-${m.symbol}`,
    kind: 'mover',
    tone: up ? 'positive' : 'alert',
    icon: up ? '📈' : '📉',
    parts: [
      t(`${m.symbol} ${up ? 'is up' : 'dropped'} ${(Math.abs(m.pct1d) * 100).toFixed(1)}% ${sessionWord} — `),
      { t: '', amount: Math.abs(m.usd1d), prefix: up ? '+' : '−' },
      t(' on your position'),
    ],
    detail: m.name ? m.name : undefined,
    ...withLink('/networth', { symbol: m.symbol }),
    priority: top.pct >= 0.05 ? 85 : 64,
    when: m.lastDate === input.todayIso ? 'today' : 'yesterday',
  }];
}

function detectNetWorth(input: InsightInput): Insight[] {
  const h = input.netWorthHistory;
  if (h.length < 2) return [];
  const latest = h[h.length - 1];
  const cutoff = Date.parse(`${dayOf(input.todayIso)}T12:00:00Z`) - 7 * DAY_MS;
  // Snapshot closest to (but not after) 7 days ago.
  let base = h[0];
  for (const s of h) {
    if (Date.parse(`${s.snapshot_date}T12:00:00Z`) <= cutoff) base = s;
  }
  if (base === latest) return [];
  const now = Number(latest.net_worth);
  const then = Number(base.net_worth);
  const delta = now - then;
  const pct = then !== 0 ? (delta / Math.abs(then)) * 100 : 0;
  if (Math.abs(delta) < Math.max(1500, Math.abs(then) * 0.006)) return [];
  const up = delta >= 0;
  return [{
    id: 'net-worth-week',
    kind: 'net-worth',
    tone: up ? 'positive' : 'neutral',
    icon: up ? '🌱' : '🌧️',
    parts: [t(`Net worth is ${up ? 'up' : 'down'} `), $(delta), t(` this week (${up ? '+' : '−'}${Math.abs(pct).toFixed(1)}%)`)],
    detail: 'Compared with a week ago',
    ...withLink('/home', { from: dayOf(base.snapshot_date), to: dayOf(input.todayIso) }),
    priority: 50,
    when: 'this week',
  }];
}

function detectStale(input: InsightInput): Insight[] {
  const now = Date.parse(`${dayOf(input.todayIso)}T12:00:00Z`);
  const stale = input.accounts
    .filter((a) => !a.id.startsWith('manual_') && a.balance_date)
    .map((a) => ({ a, days: Math.floor((now - Date.parse(a.balance_date as string)) / DAY_MS) }))
    .filter(({ days }) => days >= 3)
    .sort((x, y) => y.days - x.days);
  if (stale.length === 0) return [];
  const worst = stale[0];
  const label = worst.a.institution || worst.a.name || 'An account';
  return [{
    id: 'stale-data',
    kind: 'stale',
    tone: 'alert',
    icon: '⚠️',
    parts: [t(stale.length === 1
      ? `${label} hasn't updated in ${worst.days} days`
      : `${stale.length} accounts haven't updated in over ${worst.days >= 7 ? 'a week' : '2 days'}`)],
    detail: 'Balances may be out of date — try Sync now',
    priority: 60,
    when: 'this week',
  }];
}

// ── public API ────────────────────────────────────────────────────────────

/** All detected insights, most newsworthy first. Never empty. */
export function buildInsights(input: InsightInput): Insight[] {
  const all = [
    ...detectSalary(input),
    ...detectBigSpend(input),
    ...detectMovers(input),
    ...detectCategorySpike(input),
    ...detectNetWorth(input),
    ...detectStale(input),
  ].sort((a, b) => b.priority - a.priority);

  if (all.length === 0) {
    return [{
      id: 'quiet',
      kind: 'quiet',
      tone: 'neutral',
      icon: '✨',
      parts: [t('All quiet — nothing unusual in the last few days')],
      detail: 'Salary, big purchases and market moves will show up here',
      priority: 0,
      when: 'this week',
    }];
  }
  return all;
}
