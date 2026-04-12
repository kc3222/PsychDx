/**
 * Admin user management — single user (`/api/admin/users/:id`).
 *
 * - GET: one `profiles` row by UUID.
 * - PATCH: partial update; e.g. deactivate with `{ updates: { is_active: false } }`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCallerRole, getSessionSupabase } from "@/lib/admin-users-api";
import { isProfileRole, type ProfileRow } from "@/types/profile";

/** Matches `ProfileRow` — keep in sync when columns change. */
const PROFILE_SELECT =
  "id, email, full_name, role, is_active, created_at" as const;

/** PATCH: only these keys are forwarded to `.update()` (ignore everything else). */
const PATCH_KEYS = new Set([
  "email",
  "full_name",
  "role",
  "is_active",
]);

type ProfileUpdateBody = Partial<
  Pick<ProfileRow, "email" | "full_name" | "role" | "is_active">
>;

type RouteCtx = { params: Promise<{ id: string }> };

/** Fetch one profile; 404 if missing or not visible under RLS. */
export async function GET(_request: NextRequest, context: RouteCtx) {
  const supabase = await getSessionSupabase();
  if ((await getCallerRole(supabase)) !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await context.params;
  const { data: user, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user: user as ProfileRow });
}

/**
 * Body: `{ updates: { ... } }`. Only whitelisted keys are applied.
 * Deactivate: `{ updates: { is_active: false } }` (does not delete the row).
 */
export async function PATCH(request: NextRequest, context: RouteCtx) {
  const supabase = await getSessionSupabase();
  if ((await getCallerRole(supabase)) !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const raw = body?.updates;

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json(
      { error: "Body must be an object { updates: { ... } }" },
      { status: 400 },
    );
  }

  const updates: ProfileUpdateBody = {};
  for (const key of Object.keys(raw)) {
    if (key === "id" || key === "created_at") continue;
    if (!PATCH_KEYS.has(key)) continue;
    const k = key as keyof ProfileUpdateBody;
    updates[k] = raw[k];
  }

  if ("role" in updates && !isProfileRole(updates.role)) {
    return NextResponse.json(
      { error: "role must be admin, clinician, or candidate" },
      { status: 400 },
    );
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select(PROFILE_SELECT)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user: data as ProfileRow });
}
