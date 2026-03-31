import { NextRequest, NextResponse } from 'next/server';
import { syncAll } from '@/app/lib/sync';

export const runtime = 'nodejs';
export const maxDuration = 60; // seconds

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this automatically)
  const authHeader = request.headers.get('authorization');
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncAll();
    
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
    }, { status: 500 });
  }
}
