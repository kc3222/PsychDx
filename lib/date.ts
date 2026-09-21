/*
 * Calendar-date helpers shared by the two paths that record a session date: the guest
 * store (lib/guest/store.ts) and the authed save in app/(authed)/home/page.tsx.
 *
 * `sessions.session_date` is a Postgres `date` -- a bare calendar day with no time and no
 * offset -- so the day has to be decided wherever the clinician is, not in UTC. Both call
 * sites run in the browser, so local time here is the clinician's own clock.
 *
 * The rendering half of this lives in app/(authed)/patients/format.ts, whose formatDate()
 * reads a bare "YYYY-MM-DD" back as local midnight.
 */

// Today as "YYYY-MM-DD" in the caller's timezone. Deliberately not
// `toISOString().slice(0, 10)`, which is always UTC and so stamps the next day on anyone
// behind UTC saving in the evening.
export function todayLocalDate(now: Date = new Date()) {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
