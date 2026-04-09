import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type PatientRow = {
  id: string;
  first_name: string;
  last_name: string;
  age_range: string | null;
  gender: string | null;
};

type SessionRow = {
  id: string;
  patient_id: string;
  version: number;
  session_type: "initial_assessment" | "follow_up_evaluation";
  session_date: string;
  status: "active" | "archived";
};

type ScoreRow = {
  session_id: string;
  diagnosis: string;
  confidence_pct: number;
  rank: number;
};

type SymptomRow = {
  session_id: string;
  symptom: string;
};

function initials(first: string, last: string) {
  const a = (first?.trim()?.[0] ?? "").toUpperCase();
  const b = (last?.trim()?.[0] ?? "").toUpperCase();
  return `${a}${b}` || "?";
}

function formatAgeGender(p: PatientRow) {
  const age = p.age_range?.trim();
  const gender = p.gender?.trim();
  if (age && gender) return `${age} · ${gender}`;
  return age || gender || "";
}

function formatDate(d: string | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function sessionTypeLabel(t: SessionRow["session_type"]) {
  return t === "follow_up_evaluation" ? "Follow-up evaluation" : "Initial assessment";
}

function diagnosisShort(d: string) {
  const raw = d.trim();
  const map: Record<string, string> = {
    schizophrenia: "SCZ",
    "major depressive disorder": "MDD",
    depression: "MDD",
    "bipolar i": "Bipolar I",
    "generalized anxiety disorder": "GAD",
  };
  const key = raw.toLowerCase();
  return map[key] ?? raw.toUpperCase().slice(0, 6);
}

function dxClass(short: string) {
  const s = short.trim().toUpperCase();
  if (s === "SCZ") return "dx-scz";
  if (s === "MDD") return "dx-mdd";
  if (s === "GAD") return "dx-gad";
  return "dx-default";
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

  const status = (sp.status ?? "active").toLowerCase() === "archived" ? "archived" : "active";

  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("id, first_name, last_name, age_range, gender")
    .eq("id", patientId)
    .maybeSingle<PatientRow>();

  if (!patient) redirect("/patients");

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, patient_id, version, session_type, session_date, status")
    .eq("patient_id", patientId)
    .eq("status", status)
    .order("session_date", { ascending: false })
    .order("version", { ascending: false })
    .returns<SessionRow[]>();

  const sessionIds = (sessions ?? []).map((s) => s.id);

  const { data: scores } = sessionIds.length
    ? await supabase
        .from("diagnostic_scores")
        .select("session_id, diagnosis, confidence_pct, rank")
        .in("session_id", sessionIds)
        .eq("rank", 1)
        .returns<ScoreRow[]>()
    : { data: [] as ScoreRow[] };

  const topDxBySession = new Map<string, ScoreRow>();
  (scores ?? []).forEach((r) => topDxBySession.set(r.session_id, r));

  const { data: symptoms } = sessionIds.length
    ? await supabase
        .from("session_symptoms")
        .select("session_id, symptom")
        .in("session_id", sessionIds)
        .returns<SymptomRow[]>()
    : { data: [] as SymptomRow[] };

  const symptomsBySession = new Map<string, string[]>();
  (symptoms ?? []).forEach((r) => {
    const arr = symptomsBySession.get(r.session_id) ?? [];
    arr.push(r.symptom);
    symptomsBySession.set(r.session_id, arr);
  });

  const base = `/patients/${patient.id}`;
  const mk = (next: { tab?: string; status?: string }) => {
    const q = new URLSearchParams();
    q.set("status", next.status ?? status);
    return `${base}?${q.toString()}`;
  };

  return (
    <div className="patients-view">
      <div className="detail-header">
        <Link className="back-btn" href="/patients" aria-label="Back to patients">
          ←
        </Link>
        <div className="avatar" aria-hidden="true" style={{ width: 36, height: 36, fontSize: 12 }}>
          {initials(patient.first_name, patient.last_name)}
        </div>
        <div>
          <div className="detail-title">
            {patient.first_name} {patient.last_name}
          </div>
          <div className="detail-sub">{formatAgeGender(patient)}</div>
        </div>
        <div className="detail-actions">
          <Link className="btn-primary" href={`/home?patientId=${patient.id}`}>
            + New analysis
          </Link>
          <button className="btn-secondary" type="button" disabled>
            Overview
          </button>
        </div>
      </div>

      <div className="detail-body">
        <div className="sessions-label">
          {(sessions ?? []).length} Sessions
          <div className="session-tabs">
            <Link className={`tab ${status === "active" ? "active" : ""}`} href={mk({ status: "active" })}>
              Active ({status === "active" ? (sessions ?? []).length : 0})
            </Link>
            <Link className={`tab ${status === "archived" ? "" : ""}`} href={mk({ status: "archived" })}>
              Archived
            </Link>
          </div>
        </div>

        {(sessions ?? []).map((s) => {
          const topDx = topDxBySession.get(s.id);
          const short = topDx ? diagnosisShort(topDx.diagnosis) : "";
          const chips = (symptomsBySession.get(s.id) ?? []).slice(0, 6);
          return (
            <div key={s.id} className="session-card">
              <div className="session-row">
                <span className="session-date">{formatDate(s.session_date)}</span>
                <span className="session-ver">{`v${s.version} · ${sessionTypeLabel(s.session_type)}`}</span>
                <span className="status-active">{s.status === "active" ? "Active" : "Archived"}</span>
                {topDx ? (
                  <span className={`dx-badge ${dxClass(short)}`} style={{ marginLeft: "auto" }}>
                    {short} {Math.round(Number(topDx.confidence_pct) || 0)}%
                  </span>
                ) : null}
                <span className="dot-menu">···</span>
              </div>
              {chips.length ? (
                <div className="symptom-tags">
                  {chips.map((c) => (
                    <span key={`${s.id}-${c}`} className="tag">
                      {c}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="view-link">⊙ View full analysis</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

