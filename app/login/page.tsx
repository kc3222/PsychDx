"use client";

import { createClient } from "@/lib/supabase/client";
import { enterGuestMode, exitGuestMode } from "@/lib/guest/mode";
import { clearGuestData } from "@/lib/guest/store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    // A leftover guest workspace must not follow the user into their real account.
    clearGuestData();
    exitGuestMode();
    router.push("/home");
    router.refresh();
  }

  function continueAsGuest() {
    clearGuestData();
    enterGuestMode();
    router.push("/home");
    router.refresh();
  }

  return (
    <main className="auth-main">
      <div className="card">
        <h1>Log in</h1>
        {error ? (
          <p className="message error" role="alert">
            {error}
          </p>
        ) : null}
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>
        <button type="button" className="auth-guest-btn" onClick={continueAsGuest} disabled={loading}>
          Continue as Guest
        </button>
        <p className="auth-guest-note">
          Try the full workspace with sample data of your own. Nothing is saved — the guest
          workspace is wiped when you close the tab.
        </p>

        <p className="footer-link">
          No account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
