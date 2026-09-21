const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Postgres `date` columns (e.g. sessions.session_date) come back as a bare
// "YYYY-MM-DD", which `new Date()` parses as UTC midnight — that renders as the
// previous day for anyone behind UTC. Build those at local midnight instead so
// the calendar date is preserved. Full ISO timestamps keep the default parsing.
export function formatDate(d: string | null | undefined) {
  if (!d) return "";
  const parts = DATE_ONLY_RE.exec(d);
  let dt: Date;
  if (parts) {
    const [, year, month, day] = parts.map(Number);
    dt = new Date(year, month - 1, day);
    dt.setFullYear(year);
    if (dt.getMonth() !== month - 1 || dt.getDate() !== day) return "";
  } else {
    dt = new Date(d);
  }
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
