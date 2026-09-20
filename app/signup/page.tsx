"use client";

import { createClient } from "@/lib/supabase/client";
import { exitGuestMode } from "@/lib/guest/mode";
import { clearGuestData } from "@/lib/guest/store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || undefined },
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (data.user?.identities?.length === 0) {
      setError("This email is already registered. Try logging in.");
      return;
    }
    if (data.session) {
      clearGuestData();
      exitGuestMode();
      router.push("/home");
      router.refresh();
      return;
    }
    setInfo(
      "Check your email to confirm your account (if email confirmation is enabled in Supabase), then log in."
    );
  }

  return (
    <main className="auth-main">
      <div className="card">
        <h1>Sign up</h1>
        {error ? (
          <p className="message error" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="message success" role="status">
            {info}
          </p>
        ) : null}
        <form onSubmit={handleSubmit}>
          <label htmlFor="fullName">Full name (optional)</label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
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
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="footer-link">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
