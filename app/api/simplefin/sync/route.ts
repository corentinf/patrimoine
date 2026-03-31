import { NextRequest, NextResponse } from 'next/server';
import { syncAll } from '@/app/lib/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
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
