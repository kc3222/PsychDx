import { createClient } from "@/lib/supabase/server";
import { hasGuestCookie } from "@/lib/guest/server";
import ReportView from "./ReportView";
import type { PatientRow, ScoreRow, SessionRow, SymptomRow } from "../patients/format";

export const metadata = { title: "Reports · PsychDx" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const sp = await searchParams;
  const requestedId = sp.patient?.trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guests have no rows in Postgres — ReportView resolves the patient from the guest store.
  if (!user && (await hasGuestCookie())) {
    return <ReportView patientId={requestedId} patients={[]} sessions={[]} scores={[]} symptoms={[]} />;
  }

  // RLS scopes patients to this clinician; the list only feeds the picker.
  const { data: patients, error: patientsError } = await supabase
    .from("patients")
    .select("id, first_name, last_name, age_range, gender, status, created_at")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .returns<PatientRow[]>();

  if (patientsError) {
    return (
      <ReportView
        patientId={null}
        patients={[]}
        sessions={[]}
        scores={[]}
        symptoms={[]}
        error={patientsError.message}
      />
    );
  }

  const patientList = patients ?? [];
  const patientId = requestedId && patientList.some((p) => p.id === requestedId) ? requestedId : null;

  if (!patientId) {
    return <ReportView patientId={null} patients={patientList} sessions={[]} scores={[]} symptoms={[]} />;
  }

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, patient_id, version, session_type, session_date, status")
    .eq("patient_id", patientId)
    .returns<SessionRow[]>();

  const sessionList = sessions ?? [];
  const sessionIds = sessionList.map((s) => s.id);

  const [{ data: scores }, { data: symptoms }] = sessionIds.length
    ? await Promise.all([
        supabase
          .from("diagnostic_scores")
          .select("session_id, diagnosis, likelihood, rank")
          .in("session_id", sessionIds)
          .returns<ScoreRow[]>(),
        supabase
          .from("session_symptoms")
          .select("session_id, symptom")
          .in("session_id", sessionIds)
          .returns<SymptomRow[]>(),
      ])
    : [{ data: [] as ScoreRow[] }, { data: [] as SymptomRow[] }];

  return (
    <ReportView
      patientId={patientId}
      patients={patientList}
      sessions={sessionList}
      scores={scores ?? []}
      symptoms={symptoms ?? []}
    />
  );
}
