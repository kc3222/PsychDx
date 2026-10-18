# `/reports`

A printable clinical summary for one patient, built from their saved sessions. The patient is
chosen with the picker and kept in the URL as `?patient=<id>`, so a report can be linked to —
the patient detail header has a **Report** button that does exactly that.

- `page.tsx` — server component. Loads the clinician's patients for the picker (RLS scopes
  them). When `?patient=` names one of those patients it also loads that patient's `sessions`,
  every `diagnostic_scores` row for them, and their `session_symptoms`. An unknown or foreign
  id is treated as "no patient selected"; nothing redirects.
- `ReportView.tsx` — client component. Changing the picker pushes a new `?patient=` URL,
  which re-runs the server component. Everything else is derived in the browser.
- `reports.css` — route styles (`reports-*`), imported by `layout.tsx`, including the
  `@media print` rules.

## The report

Sessions are listed oldest first. Active sessions only by default; an "Include archived"
checkbox appears when the patient has archived sessions.

- **Summary** — session count, date span, the latest session's rank-1 diagnosis and
  likelihood, and whether the primary diagnosis (or its tier) changed since the first session.
- **Diagnostic trend** — one row per session with up to three ranked diagnoses.
- **Symptoms** — each distinct symptom with how many sessions noted it, first/last noted
  date, and whether it appears in the latest session.
- A fixed footer stating that this is decision support and that likelihood is a tier, not a
  probability (see `lib/rag/types.ts`).

## Export

"Print / Save PDF" calls `window.print()`. The print stylesheet hides the sidebar, header and
picker and prints only the report document, so PDF export is the browser's own Save as PDF —
nothing is generated or stored server-side.

## Guests

For a guest the server returns `ReportView` with empty rows and only the requested id; the
view resolves the patient and their sessions, scores and symptoms from the per-tab guest store.
