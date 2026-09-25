"use client";

/*
 * Patient detail rendering (sessions, overview, timeline, evolution, tracker).
 *
 * Signed-in clinicians get their rows from the server component in page.tsx; guests get
 * the same shapes from the per-tab guest store. Tab and status selection stays in the URL
 * for both, so the links keep working without client state.
 */

import Link from "next/link";
import { useIsGuest } from "@/lib/guest/provider";
import { useGuestData } from "@/lib/guest/store";
import NewAnalysisButton from "../NewAnalysisButton";
import {
  diagnosisShort,
  dxClass,
  formatAgeGender,
  formatDate,
  initials,
  sessionTypeLabel,
  sortSessionsNewestFirst,
  type PatientRow,
  type ScoreRow,
  type SessionRow,
  type SymptomRow,
} from "../format";

export type DetailPatient = Pick<PatientRow, "id" | "first_name" | "last_name" | "age_range" | "gender">;

export type TabKey = "sessions" | "overview" | "symptom-timeline" | "diagnostic-evolution" | "symptom-tracker";

export default function PatientDetailView({
  patientId,
  patient,
  sessions,
  scores,
  symptoms,
  tab,
  status,
}: {
  patientId: string;
  patient: DetailPatient | null;
  sessions: SessionRow[];
  scores: ScoreRow[];
  symptoms: SymptomRow[];
  tab: TabKey;
  status: "active" | "archived";
}) {
  const isGuest = useIsGuest();
  const guest = useGuestData();

  const guestSessionIds = new Set(
    guest.sessions.filter((s) => s.patient_id === patientId).map((s) => s.id)
  );

  const resolvedPatient = isGuest
    ? guest.patients.find((p) => p.id === patientId) ?? null
    : patient;
  const sessionRows = isGuest ? guest.sessions.filter((s) => s.patient_id === patientId) : sessions;
  const scoreRows = isGuest ? guest.scores.filter((s) => guestSessionIds.has(s.session_id)) : scores;
  const symptomRows = isGuest
    ? guest.symptoms.filter((s) => guestSessionIds.has(s.session_id))
    : symptoms;

  if (!resolvedPatient) {
    return (
      <div className="patients-view">
        <div className="detail-header">
          <Link className="back-btn" href="/patients" aria-label="Back to patients">
            ←
          </Link>
          <div>
            <h1 className="detail-title">Patient not found</h1>
            <div className="detail-sub">
              {isGuest
                ? "Guest workspaces are cleared when the tab closes."
                : "This patient is no longer available."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const allSessions = sortSessionsNewestFirst(sessionRows);
  const activeSessions = allSessions.filter((s) => s.status === "active");
  const archivedSessions = allSessions.filter((s) => s.status === "archived");
  const visibleSessions = status === "active" ? activeSessions : archivedSessions;

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

  const symptomsBySession = new Map<string, string[]>();
  symptomRows.forEach((r) => {
    const arr = symptomsBySession.get(r.session_id) ?? [];
    if (!arr.includes(r.symptom)) arr.push(r.symptom);
    symptomsBySession.set(r.session_id, arr);
  });
  symptomsBySession.forEach((arr) => arr.sort((a, b) => a.localeCompare(b)));

  const base = `/patients/${resolvedPatient.id}`;
  const mk = (next: { tab?: TabKey; status?: string }) => {
    const q = new URLSearchParams();
    q.set("tab", next.tab ?? tab);
    q.set("status", next.status ?? status);
    return `${base}?${q.toString()}`;
  };

  const latestSession = allSessions[0];
  const latestTopDx = latestSession ? topDxBySession.get(latestSession.id) : undefined;
  const uniqueSymptoms = Array.from(
    new Set(allSessions.flatMap((s) => symptomsBySession.get(s.id) ?? []))
  ).slice(0, 8);

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
          {initials(resolvedPatient.first_name, resolvedPatient.last_name)}
        </div>
        <div>
          <h1 className="detail-title">
            {resolvedPatient.first_name} {resolvedPatient.last_name}
          </h1>
          <div className="detail-sub">{formatAgeGender(resolvedPatient)}</div>
        </div>
        <div className="detail-actions">
          <NewAnalysisButton patientId={resolvedPatient.id} />
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
                        {short} · {topDx.likelihood}
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
              const older =
                index < allSessions.length - 1
                  ? new Set(symptomsBySession.get(allSessions[index + 1].id) ?? [])
                  : new Set<string>();
              const added = new Set(current.filter((sym) => !older.has(sym)));
              return (
                <div key={s.id} className="session-card">
                  <div className="session-row">
                    <span className="session-date">{`${formatDate(s.session_date)} · v${s.version} ${s.session_type === "follow_up_evaluation" ? "Follow-up" : "Initial"}`}</span>
                  </div>
                  <div className="timeline-title">Symptoms this session</div>
                  <div className="symptom-tags">
                    {current.map((sym) => (
                      <span
                        key={`${s.id}-${sym}`}
                        className={`tag ${added.has(sym) && index < allSessions.length - 1 ? "tag-new" : ""}`}
                      >
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
                      <span className="diag-val">{r.likelihood}</span>
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
