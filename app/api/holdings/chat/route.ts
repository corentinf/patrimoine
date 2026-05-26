import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText, convertToModelMessages } from 'ai';

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
      return `- ${sym} (${h.description || ''}): $${mv.toFixed(0)} | ${pct.toFixed(1)}% of portfolio | ${gain >= 0 ? '+' : ''}$${gain.toFixed(0)} gain (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)`;
    })
    .join('\n');

  return `Portfolio total: $${totalValue.toFixed(0)} | Cost basis: $${totalCost.toFixed(0)} | Total gain: ${totalGain >= 0 ? '+' : ''}$${totalGain.toFixed(0)} (${totalGainPct >= 0 ? '+' : ''}${totalGainPct.toFixed(1)}%)

${rows}`;
}

export async function POST(req: NextRequest) {
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
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { messages } = await req.json();

  const { data: holdings } = await supabase
    .from('holdings')
    .select('symbol, description, shares, cost_basis, market_value')
    .order('market_value', { ascending: false });

  const context = holdings?.length ? buildPortfolioContext(holdings) : 'No holdings data available.';

  const result = streamText({
    model: anthropic('claude-haiku-4.5'),
    system: `You are a portfolio advisor embedded in the user's investment tracking app. Answer questions about their specific holdings with precise numbers. Be concise (2–4 sentences unless detail is requested), direct, and actionable. Do not use markdown headers in short answers.

## Their Investment Portfolio
${context}`,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
