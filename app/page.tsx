import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profileJson: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    profileJson = profile ? JSON.stringify(profile, null, 2) : "(no profile row)";
  }

  return (
    <main>
      <div className="home-panel card">
        <h1>Supabase auth test</h1>
        <p className="subtitle">
          Use Log in or Sign up, then return here to see the session and your{" "}
          <code>profiles</code> row (after migrations + trigger are applied).
        </p>
        {user ? (
          <>
            <p>
              Signed in as <strong>{user.email}</strong>
            </p>
            <p className="subtitle" style={{ marginBottom: "0.5rem" }}>
              User id
            </p>
            <pre>{user.id}</pre>
            <p className="subtitle" style={{ margin: "1rem 0 0.5rem" }}>
              Profile from DB
            </p>
            <pre>{profileJson}</pre>
            <form action="/auth/signout" method="post" style={{ marginTop: "1.25rem" }}>
              <button type="submit">Sign out</button>
            </form>
          </>
        ) : (
          <p>
            Not signed in.{" "}
            <Link href="/login">Log in</Link> or <Link href="/signup">sign up</Link>.
          </p>
        )}
      </div>
    </main>
  );
}
