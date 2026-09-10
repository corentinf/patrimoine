import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { MILESTONE_TARGETS, type ScenarioSet } from '@/app/lib/projection';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

// GET only ever reads the cached row — this is what runs on every Home page
// load, so it must never call the model.
export async function GET() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('networth_projections')
    .select('id, generated_at, model, scenarios')
    .order('generated_at', { ascending: false })
    .limit(1);

  return NextResponse.json({ projection: data?.[0] ?? null });
}

async function buildContext(supabase: Awaited<ReturnType<typeof getSupabase>>) {
  const [{ data: snapshots }, { data: accounts }, { data: settings }, { data: holdings }, { data: recentTxns }] =
    await Promise.all([
      supabase
        .from('networth_snapshots')
        .select('snapshot_date, net_worth, total_assets, total_liabilities')
        .order('snapshot_date', { ascending: true })
        .limit(400),
      supabase
        .from('accounts')
        .select('account_type, balance')
        .eq('is_hidden', false),
      supabase.from('user_settings').select('monthly_income').limit(1).maybeSingle(),
      supabase.from('holdings').select('market_value, cost_basis'),
      supabase
        .from('transactions')
        .select('amount, posted_at, is_transfer')
        .lt('amount', 0)
        .eq('is_transfer', false)
        .gte('posted_at', new Date(Date.now() - 183 * 86_400_000).toISOString()),
    ]);

  const rows = snapshots ?? [];
  const byMonth = new Map<string, (typeof rows)[number]>();
  for (const s of rows) byMonth.set(s.snapshot_date.slice(0, 7), s);
  const monthly = Array.from(byMonth.values()).slice(-13);

  const avgDelta = (field: 'net_worth' | 'total_assets' | 'total_liabilities') => {
    if (monthly.length < 2) return null;
    const deltas: number[] = [];
    for (let i = 1; i < monthly.length; i++) {
      deltas.push(Number(monthly[i][field]) - Number(monthly[i - 1][field]));
    }
    return deltas.reduce((s, v) => s + v, 0) / deltas.length;
  };
  const baselineNetWorthDelta = avgDelta('net_worth');
  const baselineAssetsDelta = avgDelta('total_assets');
  const baselineLiabilitiesDelta = avgDelta('total_liabilities');

  const acctRows = accounts ?? [];
  const totalAssets = acctRows.filter((a) => a.account_type !== 'credit').reduce((s, a) => s + Number(a.balance), 0);
  const totalLiabilities = acctRows.filter((a) => a.account_type === 'credit').reduce((s, a) => s + Math.abs(Number(a.balance)), 0);
  const currentNetWorth = totalAssets - totalLiabilities;

  const monthlyIncome = Number(settings?.monthly_income ?? 0);

  // Exclude one-off large purchases (>$500) from the spending average — same
  // convention as the Spending page's end-of-month pace calculation, so this
  // reflects recurring/typical spend rather than being skewed by e.g. a
  // once-off furniture purchase.
  const spendTxns = (recentTxns ?? []).filter((t) => Math.abs(Number(t.amount)) <= 500);
  const monthsOfData = Math.max(1, monthly.length > 0 ? Math.min(6, monthly.length) : 6);
  const avgMonthlySpending = spendTxns.reduce((s, t) => s + Math.abs(Number(t.amount)), 0) / 6;

  const holdingRows = holdings ?? [];
  const totalHoldingsValue = holdingRows.reduce((s, h) => s + Number(h.market_value || 0), 0);
  const totalCostBasis = holdingRows.reduce((s, h) => s + Number(h.cost_basis || 0), 0);
  const holdingsGainPct = totalCostBasis > 0 ? ((totalHoldingsValue - totalCostBasis) / totalCostBasis) * 100 : null;

  const unreachedMilestones = MILESTONE_TARGETS.filter((t) => t > currentNetWorth);

  const trendLines = monthly
    .map((s) => `${s.snapshot_date.slice(0, 7)}: net worth $${Number(s.net_worth).toFixed(0)}, assets $${Number(s.total_assets).toFixed(0)}, liabilities $${Number(s.total_liabilities).toFixed(0)}`)
    .join('\n');

  const context = `Monthly net worth history (oldest to newest, one point per month):
${trendLines}

Current: net worth $${currentNetWorth.toFixed(0)}, assets $${totalAssets.toFixed(0)}, liabilities $${totalLiabilities.toFixed(0)}
Naive recent trend baseline (avg of last ${monthly.length} months' deltas): net worth ${baselineNetWorthDelta !== null ? `$${baselineNetWorthDelta.toFixed(0)}/mo` : 'unknown'}, assets ${baselineAssetsDelta !== null ? `$${baselineAssetsDelta.toFixed(0)}/mo` : 'unknown'}, liabilities ${baselineLiabilitiesDelta !== null ? `$${baselineLiabilitiesDelta.toFixed(0)}/mo` : 'unknown'}

Monthly income (manual figure): $${monthlyIncome.toFixed(0)}
Average monthly spending, last 6 months, excluding transfers and one-off purchases over $500: $${avgMonthlySpending.toFixed(0)}
Implied monthly savings: $${(monthlyIncome - avgMonthlySpending).toFixed(0)}

Investment holdings: $${totalHoldingsValue.toFixed(0)} total value, cost basis $${totalCostBasis.toFixed(0)}${holdingsGainPct !== null ? ` (${holdingsGainPct >= 0 ? '+' : ''}${holdingsGainPct.toFixed(1)}% gain)` : ''}

Unreached net worth milestones: ${unreachedMilestones.map((t) => `$${t.toLocaleString()}`).join(', ') || 'none'}`;

  return context;
}

// POST is the explicit "Regenerate" action — the only path that ever spends
// tokens. Gathers real income/spending/growth data, asks Claude for three
// grounded scenarios, stores the result, and returns it.
export async function POST() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const context = await buildContext(supabase);

  const scenarioShape = `{
  "optimistic": { "monthlyNetWorthDelta": number, "monthlyAssetsDelta": number, "monthlyLiabilitiesDelta": number, "summary": string, "recommendations": [string, ...] },
  "regular": { ... same shape ... },
  "pessimistic": { ... same shape ... }
}`;

  const { text } = await generateText({
    model: anthropic('claude-sonnet-5'),
    prompt: `You are a careful personal financial planner analyzing someone's real net worth trend, income, spending, and investment data to produce three grounded projections. Return ONLY a valid JSON object matching this exact shape, no other text:

${scenarioShape}

Guidance for each scenario's "monthlyNetWorthDelta"/"monthlyAssetsDelta"/"monthlyLiabilitiesDelta" (dollars per month, liabilities delta is usually negative or near zero if debt is being paid down):
- "regular": a continuation of the real recent trend shown below — don't just copy the naive baseline, reason about whether it's sustainable given income vs. spending and holdings performance.
- "optimistic": a grounded, achievable stretch (e.g. a higher savings rate, continued or slightly better market returns) — not a fantasy number. The "recommendations" must be concrete steps that would actually move the regular case toward this one (e.g. specific spending categories to trim, a target savings rate, contribution increases).
- "pessimistic": a grounded downside (e.g. spending creeping up, a market pullback, an income disruption) — the "recommendations" here should be what to watch for or do to avoid/mitigate it.

Each "summary" must be 1-2 sentences that cite specific numbers from the data below (not generic advice). Each "recommendations" array must have 2-4 short, specific, actionable items.

Real financial data:
${context}

Respond with only the JSON object, nothing else.`,
  });

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: 'Could not parse projection response' }, { status: 502 });
  }

  let scenarios: ScenarioSet;
  try {
    scenarios = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ error: 'Could not parse projection response' }, { status: 502 });
  }

  const { data: inserted, error } = await supabase
    .from('networth_projections')
    .insert({ user_id: user.id, model: 'claude-sonnet-5', scenarios })
    .select('id, generated_at, model, scenarios')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ projection: inserted });
}
