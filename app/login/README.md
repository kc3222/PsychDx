# Login Page (`/login`)

This page authenticates existing users with Supabase email/password sign-in.

## Core Functionality

- Provides a login form with email and password fields.
- Calls `supabase.auth.signInWithPassword` on submit.
- Displays authentication errors returned by Supabase.
- Shows a loading state while sign-in is in progress.
- Redirects successful logins to `/home` and refreshes navigation state.
- Includes a link to the sign-up page (`/signup`).
