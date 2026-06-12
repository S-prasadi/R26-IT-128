import { createClient, SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { env } from "./env";

console.log("[Supabase] Initializing clients with URL:", env.supabase.url);

// ws constructor signature differs from Supabase's WebSocketLikeConstructor on Node <22
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const realtimeOptions = { transport: ws as any };

/**
 * Service-role client. Bypasses RLS — only use server-side, never expose to clients.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.supabase.url,
  env.supabase.serviceRoleKey,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: realtimeOptions,
  }
);

console.log("[Supabase] Admin client initialized");

/**
 * Anon client — used for unauthenticated auth flows (signUp, signInWithPassword, etc).
 * Subject to RLS (which is fine for auth endpoints).
 */
export const supabaseAnon: SupabaseClient = createClient(
  env.supabase.url,
  env.supabase.anonKey,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: realtimeOptions,
  }
);

console.log("[Supabase] Anon client initialized");
