import { createServerClient } from '@supabase/ssr';
import { createServiceClient } from '@/app/lib/supabase';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { plaidClient } from '@/app/lib/plaid';

export const runtime = 'nodejs';

// Removes a Plaid item (e.g. a duplicate link of the same institution) along
// with the accounts it owns. accounts has no item_id column, so ownership is
// resolved by asking Plaid which account_ids the item returns. Deleting an
// account cascades to its transactions and holdings (see schema.sql).
//
// POST { id: <plaid_items.id uuid>, dry_run?: boolean }
// dry_run defaults to TRUE — nothing is deleted unless dry_run is exactly false.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const authClient = createServerClient(
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
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, dry_run } = await request.json();
    const dryRun = dry_run !== false;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const supabase = createServiceClient();
    const { data: item, error: itemErr } = await supabase
      .from('plaid_items')
      .select('id, item_id, access_token, institution_name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (itemErr || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    // Refuse to remove the only item for an institution — that would just
    // delete the user's data rather than a duplicate.
    const { count: siblings } = await supabase
      .from('plaid_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('institution_name', item.institution_name)
      .neq('id', item.id);
    if (!siblings) {
      return NextResponse.json({ error: 'This is the only item for its institution; refusing to remove' }, { status: 400 });
    }

    const accountsRes = await plaidClient.accountsGet({ access_token: item.access_token });
    const accountIds = accountsRes.data.accounts.map((a) => a.account_id);

    const { data: dbAccounts } = await supabase
      .from('accounts')
      .select('id, name, mask, balance')
      .eq('user_id', user.id)
      .in('id', accountIds);
    const { count: txCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .in('account_id', accountIds);
    const { count: holdingsCount } = await supabase
      .from('holdings')
      .select('id', { count: 'exact', head: true })
      .in('account_id', accountIds);

    const preview = {
      institution: item.institution_name,
      accounts: dbAccounts ?? [],
      transactions: txCount ?? 0,
      holdings: holdingsCount ?? 0,
    };
    if (dryRun) return NextResponse.json({ ok: true, dry_run: true, would_delete: preview });

    await plaidClient.itemRemove({ access_token: item.access_token });
    const { error: delAccErr } = await supabase.from('accounts').delete().in('id', accountIds);
    if (delAccErr) return NextResponse.json({ error: delAccErr.message }, { status: 500 });
    const { error: delItemErr } = await supabase.from('plaid_items').delete().eq('id', item.id);
    if (delItemErr) return NextResponse.json({ error: delItemErr.message }, { status: 500 });

    revalidatePath('/', 'layout');
    return NextResponse.json({ ok: true, dry_run: false, deleted: preview });
  } catch (err: any) {
    return NextResponse.json({ error: err?.response?.data?.error_code ?? err.message }, { status: 500 });
  }
}
