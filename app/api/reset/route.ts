import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase';

export const runtime = 'nodejs';

export async function POST() {
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

  const uid = user.id;
  const supabase = createServiceClient();

  // Delete in dependency order (transactions reference accounts, etc.)
  await supabase.from('venmo_requests').delete().eq('user_id', uid);
  await supabase.from('holdings').delete().eq('user_id', uid);
  await supabase.from('transactions').delete().eq('user_id', uid);
  await supabase.from('networth_snapshots').delete().eq('user_id', uid);
  await supabase.from('accounts').delete().eq('user_id', uid);
  await supabase.from('plaid_items').delete().eq('user_id', uid);
  await supabase.from('simplefin_connections').delete().eq('user_id', uid);
  // Categories and category_rules are intentionally kept

  revalidatePath('/accounts');
  revalidatePath('/spending');
  revalidatePath('/networth');

  return NextResponse.json({ ok: true });
}
