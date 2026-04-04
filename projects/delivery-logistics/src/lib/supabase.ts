import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a configured Supabase client, or null when environment variables are
 * not set. All callers must guard: `const sb = createSupabaseClient(); if (!sb) return;`
 */
export function createSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Module-level singleton — may be null when env vars are absent.
 * Prefer calling `createSupabaseClient()` in components/actions so the
 * null check is explicit at the call site.
 */
export const supabase = createSupabaseClient();
