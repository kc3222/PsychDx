# Signup Page (`/signup`)

This page registers new users through Supabase authentication.

## Core Functionality

- Provides a registration form with optional full name, email, and password.
- Calls `supabase.auth.signUp` and stores `full_name` in user metadata when provided.
- Handles and displays sign-up errors (including already-registered email cases).
- If a session is returned immediately, redirects to `/home`.
- If email confirmation is required, shows guidance to verify email and then log in.
- Includes a link back to the login page (`/login`).
