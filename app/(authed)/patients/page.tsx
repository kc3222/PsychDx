import { createClient } from "@/lib/supabase/server";
import { hasGuestCookie } from "@/lib/guest/server";
import PatientsView from "./PatientsView";
import type { PatientRow, ScoreRow, SessionRow } from "./format";

export default async function PatientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guests have no rows in Postgres — PatientsView fills itself from the guest store.
  if (!user && (await hasGuestCookie())) {
    return <PatientsView patients={[]} sessions={[]} topScores={[]} />;
  }

  const { data: patients, error: patientsError } = await supabase
    .from("patients")
    .select("id, first_name, last_name, age_range, gender, status, created_at")
    .order("created_at", { ascending: false })
    .returns<PatientRow[]>();

  if (patientsError) {
    return <PatientsView patients={[]} sessions={[]} topScores={[]} error={patientsError.message} />;
  }

  const patientsList = patients ?? [];
  const patientIds = patientsList.map((p) => p.id);

  const { data: sessions } = patientIds.length
    ? await supabase
        .from("sessions")
        .select("id, patient_id, version, session_type, session_date, status")
        .in("patient_id", patientIds)
        .order("session_date", { ascending: false })
        .returns<SessionRow[]>()
    : { data: [] as SessionRow[] };

  const sessionList = sessions ?? [];
  const sessionIds = sessionList.map((s) => s.id);

  // Rank-1 rows for every session: the view picks the latest session per patient itself,
  // so the two must not disagree about which session that is.
  const { data: scores } = sessionIds.length
    ? await supabase
        .from("diagnostic_scores")
        .select("session_id, diagnosis, confidence_pct, rank")
        .in("session_id", sessionIds)
        .eq("rank", 1)
        .returns<ScoreRow[]>()
    : { data: [] as ScoreRow[] };

  return <PatientsView patients={patientsList} sessions={sessionList} topScores={scores ?? []} />;
}
