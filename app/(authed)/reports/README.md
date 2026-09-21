# `/reports`

Placeholder route. The sidebar has always linked here, so without a page the tab rendered the
Next.js 404/error screen — this renders a "coming soon" page instead.

- `page.tsx` — server component, no data access. It renders the shared
  [`ComingSoon`](../_components/ComingSoon.tsx) body with the copy for this route.
- `layout.tsx` — imports the shared `_components/placeholder.css`.

Nothing here queries Supabase, so guests and signed-in users see the same page. When Reports is
built for real, replace `page.tsx` and give the route its own `reports.css`.
