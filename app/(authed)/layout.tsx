import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { GuestProvider } from "@/lib/guest/provider";
import { hasGuestCookie } from "@/lib/guest/server";
import AppShell from "./_components/AppShell";
import "./shell.css";

export default async function AuthedLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A real session always wins; the guest cookie only gets you in when there is none.
  const isGuest = !user && (await hasGuestCookie());

  if (!user && !isGuest) redirect("/login");

  return (
    <GuestProvider isGuest={isGuest}>
      <AppShell isGuest={isGuest}>{children}</AppShell>
    </GuestProvider>
  );
}
