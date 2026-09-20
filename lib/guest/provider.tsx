"use client";

/*
 * Carries the server's guest verdict ("no Supabase user, but the guest cookie is set")
 * down to client components, so they branch on a value that matches the server render
 * instead of sniffing document.cookie after hydration.
 */

import { createContext, useContext, type ReactNode } from "react";

const GuestContext = createContext(false);

export function GuestProvider({ isGuest, children }: { isGuest: boolean; children: ReactNode }) {
  return <GuestContext.Provider value={isGuest}>{children}</GuestContext.Provider>;
}

export function useIsGuest() {
  return useContext(GuestContext);
}
