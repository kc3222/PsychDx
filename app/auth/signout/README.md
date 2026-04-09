# Sign-Out Route (`/auth/signout`)

This folder implements the server route handler for signing users out.

## Core Functionality

- Exposes a `POST` handler in `route.ts`.
- Creates a server Supabase client and calls `supabase.auth.signOut()`.
- Redirects the requester to `/` after sign-out.

## Usage Context

Use this endpoint when sign-out must run on the server route layer instead of client-only navigation.
