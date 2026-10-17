import { createClient } from "@/lib/supabase/server";
import { hasGuestCookie } from "@/lib/guest/server";
import HistoryView from "./HistoryView";
import type { PatientRow, ScoreRow, SessionRow, SymptomRow } from "../patients/format";

export const metadata = { title: "History · PsychDx" };

// Newest sessions only; the feed is for picking a case back up, not an audit export.
const SESSION_LIMIT = 500;

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guests have no rows in Postgres — HistoryView fills itself from the guest store.
  if (!user && (await hasGuestCookie())) {
    return <HistoryView patients={[]} sessions={[]} topScores={[]} symptoms={[]} />;
  }

  // RLS scopes sessions to this clinician's patients, so no patient pre-query is needed.
  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, patient_id, version, session_type, session_date, status")
    .order("session_date", { ascending: false })
    .order("version", { ascending: false })
    .limit(SESSION_LIMIT)
    .returns<SessionRow[]>();

  if (sessionsError) {
    return (
      <HistoryView patients={[]} sessions={[]} topScores={[]} symptoms={[]} error={sessionsError.message} />
    );
  }

  const sessionList = sessions ?? [];
  const sessionIds = sessionList.map((s) => s.id);
  const patientIds = Array.from(new Set(sessionList.map((s) => s.patient_id)));

  const [{ data: patients }, { data: scores }, { data: symptoms }] = sessionIds.length
    ? await Promise.all([
        supabase
          .from("patients")
          .select("id, first_name, last_name, age_range, gender, status, created_at")
          .in("id", patientIds)
          .returns<PatientRow[]>(),
        supabase
          .from("diagnostic_scores")
          .select("session_id, diagnosis, likelihood, rank")
          .in("session_id", sessionIds)
          .eq("rank", 1)
          .returns<ScoreRow[]>(),
        supabase
          .from("session_symptoms")
          .select("session_id, symptom")
          .in("session_id", sessionIds)
          .returns<SymptomRow[]>(),
      ])
    : [{ data: [] as PatientRow[] }, { data: [] as ScoreRow[] }, { data: [] as SymptomRow[] }];

  return (
    <HistoryView
      patients={patients ?? []}
      sessions={sessionList}
      topScores={scores ?? []}
      symptoms={symptoms ?? []}
    />
  );
}
