import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

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

// GET /api/venmo?transaction_id=... — request for a transaction
// GET /api/venmo?names=1          — all distinct person names
export async function GET(request: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);

  if (searchParams.get('names') === '1') {
    const { data } = await supabase
      .from('venmo_requests')
      .select('person_name')
      .eq('user_id', user.id)
      .order('person_name');
    const seen = new Set<string>();
    const names = (data ?? []).map((r) => r.person_name).filter((n) => seen.has(n) ? false : seen.add(n) && true);
    return NextResponse.json({ names });
  }

  const txId = searchParams.get('transaction_id');
  if (!txId) return NextResponse.json({ error: 'Missing transaction_id' }, { status: 400 });

  const { data } = await supabase
    .from('venmo_requests')
    .select('*')
    .eq('user_id', user.id)
    .eq('transaction_id', txId)
    .single();

  return NextResponse.json({ request: data ?? null });
}

// POST /api/venmo — create
export async function POST(request: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { transaction_id, person_name, amount } = await request.json();
  if (!transaction_id || !person_name || amount === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('venmo_requests')
    .insert({ user_id: user.id, transaction_id, person_name: person_name.trim(), amount })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: data });
}

// PATCH /api/venmo — update status
export async function PATCH(request: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, status } = await request.json();
  if (!id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const { error } = await supabase
    .from('venmo_requests')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/venmo — remove
export async function DELETE(request: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabase
    .from('venmo_requests')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
