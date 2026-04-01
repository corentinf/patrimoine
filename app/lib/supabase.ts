import { createClient } from '@supabase/supabase-js';
import {
  createBrowserClient as ssrBrowserClient,
  createServerClient as ssrServerClient,
} from '@supabase/ssr';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase — use in 'use client' components (auth, sign-out, etc.)
export function createBrowserClient() {
  return ssrBrowserClient(URL, ANON_KEY);
}

// Server-side Supabase — use in Server Components and Route Handlers that need the user session
export async function createServerComponentClient() {
  const cookieStore = await cookies();
  return ssrServerClient(URL, ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components can't set cookies — middleware handles refresh
        }
      },
    },
  });
}

// Service-role client — bypasses RLS, only for API routes and cron jobs
export function createServiceClient() {
  return createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
