import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase';

export const runtime = 'nodejs';

async function getAuthUser() {
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
  return user;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('category_budgets')
    .select('category_id, monthly_amount')
    .eq('user_id', user.id);

  const result: Record<string, number> = {};
  for (const row of data ?? []) result[row.category_id] = Number(row.monthly_amount);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { category_id, monthly_amount } = await req.json();
  if (!category_id || typeof monthly_amount !== 'number' || monthly_amount <= 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('category_budgets').upsert(
    { user_id: user.id, category_id, monthly_amount },
    { onConflict: 'user_id,category_id' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath('/spending');
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { category_id } = await req.json();
  if (!category_id) return NextResponse.json({ error: 'Missing category_id' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('category_budgets')
    .delete()
    .eq('user_id', user.id)
    .eq('category_id', category_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath('/spending');
  return NextResponse.json({ ok: true });
}
