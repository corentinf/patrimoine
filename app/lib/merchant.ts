// Merchant normalisation + the rule-based "smart insights" for the merchant drawer.
//
// Bank descriptors are messy: "TRADER JOE'S #123 SAN FRANCISCO CA", "Trader Joe's #456 Oak",
// "SQ *BLUE BOTTLE COFFEE", "Amazon.com*2K3LL LLC". normalizeMerchant() collapses those to a
// stable key ("trader joes", "blue bottle coffee") so every visit to the same merchant matches.
//
// Pure functions only (no 'use client'): used by the API route on the server and by the UI.

const PAYMENT_PREFIX =
  /^(sq\s*\*|tst\s*\*|sp\s*\*|pp\s*\*|paypal\s*\*|pos\s+(debit|purchase)\s*[-:]?\s*|purchase\s+(authorized\s+on\s+\d{1,2}\/\d{1,2}\s+)?|debit\s+card\s+purchase\s*[-:]?\s*|checkcard\s+\d*\s*|recurring\s+payment\s*[-:]?\s*)/i;

const COMPANY_SUFFIX = new Set([
  'llc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'lp', 'llp', 'plc',
]);

const US_STATES = new Set([
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me',
  'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa',
  'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc',
]);

// Cities that show up as a trailing location in card descriptors (multi-word ones first).
const CITY_SUFFIXES = [
  'south san francisco', 'san francisco', 'palo alto', 'mountain view', 'san jose', 'san mateo', 'daly city',
  'new york', 'los angeles', 'sunnyvale', 'oakland', 'berkeley', 'brooklyn', 'chicago', 'seattle', 'boston',
  'austin', 'portland', 'denver', 'nyc', 'sf', 'oak',
].map((c) => c.split(' '));

/** Cut at a store number ("#123", "store 45") — everything after it is a branch/location. */
function cutAtStoreMarker(s: string): string {
  return s.split(/\s*#\s*\d|\bstore\s*#?\s*\d|\bunit\s*#?\s*\d|\bno\.?\s*\d/i)[0];
}

/** Original-case descriptor with the noise (prefixes, store numbers, ids, locations, suffixes) removed. */
function stripNoise(raw: string): string {
  let s = raw.replace(/[’`´]/g, "'").trim();
  s = s.replace(PAYMENT_PREFIX, '');
  s = cutAtStoreMarker(s);
  s = s.replace(/\*\s*[a-z0-9]{3,}.*$/i, ''); // "AMZN Mktp US*2K3LL"  ->  "AMZN Mktp US"
  s = s.replace(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, ''); // phone numbers
  s = s.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ''); // dates
  s = s.replace(/\b\d{3,}\b/g, ''); // long digit runs (store/ref numbers)
  let tokens = s.split(/\s+/).filter(Boolean);

  // Trailing state code ("... CA"), then a trailing known city ("... SAN FRANCISCO").
  if (tokens.length > 1 && US_STATES.has(tokens[tokens.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) {
    tokens = tokens.slice(0, -1);
  }
  for (const city of CITY_SUFFIXES) {
    if (tokens.length <= city.length) continue;
    const tail = tokens.slice(-city.length).map((t) => t.toLowerCase().replace(/[^a-z]/g, ''));
    if (tail.every((t, i) => t === city[i])) {
      tokens = tokens.slice(0, -city.length);
      break;
    }
  }
  // Company suffixes ("LLC", "Inc.") — only trailing ones.
  while (tokens.length > 1 && COMPANY_SUFFIX.has(tokens[tokens.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) {
    tokens = tokens.slice(0, -1);
  }
  return tokens.join(' ').replace(/[\s\-–,.]+$/g, '').trim();
}

/** Stable lowercase key: "Trader Joe's #123 SF" and "TRADER JOES #456 OAK" both -> "trader joes". */
export function normalizeMerchant(raw: string | null | undefined): string {
  const base = (raw ?? '').trim();
  if (!base) return '';
  const key = stripNoise(base)
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // If stripping removed everything (e.g. a descriptor that is only a number), fall back.
  return key || base.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Readable name for headers: noise removed, ALL-CAPS / all-lower descriptors title-cased. */
export function merchantDisplayName(raw: string | null | undefined): string {
  const cleaned = stripNoise((raw ?? '').trim()) || (raw ?? '').trim();
  if (!cleaned) return 'Unknown merchant';
  const letters = cleaned.replace(/[^A-Za-z]/g, '');
  const needsCase = letters === letters.toUpperCase() || letters === letters.toLowerCase();
  if (!needsCase) return cleaned;
  return cleaned
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_m, pre, ch) => pre + ch.toUpperCase());
}

/** Substring to use as an auto-categorisation rule: everything before the store number, lower-cased
 *  (rules match with a case-insensitive "contains", so this catches every branch). */
export function rulePatternFor(raw: string): string {
  return cutAtStoreMarker(raw.replace(/[’`´]/g, "'")).toLowerCase().trim();
}

// ── Smart insights ───────────────────────────────────────────────────────────

export interface MerchantStatsForInsights {
  /** YYYY-MM-DD of every outflow, with its personal amount. */
  visits: { date: string; amount: number }[];
  todayIso: string;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const prettyDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/**
 * Up to two short, rule-based observations about this merchant (no AI):
 *   • visited more often this month than usual
 *   • this month's spend well above the monthly average
 *   • the most expensive visit
 *   • a long gap since the last visit
 */
export function buildMerchantInsights({ visits, todayIso }: MerchantStatsForInsights): string[] {
  if (visits.length === 0) return [];
  const sorted = [...visits].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0].date;
  const last = sorted[sorted.length - 1].date;
  const month = todayIso.slice(0, 7);
  const monthsActive = Math.max(1, (Number(month.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + (Number(month.slice(5, 7)) - Number(first.slice(5, 7))) + 1);

  const thisMonth = sorted.filter((v) => v.date.slice(0, 7) === month);
  const thisMonthSpend = thisMonth.reduce((s, v) => s + v.amount, 0);
  // Baseline = the PAST months only, so a spike this month isn't diluted by itself.
  const pastMonths = Math.max(1, monthsActive - 1);
  const pastTotal = sorted.reduce((s, v) => s + v.amount, 0) - thisMonthSpend;
  const avgMonthlySpend = pastTotal / pastMonths;
  const avgMonthlyVisits = (sorted.length - thisMonth.length) / pastMonths;

  const found: { priority: number; text: string }[] = [];

  if (monthsActive >= 3 && thisMonth.length >= 2 && thisMonth.length >= avgMonthlyVisits * 1.4) {
    found.push({ priority: 4, text: `Visited ${thisMonth.length}× this month vs your average of ${avgMonthlyVisits.toFixed(1)}×` });
  }
  if (monthsActive >= 3 && avgMonthlySpend > 0 && thisMonthSpend >= avgMonthlySpend * 1.25) {
    const pct = Math.round((thisMonthSpend / avgMonthlySpend - 1) * 100);
    found.push({ priority: 3, text: `This month's spend is ${pct}% above your average` });
  }
  if (sorted.length >= 3) {
    const big = sorted.reduce((m, v) => (v.amount > m.amount ? v : m), sorted[0]);
    found.push({ priority: 2, text: `Your most expensive visit was ${money(big.amount)} on ${prettyDate(big.date)}` });
  }
  if (sorted.length >= 4) {
    const usualGap = daysBetween(first, last) / (sorted.length - 1);
    const since = daysBetween(last, todayIso);
    if (usualGap > 0 && since > usualGap * 2 && since >= 14) {
      found.push({ priority: 5, text: `You haven't visited in ${since} days (you usually go every ${Math.max(1, Math.round(usualGap))})` });
    }
  }
  return found.sort((a, b) => b.priority - a.priority).slice(0, 2).map((f) => f.text);
}
