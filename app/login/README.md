# Login Page (`/login`)

This page authenticates existing users with Supabase email/password sign-in, and is the
entry point for guest sessions.

## Core Functionality

- Provides a login form with email and password fields.
- Calls `supabase.auth.signInWithPassword` on submit.
- Displays authentication errors returned by Supabase.
- Shows a loading state while sign-in is in progress.
- Redirects successful logins to `/home` and refreshes navigation state.
- Clears any leftover guest cookie and guest workspace on a successful sign-in, so a guest
  session never follows the user into their real account.
- Offers **Continue as Guest**, which sets the guest cookie (`lib/guest/mode.ts`), starts an
  empty guest workspace, and lands on `/home`.
- Includes a link to the sign-up page (`/signup`).

## Guest sessions

A guest has no Supabase user and writes nothing to Postgres. Everything they create lives in
`sessionStorage` (`lib/guest/store.ts`) and the browser drops it when the tab closes.
Analyses run the rule-based engine in the browser rather than calling `/api/analyze`.
