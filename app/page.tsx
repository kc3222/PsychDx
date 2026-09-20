import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasGuestCookie } from "@/lib/guest/server";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user || (await hasGuestCookie())) {
    redirect("/home");
  }
  redirect("/login");
}
