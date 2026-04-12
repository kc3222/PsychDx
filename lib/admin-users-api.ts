/**
 * Shared helpers for /api/admin/users routes.
 *
 * - Session client: anon key + caller JWT; RLS applies.
 * - Service client: only for Auth Admin API (e.g. createUser); bypasses RLS — use narrowly.
 */

import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Cookie-backed Supabase server client (same as rest of the app). */
export async function getSessionSupabase() {
  return createClient();
}

/**
 * Loads the signed-in user's `profiles.role`, or null if unauthenticated / no row.
 * Used to gate admin-only API behavior (RLS still applies on subsequent queries).
 */
export async function getCallerRole(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role ?? null;
}

/**
 * Service-role client for `auth.admin.*` only. Never expose this key to the browser.
 */
export function getAdminServiceClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
