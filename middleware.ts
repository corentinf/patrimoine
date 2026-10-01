import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — keeps tokens alive
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // /api/cron/* (Vercel cron, Bearer CRON_SECRET) and /api/plaid/webhook
  // (Plaid, JWT-verified) are server-to-server calls with no session cookie;
  // each route authenticates itself, so they must bypass the login redirect.
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/cron/') ||
    pathname === '/api/plaid/webhook';
  const isGate = pathname.startsWith('/gate') || pathname.startsWith('/api/gate');

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && !isPublic && !isGate) {
    const passed = request.cookies.get('gate_passed')?.value === '1';
    if (!passed) {
      const url = request.nextUrl.clone();
      url.pathname = '/gate';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json).*)'],
};
