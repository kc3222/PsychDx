import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewAnalysisButton from "../NewAnalysisButton";

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

type TabKey = "sessions" | "overview" | "symptom-timeline" | "diagnostic-evolution" | "symptom-tracker";

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
    .order("session_date", { ascending: false })
    .order("version", { ascending: false })
    .returns<SessionRow[]>();

  const allSessions = sessions ?? [];
  const activeSessions = allSessions.filter((s) => s.status === "active");
  const archivedSessions = allSessions.filter((s) => s.status === "archived");
  const visibleSessions = status === "active" ? activeSessions : archivedSessions;
  const sessionIds = allSessions.map((s) => s.id);

  const { data: scores } = sessionIds.length
    ? await supabase
        .from("diagnostic_scores")
        .select("session_id, diagnosis, confidence_pct, rank")
        .in("session_id", sessionIds)
        .returns<ScoreRow[]>()
    : { data: [] as ScoreRow[] };

  const scoreRows = scores ?? [];
  const scoreRowsBySession = new Map<string, ScoreRow[]>();
  scoreRows.forEach((r) => {
    const arr = scoreRowsBySession.get(r.session_id) ?? [];
    arr.push(r);
    scoreRowsBySession.set(r.session_id, arr);
  });
  scoreRowsBySession.forEach((arr) => arr.sort((a, b) => a.rank - b.rank));
  const topDxBySession = new Map<string, ScoreRow>();
  scoreRowsBySession.forEach((arr, key) => {
    if (arr[0]) topDxBySession.set(key, arr[0]);
  });

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
    if (!arr.includes(r.symptom)) arr.push(r.symptom);
    symptomsBySession.set(r.session_id, arr);
  });
  symptomsBySession.forEach((arr) => arr.sort((a, b) => a.localeCompare(b)));

  const base = `/patients/${patient.id}`;
  const mk = (next: { tab?: TabKey; status?: string }) => {
    const q = new URLSearchParams();
    q.set("tab", next.tab ?? tab);
    q.set("status", next.status ?? status);
    return `${base}?${q.toString()}`;
  };

  const latestSession = allSessions[0];
  const latestTopDx = latestSession ? topDxBySession.get(latestSession.id) : undefined;
  const uniqueSymptoms = Array.from(new Set((allSessions.flatMap((s) => symptomsBySession.get(s.id) ?? [])))).slice(0, 8);

  const sessionsAsc = [...allSessions].sort((a, b) => a.version - b.version);
  const fromSession = sessionsAsc[0];
  const toSession = sessionsAsc[sessionsAsc.length - 1];
  const fromSet = new Set(fromSession ? symptomsBySession.get(fromSession.id) ?? [] : []);
  const toSet = new Set(toSession ? symptomsBySession.get(toSession.id) ?? [] : []);
  const trackerSymptoms = Array.from(new Set([...fromSet, ...toSet])).sort((a, b) => a.localeCompare(b));

  return (
    <div className="patients-view"><div className="detail-header">
        <Link className="back-btn" href="/patients" aria-label="Back to patients">
          ←
        </Link>
        <div className="avatar" aria-hidden="true" style={{ width: 36, height: 36, fontSize: 12 }}>
          {initials(patient.first_name, patient.last_name)}
        </div>
        <div>
          <h1 className="detail-title">
            {patient.first_name} {patient.last_name}
          </h1>
          <div className="detail-sub">{formatAgeGender(patient)}</div>
        </div>
        <div className="detail-actions">
          <NewAnalysisButton patientId={patient.id} />
        </div>
      </div><div className="detail-main-tabs">
        <Link className={`main-tab ${tab === "sessions" ? "active" : ""}`} href={mk({ tab: "sessions" })}>
          Sessions
        </Link>
        <Link className={`main-tab ${tab === "overview" ? "active" : ""}`} href={mk({ tab: "overview" })}>
          Overview
        </Link>
        <Link className={`main-tab ${tab === "symptom-timeline" ? "active" : ""}`} href={mk({ tab: "symptom-timeline" })}>
          Symptom Timeline
        </Link>
        <Link
          className={`main-tab ${tab === "diagnostic-evolution" ? "active" : ""}`}
          href={mk({ tab: "diagnostic-evolution" })}
        >
          Diagnostic Evolution
        </Link>
        <Link className={`main-tab ${tab === "symptom-tracker" ? "active" : ""}`} href={mk({ tab: "symptom-tracker" })}>
          Symptom Tracker
        </Link>
      </div><div className="detail-body">
        {tab === "sessions" ? (
          <>
            <div className="sessions-label">
              {visibleSessions.length} Sessions
              <div className="session-tabs">
                <Link className={`tab ${status === "active" ? "active" : ""}`} href={mk({ status: "active" })}>
                  Active ({activeSessions.length})
                </Link>
                <Link className={`tab ${status === "archived" ? "active" : ""}`} href={mk({ status: "archived" })}>
                  Archived
                </Link>
              </div>
            </div>
            {visibleSessions.map((s) => {
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
          </>
        ) : null}

        {tab === "overview" ? (
          <>
            <div className="overview-stats">
              <div className="overview-card">
                <strong>{allSessions.length}</strong>
                <span>Total visits</span>
              </div>
              <div className="overview-card">
                <strong>{latestTopDx ? diagnosisShort(latestTopDx.diagnosis) : "-"}</strong>
                <span>Latest diagnosis</span>
              </div>
              <div className="overview-card">
                <strong>{latestSession ? formatDate(latestSession.session_date) : "-"}</strong>
                <span>Last visit</span>
              </div>
            </div>
            <div className="overview-key-label">Key symptoms</div>
            <div className="overview-chips">
              {uniqueSymptoms.map((s) => (
                <span key={s} className="overview-chip">
                  {s}
                </span>
              ))}
            </div>
          </>
        ) : null}

        {tab === "symptom-timeline" ? (
          <>
            {allSessions.map((s, index) => {
              const current = symptomsBySession.get(s.id) ?? [];
              const older = index < allSessions.length - 1 ? new Set(symptomsBySession.get(allSessions[index + 1].id) ?? []) : new Set<string>();
              const added = new Set(current.filter((sym) => !older.has(sym)));
              return (
                <div key={s.id} className="session-card">
                  <div className="session-row">
                    <span className="session-date">{`${formatDate(s.session_date)} · v${s.version} ${s.session_type === "follow_up_evaluation" ? "Follow-up" : "Initial"}`}</span>
                  </div>
                  <div className="timeline-title">Symptoms this session</div>
                  <div className="symptom-tags">
                    {current.map((sym) => (
                      <span key={`${s.id}-${sym}`} className={`tag ${added.has(sym) && index < allSessions.length - 1 ? "tag-new" : ""}`}>
                        {sym}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        ) : null}

        {tab === "diagnostic-evolution" ? (
          <div className="diagnostic-evolution">
            {allSessions.map((s) => {
              const ranked = scoreRowsBySession.get(s.id) ?? [];
              return (
                <div key={s.id} className="diagnostic-block">
                  <div className="diagnostic-title">{`v${s.version} · ${sessionTypeLabel(s.session_type)}  ${formatDate(s.session_date)}`}</div>
                  {ranked.map((r) => (
                    <div key={`${s.id}-${r.rank}-${r.diagnosis}`} className="diagnostic-row">
                      <span className="diag-name">{r.diagnosis}</span>
                      <div className="diag-bar">
                        <span style={{ width: `${Math.max(0, Math.min(100, Number(r.confidence_pct)))}%` }} />
                      </div>
                      <span className="diag-val">{Math.round(Number(r.confidence_pct))}%</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : null}

        {tab === "symptom-tracker" ? (
          <div className="symptom-tracker">
            <div className="tracker-legend">
              <span className="dot present" /> Present
              <span className="dot absent" /> Absent
            </div>
            <div className="tracker-head">
              <span>Symptom</span>
              <span>{fromSession && toSession ? `v${fromSession.version} -> v${toSession.version}` : "v1 -> v2"}</span>
              <span>Status</span>
            </div>
            {trackerSymptoms.map((sym) => {
              const hasFrom = fromSet.has(sym);
              const hasTo = toSet.has(sym);
              const state = !hasFrom && hasTo ? "new" : hasFrom && hasTo ? "persistent" : hasFrom && !hasTo ? "resolved" : "absent";
              return (
                <div key={sym} className="tracker-row">
                  <span className="tracker-symptom">{sym}</span>
                  <span className="tracker-dots">
                    <i className={`dot ${hasFrom ? "present" : "absent"}`} />
                    <i className={`dot ${hasTo ? "present" : "absent"}`} />
                  </span>
                  <span className={`tracker-state ${state}`}>{state === "new" ? "new ↑" : state}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div></div>
  );
}

