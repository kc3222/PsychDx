# `/history`

Every saved analysis across the clinician's caseload, newest first, grouped by session date.
It is the place to pick a case back up without opening the patient record first.

- `page.tsx` — server component. Loads the newest 500 `sessions` (RLS already limits them to
  the clinician's own patients), then the patients they belong to, each session's rank-1
  `diagnostic_scores` row, and its `session_symptoms`. Rows are handed to `HistoryView`.
- `HistoryView.tsx` — client component that renders the feed. Each entry shows the patient,
  session version and type, up to five symptoms, and the top diagnosis with its likelihood
  tier, and links to that patient's Sessions tab (the matching Active/Archived list).
- `history.css` — route styles (`history-*`), imported by `layout.tsx`.

## Filters

Patient, date range (7 / 30 / 90 days or all time), top likelihood (High / Moderate / Low),
and session status (Active by default). Filtering runs in the browser over the rows already
loaded, so the URL does not change and nothing is re-queried. Date ranges compare the bare
`session_date` against a local-time `YYYY-MM-DD` cut-off (see `lib/date.ts`).

## Guests

For a guest the server returns `HistoryView` with empty props and the view reads patients,
sessions, scores and symptoms from the per-tab guest store instead — same shapes, same
rendering, nothing queried.
