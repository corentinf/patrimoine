// Historical daily close prices, used to reconstruct per-holding value over time
// (close × current shares). Source: Yahoo Finance chart API (no key required).
//
// Note: Stooq was evaluated as a primary source but is blocked from server
// networks (returns an HTML challenge page), so Yahoo is used directly.
// Symbols with no data (e.g. crypto tickers that need a "-USD" suffix, or
// cash/currency placeholders) resolve to an empty series and render as "—".

export interface Close {
  date: string; // YYYY-MM-DD
  close: number;
}

const RANGE = '1y';
const CONCURRENCY = 8;

export async function getDailyCloses(symbols: string[]): Promise<Record<string, Close[]>> {
  const unique = Array.from(new Set(symbols.filter(Boolean)));
  const out: Record<string, Close[]> = {};

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((sym) => fetchYahoo(sym)));
    batch.forEach((sym, j) => {
      out[sym] = results[j];
    });
  }

  return out;
}

async function fetchYahoo(symbol: string): Promise<Close[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${RANGE}&interval=1d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      // Prices change at most once a day; cache to avoid hammering Yahoo.
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];

    const series: Close[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i];
      if (c == null) continue; // holidays / not-yet-posted mutual fund NAVs
      series.push({
        date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
        close: c,
      });
    }
    return series;
  } catch {
    return [];
  }
}
