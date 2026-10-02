// Pure helpers for Home-headline deep links. Deliberately NOT a 'use client' module: the headline
// logic (insights.ts) runs on the server and builds these URLs, and server code cannot call
// functions that live in a client module. The React hooks that apply a link are in deepLink.ts.

export interface DeepLink {
  /** A single day to highlight (YYYY-MM-DD). Pins that bar and filters to the day. */
  day?: string;
  /** Explicit date range to show (YYYY-MM-DD), e.g. "the last 7 days". */
  from?: string;
  to?: string;
  /** Category id to filter by. */
  cat?: string;
  /** Transaction id to scroll to and flash. */
  tx?: string;
  /** Holding symbol to scroll to and flash. */
  symbol?: string;
}

const KEYS: (keyof DeepLink)[] = ['day', 'from', 'to', 'cat', 'tx', 'symbol'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function deepLinkHref(path: string, link: DeepLink): string {
  const q = new URLSearchParams();
  for (const k of KEYS) {
    const v = link[k];
    if (v) q.set(k, v);
  }
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

export function readDeepLink(search: string): DeepLink | null {
  const q = new URLSearchParams(search);
  const link: DeepLink = {};
  for (const k of KEYS) {
    const v = q.get(k);
    if (!v) continue;
    // Dates must be real ISO days; ids/symbols are only ever used as lookup keys.
    if ((k === 'day' || k === 'from' || k === 'to') && !ISO_DAY.test(v)) continue;
    link[k] = v;
  }
  return Object.keys(link).length ? link : null;
}

/** First/last day of the month containing `day`, with the end capped at `today`. */
export function monthAround(day: string, today: string): { from: string; to: string } {
  const [y, m] = day.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${pad(m)}-${pad(lastDay)}`;
  return { from: `${y}-${pad(m)}-01`, to: to > today ? today : to };
}
