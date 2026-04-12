/**
 * `public.profiles` — row shape and allowed `role` values.
 */

export const PROFILE_ROLES = ["admin", "clinician", "candidate"] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: ProfileRole;
  is_active: boolean;
  created_at: string;
};

export function isProfileRole(value: unknown): value is ProfileRole {
  return (
    typeof value === "string" &&
    (PROFILE_ROLES as readonly string[]).includes(value)
  );
}
