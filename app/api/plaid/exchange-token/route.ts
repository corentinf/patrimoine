import { createServerClient } from '@supabase/ssr';
import { createServiceClient } from '@/app/lib/supabase';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { plaidClient } from '@/app/lib/plaid';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
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

  try {
    const { public_token, institution } = await request.json();

    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeRes.data;

    const serviceClient = createServiceClient();

    // Each Link run creates a brand-new item with new account IDs, so linking
    // an institution twice double-counts its balances and transactions. Refuse
    // and remove the just-created item from Plaid so it doesn't keep billing.
    const institutionId = institution?.institution_id ?? null;
    if (institutionId) {
      const { data: existing } = await serviceClient
        .from('plaid_items')
        .select('item_id')
        .eq('user_id', user.id)
        .eq('institution_id', institutionId)
        .neq('item_id', item_id)
        .limit(1);
      if (existing?.length) {
        await plaidClient.itemRemove({ access_token }).catch(() => {});
        return NextResponse.json(
          { error: `${institution?.name ?? 'This institution'} is already connected` },
          { status: 409 },
        );
      }
    }

    const { error } = await serviceClient.from('plaid_items').upsert({
      user_id: user.id,
      item_id,
      access_token,
      institution_id: institution?.institution_id ?? null,
      institution_name: institution?.name ?? null,
    }, { onConflict: 'item_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
