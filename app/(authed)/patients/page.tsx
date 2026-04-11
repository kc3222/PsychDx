import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewPatientButton from "./NewPatientButton";

type PatientRow = {
  id: string;
  first_name: string;
  last_name: string;
  age_range: string | null;
  gender: string | null;
  status: "active" | "archived";
  created_at: string;
};

type SessionRow = {
  id: string;
  patient_id: string;
  session_date: string;
  status: "active" | "archived";
};

type ScoreRow = {
  session_id: string;
  diagnosis: string;
  confidence_pct: number;
  rank: number;
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

export default async function PatientsPage() {
  const supabase = await createClient();

  const { data: patients, error: patientsError } = await supabase
    .from("patients")
    .select("id, first_name, last_name, age_range, gender, status, created_at")
    .order("created_at", { ascending: false })
    .returns<PatientRow[]>();

  const patientsList: PatientRow[] = patients ?? [];
  const patientCount = patientsList.length;

  if (patientsError) {
    return (
      <div className="patients-page">
        <div className="ccc-header-row">
          <div className="ccc-title-row">
            <h2>Patients</h2>
            <span className="muted">{patientCount} patients</span>
          </div>
          <button className="ccc-primary-btn" type="button" disabled>
            + New patient
          </button>
        </div>
        <div className="panel">
          <div className="message error" role="alert">
            {patientsError.message}
          </div>
        </div>
      </div>
    );
  }

  const patientIds = patientsList.map((p) => p.id);

  const { data: sessions } = patientIds.length
    ? await supabase
        .from("sessions")
        .select("id, patient_id, session_date, status")
        .in("patient_id", patientIds)
        .order("session_date", { ascending: false })
        .returns<SessionRow[]>()
    : { data: [] as SessionRow[] };

  const latestSessionByPatient = new Map<string, SessionRow>();
  (sessions ?? []).forEach((s) => {
    if (!latestSessionByPatient.has(s.patient_id)) latestSessionByPatient.set(s.patient_id, s);
  });

  const latestSessionIds = Array.from(latestSessionByPatient.values()).map((s) => s.id);

  const { data: scores } = latestSessionIds.length
    ? await supabase
        .from("diagnostic_scores")
        .select("session_id, diagnosis, confidence_pct, rank")
        .in("session_id", latestSessionIds)
        .eq("rank", 1)
        .returns<ScoreRow[]>()
    : { data: [] as ScoreRow[] };

  const topDxBySession = new Map<string, ScoreRow>();
  (scores ?? []).forEach((r) => topDxBySession.set(r.session_id, r));

  return (
    <div className="patients-view"><div className="topbar">
        <div>
          <div className="topbar-title">Patients</div>
          <div className="topbar-sub">{patientCount} patients</div>
        </div>
        <NewPatientButton />
      </div><div className="search-row">
        <div className="search-wrap">
          <input className="search-input" placeholder="Search patients..." disabled />
        </div>
      </div><div className="patient-list">
        {patientsList.map((p) => {
          const latest = latestSessionByPatient.get(p.id);
          const topDx = latest ? topDxBySession.get(latest.id) : undefined;
          const short = topDx ? diagnosisShort(topDx.diagnosis) : "";
          return (
            <Link key={p.id} href={`/patients/${p.id}`} className="patient-card">
              <div className="avatar" aria-hidden="true">
                {initials(p.first_name, p.last_name)}
              </div>
              <div className="patient-info">
                <div className="patient-name">
                  {p.first_name} {p.last_name}
                </div>
                <div className="patient-meta">
                  {formatAgeGender(p)}
                  {latest?.session_date ? ` · Last seen ${formatDate(latest.session_date)}` : ""}
                </div>
              </div>
              {topDx ? <span className={`dx-badge ${dxClass(short)}`}>{short}</span> : null}
            </Link>
          );
        })}
      </div></div>
  );
}

