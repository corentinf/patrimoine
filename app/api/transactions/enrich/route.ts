import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import Anthropic from '@anthropic-ai/sdk';
import { normalizeMerchant } from '@/app/lib/merchant';

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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { transactionId, refresh } = await req.json();
  if (!transactionId) return NextResponse.json({ error: 'Missing transactionId' }, { status: 400 });

  const { data: tx, error } = await supabase
    .from('transactions')
    .select('payee, description, amount, posted_at, memo')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .single();

  if (error || !tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

  const name = tx.payee || tx.description || 'Unknown';

  // One lookup per merchant: "Trader Joe's #123" and "Trader Joe's #456" share a key, so a stored
  // result is reused (no web search, no cost) unless the user explicitly refreshes it.
  const merchantKey = normalizeMerchant(name) || name.toLowerCase();
  if (!refresh) {
    const { data: cached } = await supabase
      .from('merchant_enrichments')
      .select('business_name, description, category, website')
      .eq('user_id', user.id)
      .eq('merchant_key', merchantKey)
      .maybeSingle();
    if (cached) {
      return NextResponse.json({
        cached: true,
        enrichment: {
          businessName: cached.business_name,
          description: cached.description ?? '',
          category: cached.category ?? '',
          website: cached.website,
        },
      });
    }
  }

  const amount = Math.abs(tx.amount).toFixed(2);
  const date = new Date(tx.posted_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const prompt = `Research this financial transaction and identify the merchant.

Transaction:
- Name: "${name}"
- Amount: $${amount}
- Date: ${date}${tx.memo ? `\n- Memo: ${tx.memo}` : ''}

Search the web to find what this business is, then return ONLY a JSON object (no other text):
{
  "businessName": "clean display name of the business",
  "description": "one sentence describing what this business does",
  "category": "type of business (e.g. Restaurant, Streaming Service, Grocery, etc.)",
  "website": "domain.com or null if not found"
}`;

  const client = new Anthropic();
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: prompt },
  ];

  let finalText = '';

  // web_search_20250305 is handled server-side by Anthropic; loop handles
  // any intermediate tool_use stops before Claude reaches end_turn.
  for (let i = 0; i < 5; i++) {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      finalText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as Anthropic.TextBlock).text)
        .join('');
      break;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const toolResults = response.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({
          type: 'tool_result' as const,
          tool_use_id: (b as Anthropic.ToolUseBlock).id,
          content: 'Search completed.',
        }));
      messages.push({ role: 'user', content: toolResults });
    } else {
      break;
    }
  }

  if (!finalText) return NextResponse.json({ error: 'No response from AI' }, { status: 500 });

  const match = finalText.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 });

  try {
    const enrichment = JSON.parse(match[0]);
    // Best effort: a failed save must not hide a result we already paid for.
    await supabase.from('merchant_enrichments').upsert(
      {
        user_id: user.id,
        merchant_key: merchantKey,
        business_name: enrichment.businessName ?? name,
        description: enrichment.description ?? null,
        category: enrichment.category ?? null,
        website: enrichment.website ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,merchant_key' },
    );
    return NextResponse.json({ cached: false, enrichment });
  } catch {
    return NextResponse.json({ error: 'Invalid AI response format' }, { status: 500 });
  }
}
