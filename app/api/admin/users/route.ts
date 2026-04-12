/**
 * Admin user management — collection routes (`/api/admin/users`).
 *
 * - GET: list profiles (admins only; optional `role`, `exclude_admins`).
 * - POST: create Auth user + align `profiles` row (service role only for `createUser`).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAdminServiceClient,
  getCallerRole,
  getSessionSupabase,
} from "@/lib/admin-users-api";
import { isProfileRole, type ProfileRow } from "@/types/profile";

/** Matches `ProfileRow` — keep in sync when columns change. */
const PROFILE_SELECT =
  "id, email, full_name, role, is_active, created_at" as const;

/** List users from `profiles`, newest first. */
export async function GET(request: NextRequest) {
  const supabase = await getSessionSupabase();
  if ((await getCallerRole(supabase)) !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const roleFilter = searchParams.get("role");
  const excludeAdmins = searchParams.get("exclude_admins") === "true";

  let query = supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .order("created_at", { ascending: false });

  if (roleFilter) {
    query = query.eq("role", roleFilter);
  } else if (excludeAdmins) {
    query = query.neq("role", "admin");
  }

  const { data: profiles, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: profiles as ProfileRow[] });
}

/**
 * Create a new user: `auth.admin.createUser`, then `profiles` update.
 * The `handle_new_user` trigger inserts the profile row; we merge admin fields.
 * On profile failure, roll back by deleting the new Auth user (avoids orphan accounts).
 */
export async function POST(request: NextRequest) {
  const supabase = await getSessionSupabase();
  if ((await getCallerRole(supabase)) !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const {
    email,
    password,
    full_name,
    role = "clinician",
    is_active = true,
  } = body;

  if (!email || !password || !full_name) {
    return NextResponse.json(
      { error: "email, password, and full_name are required" },
      { status: 400 },
    );
  }

  if (!isProfileRole(role)) {
    return NextResponse.json(
      { error: "role must be admin, clinician, or candidate" },
      { status: 400 },
    );
  }

  const adminClient = getAdminServiceClient();
  const { data: authData, error: authError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const { data: updated, error: profileError } = await supabase
    .from("profiles")
    .update({ email, full_name, role, is_active })
    .eq("id", authData.user.id)
    .select(PROFILE_SELECT);

  if (profileError || !updated?.length) {
    await adminClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json(
      { error: profileError?.message ?? "Profile row missing after signup" },
      { status: 500 },
    );
  }

  return NextResponse.json({ user: updated[0] as ProfileRow });
}
