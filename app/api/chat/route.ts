import { anthropic } from '@ai-sdk/anthropic';
import { streamText, convertToModelMessages } from 'ai';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

  // Fetch financial context
  const [accountsRes, txRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('name, institution, account_type, balance')
      .eq('user_id', user.id)
      .eq('is_hidden', false),
    supabase
      .from('transactions')
      .select('amount, category:categories(name, is_income), posted_at')
      .eq('user_id', user.id)
      .gte('posted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('posted_at', { ascending: false })
      .limit(200),
  ]);

  const accounts = accountsRes.data ?? [];
  const transactions = txRes.data ?? [];

  // Summarize accounts
  const totalAssets = accounts
    .filter((a) => a.account_type !== 'credit')
    .reduce((s, a) => s + Number(a.balance), 0);
  const totalLiabilities = accounts
    .filter((a) => a.account_type === 'credit')
    .reduce((s, a) => s + Math.abs(Number(a.balance)), 0);

  const accountSummary = accounts
    .map((a) => `- ${a.institution} ${a.name} (${a.account_type}): $${Number(a.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
    .join('\n');

  // Summarize spending by category (last 30 days)
  const spending: Record<string, number> = {};
  let totalIncome = 0;
  let totalSpending = 0;
  for (const tx of transactions) {
    const cat = tx.category as unknown as { name: string; is_income: boolean } | null;
    const amt = Math.abs(Number(tx.amount));
    if (cat?.is_income) {
      totalIncome += amt;
    } else {
      const key = cat?.name ?? 'Uncategorized';
      spending[key] = (spending[key] ?? 0) + amt;
      totalSpending += amt;
    }
  }
  const spendingSummary = Object.entries(spending)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, amt]) => `- ${cat}: $${amt.toFixed(2)}`)
    .join('\n');

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const systemPrompt = `You are a personal finance advisor embedded in the user's net worth and spending tracker app called "Patrimoine". Today is ${today}.

You have access to the user's real financial data. Use it to give specific, actionable advice. Be concise, friendly, and direct — this is a quick-access chat, not a report. Use dollar amounts from their actual data when relevant.

## Their Accounts (net worth: $${(totalAssets - totalLiabilities).toLocaleString('en-US', { minimumFractionDigits: 2 })})
Total assets: $${totalAssets.toLocaleString('en-US', { minimumFractionDigits: 2 })}
Total liabilities: $${totalLiabilities.toLocaleString('en-US', { minimumFractionDigits: 2 })}

${accountSummary || 'No accounts connected yet.'}

## Last 30 Days
Income: $${totalIncome.toFixed(2)}
Spending: $${totalSpending.toFixed(2)}
Net: $${(totalIncome - totalSpending).toFixed(2)}

Spending by category:
${spendingSummary || 'No spending data yet.'}

## How to respond
- Keep answers short (2–4 sentences unless they ask for detail)
- Be specific to their numbers, not generic
- If they ask about a category or account, reference the actual amount
- Suggest concrete next steps when relevant
- Don't use markdown headers in short answers — plain text or a short bullet list is fine`;

  const result = streamText({
    model: anthropic('claude-haiku-4-5'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
