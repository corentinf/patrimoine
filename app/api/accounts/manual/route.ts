import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase';
import { captureNetWorthSnapshot } from '@/app/lib/sync';

export const runtime = 'nodejs';

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

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

  const { name, institution, account_type, balance } = await request.json();
  if (!name || !institution || !account_type || balance === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const id = `manual_${slugify(institution)}_${slugify(name)}`;
  const supabase = createServiceClient();

  const { error } = await supabase.from('accounts').upsert({
    id,
    user_id: user.id,
    name,
    institution,
    account_type,
    balance: Number(balance),
    available_balance: null,
    balance_date: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_hidden: false,
  }, { onConflict: 'id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await captureNetWorthSnapshot(supabase, user.id);
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(request: NextRequest) {
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

  const { id } = await request.json();
  if (!id?.startsWith('manual_')) {
    return NextResponse.json({ error: 'Can only delete manual accounts' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await captureNetWorthSnapshot(supabase, user.id);
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
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

  const { id, name, institution, account_type, balance } = await request.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (institution !== undefined) updates.institution = institution;
  if (account_type !== undefined) updates.account_type = account_type;
  if (balance !== undefined) {
    updates.balance = Number(balance);
    updates.balance_date = new Date().toISOString();
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('accounts').update(updates).eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await captureNetWorthSnapshot(supabase, user.id);
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true });
}
