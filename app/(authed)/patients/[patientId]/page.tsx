import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasGuestCookie } from "@/lib/guest/server";
import PatientDetailView, { type DetailPatient, type TabKey } from "./PatientDetailView";
import type { ScoreRow, SessionRow, SymptomRow } from "../format";

function toTab(value?: string): TabKey {
  const raw = (value ?? "").toLowerCase();
  if (
    raw === "sessions" ||
    raw === "overview" ||
    raw === "symptom-timeline" ||
    raw === "diagnostic-evolution" ||
    raw === "symptom-tracker"
  ) {
    return raw;
  }
  return "sessions";
}

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const { patientId } = await params;
  const sp = await searchParams;

  const tab = toTab(sp.tab);
  const status = (sp.status ?? "active").toLowerCase() === "archived" ? "archived" : "active";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guests have no rows in Postgres — PatientDetailView fills itself from the guest store,
  // including the "patient not found" case, so there is nothing to redirect on here.
  if (!user && (await hasGuestCookie())) {
    return (
      <PatientDetailView
        patientId={patientId}
        patient={null}
        sessions={[]}
        scores={[]}
        symptoms={[]}
        tab={tab}
        status={status}
      />
    );
  }

  const { data: patient } = await supabase
    .from("patients")
    .select("id, first_name, last_name, age_range, gender")
    .eq("id", patientId)
    .maybeSingle<DetailPatient>();

  if (!patient) redirect("/patients");

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, patient_id, version, session_type, session_date, status")
    .eq("patient_id", patientId)
    .order("session_date", { ascending: false })
    .order("version", { ascending: false })
    .returns<SessionRow[]>();

  const sessionList = sessions ?? [];
  const sessionIds = sessionList.map((s) => s.id);

  const { data: scores } = sessionIds.length
    ? await supabase
        .from("diagnostic_scores")
        .select("session_id, diagnosis, confidence_pct, rank")
        .in("session_id", sessionIds)
        .returns<ScoreRow[]>()
    : { data: [] as ScoreRow[] };

  const { data: symptoms } = sessionIds.length
    ? await supabase
        .from("session_symptoms")
        .select("session_id, symptom")
        .in("session_id", sessionIds)
        .returns<SymptomRow[]>()
    : { data: [] as SymptomRow[] };

  return (
    <PatientDetailView
      patientId={patientId}
      patient={patient}
      sessions={sessionList}
      scores={scores ?? []}
      symptoms={symptoms ?? []}
      tab={tab}
      status={status}
    />
  );
}
