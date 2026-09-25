# PsychDx

PsychDx is a clinical decision-support web app for psychiatric differential diagnosis.
A clinician enters patient symptoms with timeline context, the app scores them against
DSM-5-aligned criteria for a small set of conditions, and the resulting analysis is saved
as a session against a patient record.

> **Decision support only.** PsychDx does not diagnose patients and is not a medical device.
> Every result is a ranked suggestion for a qualified clinician to review.
> The `patients` table stores identifying information (PHI); access is enforced by Supabase
> Row Level Security, not by de-identification.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, React 19, TypeScript strict) |
| Auth + data | Supabase (`@supabase/ssr` cookie sessions, Postgres, RLS) |
| Icons | `lucide-react` |
| Styling | Plain CSS with design tokens in `app/globals.css` — no CSS framework |

There is no test suite and no CSS/JS build step beyond Next.js itself.

## Getting started

Requires Node 18.18+ (Next 15) and access to a Supabase project.

```bash
npm install
```

Create `.env.local` in the repo root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # only needed for /api/admin/users POST

# Optional: PsychDx-RAG diagnosis (lib/rag/config.ts, FRONTEND.md). Off unless exactly "true".
RAG_DIAGNOSE_ENABLED=false
RAG_URL=http://localhost:8000                   # defaults to this; Cloud Run URL when deployed
RAG_API_KEY=<same value as the RAG service's RAG_API_KEY>
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never be referenced from a client
component. Without it the rest of the app works; only admin user *creation* fails.

`RAG_DIAGNOSE_ENABLED` switches signed-in analyses from the local rule-based engine to the
PsychDx-RAG service. With it unset or anything other than `true`, the rule-based engine runs
and `RAG_URL` / `RAG_API_KEY` are not needed. All three are read in `lib/rag/config.ts`. `RAG_API_KEY` is server-only, like the service
role key. Migration V4 (likelihood tiers) must be applied before running this version, flag on or off.

Apply the database schema with the Supabase CLI:

```bash
supabase db push
```

Then run the dev server:

```bash
npm run dev
```

The app is served at http://localhost:3000 and redirects to `/login`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next dev server on port 3000 |
| `npm run build` | Production build (also the type check) |
| `npm run start` | Serve the production build |
| `npm run lint` | `next lint` |

## Project structure

```
app/
  layout.tsx            Root HTML shell, imports globals.css
  page.tsx              Redirects to /home when signed in or a guest, else /login
  globals.css           Design tokens + base styles (single source of colors)
  login/, signup/       Public auth pages (share login/auth.css)
  auth/signout/         POST route handler for server-side sign-out
  (authed)/             Route group: requires a session or guest cookie, renders AppShell
    _components/        AppShell — sidebar nav, sign-out, collapse
    home/               Diagnose workspace (client component)
    patients/           Patient list and [patientId] detail (server components)
  api/admin/users/      Admin-only user management JSON API
  api/analyze/          Analysis endpoint for signed-in users
components/ui/          Shared UI primitives (BlueButton)
lib/analysis/           Rule-based scoring engine + the client-side analysis seam
lib/guest/              Guest-mode cookie, per-tab ephemeral store, React provider
lib/supabase/           Browser and server Supabase client factories
lib/admin-users-api.ts  Session/service clients + role gate for the admin API
types/profile.ts        `public.profiles` row shape and role union
supabase/migrations/    Ordered SQL migrations
reference/              Retired single-file prototype — read-only history
middleware.ts           Refreshes the Supabase session cookie on every request
```

Most directories carry their own `README.md` describing that route in detail.

## Routes

| Route | Type | Notes |
| --- | --- | --- |
| `/` | Server | Redirect to `/home` (session or guest) or `/login` |
| `/login`, `/signup` | Client | Supabase email/password auth; `/login` also starts guest sessions |
| `/home` | Client | Symptom capture, scoring, risk banner, saves a session |
| `/patients` | Server | Patient list with latest session and top diagnosis |
| `/patients/[patientId]` | Server | Session history, scores, symptoms for one patient |
| `/auth/signout` | POST | Server-side `signOut()` then redirect to `/` |
| `/api/admin/users` | GET/POST | List profiles; create Auth user + profile row |
| `/api/admin/users/[id]` | GET/PATCH | Read or partially update one profile |
| `/api/analyze` | POST | Differential analysis for a signed-in clinician |

The sidebar also links to `/history` and `/reports`; those routes do not exist yet and
currently 404.

## Guest sessions

`/login` offers **Continue as Guest**. A guest gets the full workspace — create patients,
run analyses, browse session history — without a Supabase user and without writing a single
row: everything lives in that tab's `sessionStorage` and the browser discards it when the
tab closes, so there is nothing to clean up. A session cookie is all the server sees, and a
real session always takes precedence over it.

Guests run the rule-based engine in the browser instead of calling `/api/analyze`; signed-in
users go through the route, which is where the swap to the LLM API will happen.

## Data model

Defined in `supabase/migrations/`, newest last:

- **`profiles`** — one row per auth user, created automatically by the `handle_new_user`
  trigger. Holds `role` (`admin` | `clinician` | `candidate`) and `is_active`.
- **`patients`** — patient records owned by a clinician (`clinician_id → profiles.id`),
  including names, age range, gender, optional reference id, and `active`/`archived` status.
- **`sessions`** — one clinical encounter / analysis run per row, versioned per patient
  (v1 = initial assessment, v2+ = follow-up).
- **`diagnostic_scores`** — one row per diagnosis candidate per session, with a
  `likelihood` tier (High / Moderate / Low) and `rank`.
- **`session_symptoms`** — the symptoms captured for a session.

### Access control

- Every table has RLS enabled; clinicians reach patient data only through their own
  `clinician_id`, and the policy chain is re-checked at each level (session → patient →
  clinician).
- `profiles` grants admins full read/update/delete and everyone else read/update of their
  own row. A trigger blocks non-admins from changing their own `role`, so privilege
  escalation is not possible from the client.
- The admin API additionally checks `profiles.role === "admin"` before touching anything;
  RLS remains the real boundary.

## Notes

- `reference/` holds the pre-April-2026 single-file HTML prototype. It is retired and kept
  for reference only — do not extend it.
- `.env.local` is gitignored and must stay that way.
