import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const GATE_PASSWORD = '8991';
export const GATE_COOKIE = 'gate_passed';

export async function POST(request: Request) {
  const { password } = await request.json();

  if (password !== GATE_PASSWORD) {
    return NextResponse.json({ error: 'invalid' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(GATE_COOKIE, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true });
}
