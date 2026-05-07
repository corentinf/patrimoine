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

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { merchant_key, status } = await req.json();
  if (!merchant_key || !['confirmed', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('subscription_overrides').upsert(
    { user_id: user.id, merchant_key, status },
    { onConflict: 'user_id,merchant_key' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath('/spending');
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { merchant_key } = await req.json();
  if (!merchant_key) return NextResponse.json({ error: 'Missing merchant_key' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('subscription_overrides')
    .delete()
    .eq('user_id', user.id)
    .eq('merchant_key', merchant_key);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath('/spending');
  return NextResponse.json({ ok: true });
}
