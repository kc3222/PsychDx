# AGENTS.md

Working notes for coding agents in this repo. See [README.md](README.md) for what PsychDx is
and how to run it.

## Commands

```bash
npm run dev      # dev server on :3000 (prefer the preview tooling over a bare shell run)
npm run build    # production build — this is also the type check
npm run lint     # next lint
```

There is no test suite. `npm run build` is the verification step for a change; run it before
claiming a change compiles.

## Stack facts that matter

- Next.js 15 App Router, React 19, TypeScript `strict`. Server Components by default.
- Import with the `@/` alias (`@/lib/supabase/server`), not deep relative paths.
- Supabase is the only backend. There is no ORM, no API layer between pages and Postgres —
  server components query Supabase directly.

## Supabase clients — pick the right one

| Use | Import | Where |
| --- | --- | --- |
| Browser / client components | `createClient` from `@/lib/supabase/client` | `"use client"` files |
| Server components, route handlers | `createClient` from `@/lib/supabase/server` | server files |
| Auth Admin API only | `getAdminServiceClient` from `@/lib/admin-users-api` | server files only |

`getAdminServiceClient()` uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS. Use it only for
`auth.admin.*` calls, never for ordinary reads/writes, and never import it into a module that
can reach the browser. Regular data access goes through the session client so RLS applies.

Admin endpoints gate on `getCallerRole(supabase) === "admin"` *and* rely on RLS. Keep both —
the role check produces a clean 403, RLS is the actual boundary.

## Database changes

- Schema changes are new files in `supabase/migrations/`, named
  `<UTC timestamp>_V<n>_<snake_case_description>.sql`, following the existing sequence.
- Never edit a migration that has already been applied; supersede it with a new one, the way
  V3 drops and recreates the V1/V2 `profiles` policies.
- Migrations are written in lowercase SQL with a header comment block and `comment on`
  statements for new tables and non-obvious columns. Match that style.
- Any new table gets `alter table ... enable row level security` plus policies in the same
  migration. A table without RLS is a leak.
- Keep `types/profile.ts` and the `PROFILE_SELECT` constants in the admin routes in sync with
  the `profiles` columns.

## Styling rules

- **All colors live in `app/globals.css`** as design tokens (`--brand-*`, `--n-*`, `--ok-*`,
  `--warn-*`, `--danger-*`, and the semantic aliases below them). Route CSS must reference
  tokens — no raw hex values outside `globals.css`. Every route stylesheet currently holds to
  this; keep it that way.
- Each route owns a plain `.css` file imported by its `layout.tsx`
  (`app/(authed)/patients/patients.css`, `app/login/auth.css`, …). Add new route styles the
  same way rather than inlining styles or adding a CSS framework.
- Class names are plain kebab-case, scoped by a route or component prefix
  (`patients-view-*`, `analysis-*`, `ccc-*` for the app shell, `pds-btn*` for BlueButton).
- Reuse `BlueButton` / `blueButtonClassName()` from `components/ui/BlueButton` for buttons
  instead of restyling a bare `<button>`.
- Shared patterns that several routes need (e.g. `.message.error`) belong in `globals.css`.

## Code conventions

- Non-trivial modules open with a block comment saying what the file is and any invariant a
  reader must know — see `lib/admin-users-api.ts` and `app/api/admin/users/route.ts`.
  Otherwise comments are sparse; match the density of the file you are editing.
- Route handlers return `NextResponse.json({ error })` with an explicit status; validate input
  and allow-list the fields forwarded to `.update()` (`PATCH_KEYS`) rather than spreading the
  request body.
- Prefer small typed row aliases at the top of a page (`type PatientRow = {...}`) over `any`.
- Pages under `app/(authed)/` are already behind the session check in
  `app/(authed)/layout.tsx`; do not re-implement redirects per page.

## Guest mode

`/login` has a "Continue as Guest" button. A guest exercises the whole app with no Supabase
user and no rows in Postgres.

- The server only sees a session cookie (`lib/guest/mode.ts`, read by `hasGuestCookie()`).
  Compute guest-ness as *no user AND cookie present* — a real session always wins.
- All guest data lives in `sessionStorage` via `lib/guest/store.ts`. Never write guest data
  to Supabase, and never persist it anywhere that survives the tab. Rows in that store
  mirror the DB column shapes so one view renders both paths.
- Client components branch on `useIsGuest()` (`lib/guest/provider.tsx`), which carries the
  server's verdict; do not sniff `document.cookie` in a component, it breaks hydration.
- A server component that a guest can reach must not query on their behalf or redirect on an
  empty result — return the client view with empty props and let it fill itself, the way
  `patients/page.tsx` and `patients/[patientId]/page.tsx` do.
- Analysis has one seam: `analyzeSymptoms()` in `lib/analysis/client.ts`. Guests run
  `lib/analysis/rule-based.ts` in the browser; signed-in users POST to `/api/analyze`.
  Swapping to the LLM API means changing that route handler only.

## Documentation

Most directories carry a `README.md` describing that route's behavior. When you change what a
route does, update its README in the same change. If you add a route, add its README too.

Gaps to fill if you work in them: `app/(authed)/`, `app/(authed)/patients/`, and
`app/api/admin/users/` have no README yet.

## Don't

- Don't commit `.env.local` or any key.
- Don't put PHI (patient names, notes) into logs, error messages, or telemetry.
- Don't extend `reference/` — it is the retired single-file prototype, kept for history.
- Don't loosen an RLS policy to make a query work; fix the query or add a scoped policy.
