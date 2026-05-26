import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

function buildPortfolioContext(holdings: any[]) {
  const totalValue = holdings.reduce((s, h) => s + Number(h.market_value || 0), 0);
  const totalCost = holdings.reduce((s, h) => s + Number(h.cost_basis || 0), 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  const rows = [...holdings]
    .sort((a, b) => Number(b.market_value || 0) - Number(a.market_value || 0))
    .map((h) => {
      const mv = Number(h.market_value || 0);
      const cost = Number(h.cost_basis || 0);
      const gain = mv - cost;
      const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
      const pct = totalValue > 0 ? (mv / totalValue) * 100 : 0;
      const sym = h.symbol || h.description || 'Unknown';
      const desc = h.description || '';
      return `${sym} | ${desc} | $${mv.toFixed(0)} (${pct.toFixed(1)}%) | gain: ${gain >= 0 ? '+' : ''}$${gain.toFixed(0)} (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)`;
    })
    .join('\n');

  return `Total portfolio: $${totalValue.toFixed(0)} | Cost basis: $${totalCost.toFixed(0)} | Total gain: ${totalGain >= 0 ? '+' : ''}$${totalGain.toFixed(0)} (${totalGainPct >= 0 ? '+' : ''}${totalGainPct.toFixed(1)}%)

Holdings (symbol | description | value (% of portfolio) | gain):
${rows}`;
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: holdings } = await supabase
    .from('holdings')
    .select('symbol, description, shares, cost_basis, market_value')
    .order('market_value', { ascending: false });

  if (!holdings?.length) return NextResponse.json({ insights: [] });

  const context = buildPortfolioContext(holdings);

  const { text } = await generateText({
    model: anthropic('claude-haiku-4.5'),
    prompt: `You are analyzing an investment portfolio. Return ONLY a valid JSON array with exactly 4 insight objects and no other text.

Each object has:
- "title": concise title (3-5 words)
- "body": 2-3 sentences with specific numbers from the portfolio. Be direct and actionable.
- "severity": one of "warning", "info", "positive", "tip"

Cover exactly these four topics in order:
1. Concentration risk — which positions dominate and any single-stock risk
2. ETF overlap or redundancy — identify index funds that track similar benchmarks
3. Top performer context — comment on the biggest winner and whether it has grown beyond a reasonable allocation
4. One actionable rebalancing or tax-efficiency suggestion

Portfolio data:
${context}

Respond with only the JSON array, nothing else.`,
  });

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return NextResponse.json({ insights: [] });

  try {
    const insights = JSON.parse(match[0]);
    return NextResponse.json({ insights });
  } catch {
    return NextResponse.json({ insights: [] });
  }
}
