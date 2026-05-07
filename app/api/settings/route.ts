import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
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
    .from('user_settings')
    .select('monthly_income')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({ monthly_income: Number(data?.monthly_income ?? 0) });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { monthly_income } = await req.json();
  if (typeof monthly_income !== 'number' || monthly_income < 0) {
    return NextResponse.json({ error: 'Invalid income value' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, monthly_income, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
