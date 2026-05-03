import { NextRequest, NextResponse } from 'next/server';
import { syncAll } from '@/app/lib/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // OWNER_USER_ID must be set to the Supabase auth.users UUID of the account owner.
  // Find it in Supabase dashboard → Authentication → Users after first login.
  const userId = process.env.OWNER_USER_ID;
  if (!userId) {
    return NextResponse.json(
      { error: 'OWNER_USER_ID env var not set' },
      { status: 500 },
    );
  }

  try {
    const result = await syncAll(userId);
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), ...result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
