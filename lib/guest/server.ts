/*
 * Server-side read of the guest cookie. See lib/guest/mode.ts for why it exists.
 */

import { cookies } from "next/headers";
import { GUEST_COOKIE_NAME, GUEST_COOKIE_VALUE } from "@/lib/guest/mode";

export async function hasGuestCookie() {
  const store = await cookies();
  return store.get(GUEST_COOKIE_NAME)?.value === GUEST_COOKIE_VALUE;
}
