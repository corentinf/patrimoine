import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { plaidClient } from '@/app/lib/plaid';
import { createServiceClient } from '@/app/lib/supabase';

export const runtime = 'nodejs';

export async function POST(_request: NextRequest) {
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

  const webhookUrl = process.env.PLAID_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'PLAID_WEBHOOK_URL env var not set' },
      { status: 500 },
    );
  }

  const service = createServiceClient();
  const { data: items, error } = await service
    .from('plaid_items')
    .select('id, item_id, access_token, institution_name')
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updated: string[] = [];
  const failed: { institution: string; error: string }[] = [];

  for (const item of items ?? []) {
    try {
      await plaidClient.itemWebhookUpdate({
        access_token: item.access_token,
        webhook: webhookUrl,
      });
      updated.push(item.institution_name ?? item.item_id);
    } catch (err: any) {
      failed.push({
        institution: item.institution_name ?? item.item_id,
        error: err.response?.data?.error_message ?? err.message,
      });
    }
  }

  return NextResponse.json({ ok: true, webhookUrl, updated, failed });
}
