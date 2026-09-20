/*
 * Guest-mode flag.
 *
 * A guest has no Supabase user, so the only thing the server can see is this cookie — it
 * exists purely so the (authed) layout and the patient pages know to render the shell
 * instead of redirecting to /login. It is a session cookie (no Max-Age) and carries no
 * identity or data; everything a guest creates lives in sessionStorage (lib/guest/store).
 *
 * A real session always wins: callers compute `isGuest` as "no user AND cookie present".
 */

export const GUEST_COOKIE_NAME = "psychdx_guest";
export const GUEST_COOKIE_VALUE = "1";

export function enterGuestMode() {
  document.cookie = `${GUEST_COOKIE_NAME}=${GUEST_COOKIE_VALUE}; path=/; SameSite=Lax`;
}

export function exitGuestMode() {
  document.cookie = `${GUEST_COOKIE_NAME}=; path=/; SameSite=Lax; Max-Age=0`;
}
