# App Directory

This directory contains the Next.js App Router entry points and shared styling for PsychDx.

## Route Overview

### Public

- `/` (`page.tsx`): Redirects to `/home` when a Supabase session exists, otherwise to `/login`.
- `/login`: User sign-in page, and the "Continue as Guest" entry point.
- `/signup`: User registration page.
- `/auth/signout` (POST route): Server-side sign-out endpoint.

### Authenticated (`(authed)/` route group)

`(authed)/layout.tsx` resolves the Supabase user, redirects to `/login` when there is
neither a user nor a guest cookie, and wraps its children in `AppShell` (inside a
`GuestProvider`). Pages inside the group do not repeat that check.

- `/home`: Clinical diagnosis workspace — symptom capture, DSM-5-aligned scoring, risk
  banner, and saving the result as a session against a patient.
- `/patients`: Patient list with each patient's latest session and top diagnosis.
- `/patients/[patientId]`: One patient's session history, diagnostic scores, and symptoms.

Both patient routes are server components that load rows and hand them to a client view
(`PatientsView`, `PatientDetailView`). The split exists so a guest session can render the
same views from the per-tab guest store, which only the browser can read.

The sidebar also links `/history` and `/reports`. Those routes are not implemented yet.

### API

- `/api/admin/users` (GET, POST): List profiles; create an Auth user and align its
  `profiles` row. Admin-only.
- `/api/admin/users/[id]` (GET, PATCH): Read or partially update one profile. Admin-only.
- `/api/analyze` (POST): Run a differential analysis for a signed-in clinician. Guests never
  call it — they run the same engine in the browser.

## Guest sessions

"Continue as Guest" sets a session cookie (`lib/guest/mode.ts`) that tells the server to
render the app shell without a Supabase user. Everything the guest creates — patients,
sessions, scores, symptoms — lives in `sessionStorage` (`lib/guest/store.ts`), so the
browser wipes it when the tab closes and nothing reaches Postgres. Client components branch
on `useIsGuest()` from `lib/guest/provider.tsx`, which carries the server's verdict so both
renders agree. Opening a second tab starts an empty guest workspace: the cookie is shared,
the data is not.

## Shared Files

- `layout.tsx`: Defines the root HTML shell and imports global styles.
- `globals.css`: Design tokens (color ramps, semantic aliases, typography, shape, elevation)
  plus base document styles. All colors are defined here; route CSS references the tokens
  rather than raw hex values.

## Route Styling

Each route owns a plain CSS file imported by its own `layout.tsx`, so the styles load only
with that route:

- `(authed)/shell.css` — app shell and sidebar, imported by the group layout.
- `(authed)/home/analysis.css`, `(authed)/home/diagnose.css`
- `(authed)/patients/patients.css`
- `login/auth.css`, re-exported by `signup/auth.css`

## Notes

`(authed)/_components/` holds components private to the route group (`AppShell`); shared UI
primitives live in the top-level `components/ui/` instead.
