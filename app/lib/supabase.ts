import { createClient } from '@supabase/supabase-js';
import { createBrowserClient as ssrBrowserClient } from '@supabase/ssr';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase — safe to use in 'use client' components
export function createBrowserClient() {
  return ssrBrowserClient(URL, ANON_KEY);
}

// Service-role client — bypasses RLS, only for API routes and cron jobs
export function createServiceClient() {
  return createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
