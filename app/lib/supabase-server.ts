import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server Component Supabase client — DO NOT import in 'use client' files
export async function createServerComponentClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components can't set cookies — middleware handles session refresh
          }
        },
      },
    },
  );
}
