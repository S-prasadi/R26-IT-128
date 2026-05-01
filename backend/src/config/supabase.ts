import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Service-role client. Bypasses RLS — only use server-side, never expose to clients.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.supabase.url,
  env.supabase.serviceRoleKey,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

/**
 * Anon client — used for unauthenticated auth flows (signUp, signInWithPassword, etc).
 * Subject to RLS (which is fine for auth endpoints).
 */
export const supabaseAnon: SupabaseClient = createClient(
  env.supabase.url,
  env.supabase.anonKey,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);
