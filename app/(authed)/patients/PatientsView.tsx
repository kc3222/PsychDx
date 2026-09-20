"use client";

/*
 * Patient list rendering. Signed-in clinicians get their rows from the server component in
 * page.tsx; guests get the same shapes from the per-tab guest store instead.
 */

import Link from "next/link";
import { useIsGuest } from "@/lib/guest/provider";
import { useGuestData } from "@/lib/guest/store";
import NewPatientButton from "./NewPatientButton";
import {
  diagnosisShort,
  dxClass,
  formatAgeGender,
  formatDate,
  initials,
  sortSessionsNewestFirst,
  type PatientRow,
  type ScoreRow,
  type SessionRow,
} from "./format";

export default function PatientsView({
  patients,
  sessions,
  topScores,
  error,
}: {
  patients: PatientRow[];
  sessions: SessionRow[];
  topScores: ScoreRow[];
  error?: string | null;
}) {
  const isGuest = useIsGuest();
  const guest = useGuestData();

  const patientsList = isGuest ? guest.patients : patients;
  const sessionRows = isGuest ? guest.sessions : sessions;
  const scoreRows = isGuest ? guest.scores.filter((s) => s.rank === 1) : topScores;
  const patientCount = patientsList.length;

  if (error && !isGuest) {
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
            {error}
          </div>
        </div>
      </div>
    );
  }

  const latestSessionByPatient = new Map<string, SessionRow>();
  sortSessionsNewestFirst(sessionRows).forEach((s) => {
    if (!latestSessionByPatient.has(s.patient_id)) latestSessionByPatient.set(s.patient_id, s);
  });

  const topDxBySession = new Map<string, ScoreRow>();
  scoreRows.forEach((r) => topDxBySession.set(r.session_id, r));

  return (
    <div className="patients-view"><div className="topbar">
        <div>
          <h1 className="topbar-title">Patients</h1>
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
