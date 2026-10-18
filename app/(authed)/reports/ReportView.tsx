"use client";

/*
 * Per-patient clinical summary: diagnostic trend across sessions and symptom frequency,
 * laid out to print (or "Save as PDF") from the browser.
 *
 * The selected patient lives in the URL (`?patient=<id>`). Signed-in clinicians get that
 * patient's rows from the server component in page.tsx; guests get the same shapes from
 * the per-tab guest store. Everything below the picker is derived in the browser, so both
 * paths render identically.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Printer } from "lucide-react";
import { BlueButton, blueButtonClassName } from "@/components/ui/BlueButton";
import { useIsGuest } from "@/lib/guest/provider";
import { useGuestData } from "@/lib/guest/store";
import { todayLocalDate } from "@/lib/date";
import type { Likelihood } from "@/lib/rag/types";
import {
  formatAgeGender,
  formatDate,
  initials,
  sessionTypeLabel,
  type PatientRow,
  type ScoreRow,
  type SessionRow,
  type SymptomRow,
} from "../patients/format";

const MAX_DX_PER_SESSION = 3;

type SymptomSummary = {
  symptom: string;
  count: number;
  first: string;
  last: string;
  inLatest: boolean;
};

function likelihoodClass(l: Likelihood) {
  if (l === "High") return "reports-lk-high";
  if (l === "Moderate") return "reports-lk-moderate";
  return "reports-lk-low";
}

function sortSessionsOldestFirst(rows: SessionRow[]) {
  return [...rows].sort((a, b) => a.session_date.localeCompare(b.session_date) || a.version - b.version);
}

export default function ReportView({
  patientId,
  patients,
  sessions,
  scores,
  symptoms,
  error,
}: {
  patientId: string | null;
  patients: PatientRow[];
  sessions: SessionRow[];
  scores: ScoreRow[];
  symptoms: SymptomRow[];
  error?: string | null;
}) {
  const router = useRouter();
  const isGuest = useIsGuest();
  const guest = useGuestData();
  const [includeArchived, setIncludeArchived] = useState(false);

  const patientRows = isGuest ? guest.patients : patients;
  const patient = patientId ? patientRows.find((p) => p.id === patientId) ?? null : null;

  const sessionRows = useMemo(() => {
    if (!patient) return [];
    const rows = isGuest ? guest.sessions.filter((s) => s.patient_id === patient.id) : sessions;
    return sortSessionsOldestFirst(rows);
  }, [isGuest, guest.sessions, sessions, patient]);

  const included = includeArchived ? sessionRows : sessionRows.filter((s) => s.status === "active");
  const archivedCount = sessionRows.length - sessionRows.filter((s) => s.status === "active").length;

  const scoresBySession = useMemo(() => {
    const ids = new Set(sessionRows.map((s) => s.id));
    const m = new Map<string, ScoreRow[]>();
    (isGuest ? guest.scores : scores).forEach((r) => {
      if (!ids.has(r.session_id)) return;
      const arr = m.get(r.session_id) ?? [];
      arr.push(r);
      m.set(r.session_id, arr);
    });
    m.forEach((arr) => arr.sort((a, b) => a.rank - b.rank));
    return m;
  }, [isGuest, guest.scores, scores, sessionRows]);

  const symptomsBySession = useMemo(() => {
    const ids = new Set(sessionRows.map((s) => s.id));
    const m = new Map<string, Set<string>>();
    (isGuest ? guest.symptoms : symptoms).forEach((r) => {
      if (!ids.has(r.session_id)) return;
      const set = m.get(r.session_id) ?? new Set<string>();
      set.add(r.symptom);
      m.set(r.session_id, set);
    });
    return m;
  }, [isGuest, guest.symptoms, symptoms, sessionRows]);

  const firstSession = included[0];
  const latestSession = included[included.length - 1];
  const firstDx = firstSession ? scoresBySession.get(firstSession.id)?.[0] : undefined;
  const latestDx = latestSession ? scoresBySession.get(latestSession.id)?.[0] : undefined;

  // `included` is oldest first, so the first sighting of a symptom sets `first`.
  const symptomSummary: SymptomSummary[] = [];
  {
    const bySymptom = new Map<string, SymptomSummary>();
    const latestSet = latestSession ? symptomsBySession.get(latestSession.id) : undefined;
    included.forEach((s) => {
      symptomsBySession.get(s.id)?.forEach((symptom) => {
        const row = bySymptom.get(symptom);
        if (row) {
          row.count += 1;
          row.last = s.session_date;
        } else {
          bySymptom.set(symptom, {
            symptom,
            count: 1,
            first: s.session_date,
            last: s.session_date,
            inLatest: latestSet?.has(symptom) ?? false,
          });
        }
      });
    });
    symptomSummary.push(
      ...Array.from(bySymptom.values()).sort((a, b) => b.count - a.count || a.symptom.localeCompare(b.symptom))
    );
  }

  const selectPatient = (id: string) => {
    router.push(id ? `/reports?patient=${encodeURIComponent(id)}` : "/reports");
  };

  const pickerPatients = [...patientRows].sort((a, b) =>
    `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
  );

  return (
    <div className="reports-view">
      <header className="reports-topbar">
        <div>
          <h1 className="reports-topbar-title">Reports</h1>
          <p className="reports-topbar-sub">Per-patient clinical summary</p>
        </div>
        {patient && included.length ? (
          <BlueButton variant="secondary" onClick={() => window.print()}>
            <Printer size={14} aria-hidden="true" /> Print / Save PDF
          </BlueButton>
        ) : null}
      </header>

      {error && !isGuest ? (
        <div className="reports-body">
          <p className="message error" role="alert">
            {error}
          </p>
        </div>
      ) : (
        <>
          <div className="reports-toolbar" role="group" aria-label="Report options">
            <label className="reports-field">
              <span>Patient</span>
              <select value={patient?.id ?? ""} onChange={(e) => selectPatient(e.target.value)}>
                <option value="">Select a patient…</option>
                {pickerPatients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.last_name}, {p.first_name}
                    {p.status === "archived" ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {patient && archivedCount > 0 ? (
              <label className="reports-check">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                />
                <span>Include {archivedCount} archived {archivedCount === 1 ? "session" : "sessions"}</span>
              </label>
            ) : null}
          </div>

          <div className="reports-body">
            {patientRows.length === 0 ? (
              <section className="reports-empty">
                <span className="reports-empty-icon" aria-hidden="true">
                  <FileText size={22} />
                </span>
                <h2>No patients yet</h2>
                <p>Add a patient and save an analysis against them to build a report.</p>
                <Link href="/patients" className={blueButtonClassName("primary")}>
                  Go to patients
                </Link>
              </section>
            ) : !patient ? (
              <section className="reports-empty">
                <span className="reports-empty-icon" aria-hidden="true">
                  <FileText size={22} />
                </span>
                <h2>{patientId ? "Patient not found" : "Choose a patient"}</h2>
                <p>
                  {patientId && isGuest
                    ? "Guest workspaces are cleared when the tab closes. Pick another patient above."
                    : "Pick a patient above to summarize their sessions, diagnostic trend, and symptoms."}
                </p>
              </section>
            ) : included.length === 0 ? (
              <section className="reports-empty">
                <h2>No sessions to report</h2>
                <p>
                  {sessionRows.length
                    ? "This patient only has archived sessions. Include them above to build the report."
                    : `${patient.first_name} ${patient.last_name} has no saved analyses yet.`}
                </p>
                <Link href={`/home?patientId=${patient.id}`} className={blueButtonClassName("primary")}>
                  Run an analysis
                </Link>
              </section>
            ) : (
              <article className="reports-doc" aria-label="Patient report">
                <header className="reports-doc-head">
                  <span className="reports-avatar" aria-hidden="true">
                    {initials(patient.first_name, patient.last_name)}
                  </span>
                  <div className="reports-doc-id">
                    <h2 className="reports-doc-name">
                      {patient.first_name} {patient.last_name}
                    </h2>
                    <p className="reports-doc-meta">
                      {[formatAgeGender(patient), patient.status === "archived" ? "Archived case" : null]
                        .filter(Boolean)
                        .join(" · ") || "No demographics recorded"}
                    </p>
                  </div>
                  <p className="reports-doc-generated">Generated {formatDate(todayLocalDate())}</p>
                </header>

                <section className="reports-section">
                  <h3 className="reports-section-title">Summary</h3>
                  <dl className="reports-stats">
                    <div>
                      <dt>Sessions</dt>
                      <dd>{included.length}</dd>
                    </div>
                    <div>
                      <dt>Period</dt>
                      <dd>
                        {firstSession.session_date === latestSession.session_date
                          ? formatDate(latestSession.session_date)
                          : `${formatDate(firstSession.session_date)} – ${formatDate(latestSession.session_date)}`}
                      </dd>
                    </div>
                    <div>
                      <dt>Latest primary</dt>
                      <dd>
                        {latestDx ? (
                          <>
                            {latestDx.diagnosis}{" "}
                            <span className={`reports-lk ${likelihoodClass(latestDx.likelihood)}`}>
                              {latestDx.likelihood}
                            </span>
                          </>
                        ) : (
                          "None ranked"
                        )}
                      </dd>
                    </div>
                    {included.length > 1 ? (
                      <div>
                        <dt>Since first session</dt>
                        <dd>
                          {!firstDx || !latestDx
                            ? "Not comparable"
                            : firstDx.diagnosis === latestDx.diagnosis
                              ? firstDx.likelihood === latestDx.likelihood
                                ? "Primary unchanged"
                                : `Primary unchanged, ${firstDx.likelihood} → ${latestDx.likelihood}`
                              : `Primary changed from ${firstDx.diagnosis}`}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </section>

                <section className="reports-section">
                  <h3 className="reports-section-title">Diagnostic trend</h3>
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Session</th>
                        <th scope="col">Ranked diagnoses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {included.map((s) => {
                        const dx = (scoresBySession.get(s.id) ?? []).slice(0, MAX_DX_PER_SESSION);
                        return (
                          <tr key={s.id}>
                            <td className="reports-nowrap">{formatDate(s.session_date)}</td>
                            <td>
                              v{s.version} · {sessionTypeLabel(s.session_type)}
                              {s.status === "archived" ? <span className="reports-muted"> · Archived</span> : null}
                            </td>
                            <td>
                              {dx.length ? (
                                <ol className="reports-dx-list">
                                  {dx.map((d) => (
                                    <li key={d.rank}>
                                      <span className="reports-dx-name">{d.diagnosis}</span>
                                      <span className={`reports-lk ${likelihoodClass(d.likelihood)}`}>
                                        {d.likelihood}
                                      </span>
                                    </li>
                                  ))}
                                </ol>
                              ) : (
                                <span className="reports-muted">No ranked diagnosis</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>

                <section className="reports-section">
                  <h3 className="reports-section-title">Symptoms</h3>
                  {symptomSummary.length ? (
                    <table className="reports-table">
                      <thead>
                        <tr>
                          <th scope="col">Symptom</th>
                          <th scope="col">Sessions</th>
                          <th scope="col">First noted</th>
                          <th scope="col">Last noted</th>
                          <th scope="col">Latest session</th>
                        </tr>
                      </thead>
                      <tbody>
                        {symptomSummary.map((row) => (
                          <tr key={row.symptom}>
                            <td>{row.symptom}</td>
                            <td className="reports-nowrap">
                              {row.count} of {included.length}
                            </td>
                            <td className="reports-nowrap">{formatDate(row.first)}</td>
                            <td className="reports-nowrap">{formatDate(row.last)}</td>
                            <td>
                              {row.inLatest ? (
                                <span className="reports-tag">Present</span>
                              ) : (
                                <span className="reports-muted">Not reported</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="reports-muted">No symptoms recorded for these sessions.</p>
                  )}
                </section>

                <footer className="reports-doc-foot">
                  Decision-support output, not a diagnosis. Likelihood is a tier (High / Moderate / Low), not a
                  probability. Findings must be reviewed by a licensed clinician.
                </footer>
              </article>
            )}
          </div>
        </>
      )}
    </div>
  );
}
