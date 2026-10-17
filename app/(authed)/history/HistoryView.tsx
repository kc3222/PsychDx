"use client";

/*
 * Cross-patient analysis feed, newest first, grouped by session date.
 *
 * Signed-in clinicians get their rows from the server component in page.tsx; guests get the
 * same shapes from the per-tab guest store. Filtering is purely client-side over the rows
 * already loaded, so it behaves identically on both paths.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { blueButtonClassName } from "@/components/ui/BlueButton";
import { useIsGuest } from "@/lib/guest/provider";
import { useGuestData } from "@/lib/guest/store";
import { todayLocalDate } from "@/lib/date";
import type { Likelihood } from "@/lib/rag/types";
import {
  formatDate,
  initials,
  sessionTypeLabel,
  sortSessionsNewestFirst,
  type PatientRow,
  type ScoreRow,
  type SessionRow,
  type SymptomRow,
} from "../patients/format";

type RangeKey = "all" | "7" | "30" | "90";
type LikelihoodFilter = "all" | Likelihood;
type StatusFilter = "active" | "archived" | "all";

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

const MAX_CHIPS = 5;

// session_date is a bare "YYYY-MM-DD", so the cut-off is computed the same way and the
// two compare as strings.
function rangeCutoff(range: RangeKey) {
  if (range === "all") return null;
  const d = new Date();
  d.setDate(d.getDate() - (Number(range) - 1));
  return todayLocalDate(d);
}

function likelihoodClass(l: Likelihood) {
  if (l === "High") return "history-lk-high";
  if (l === "Moderate") return "history-lk-moderate";
  return "history-lk-low";
}

export default function HistoryView({
  patients,
  sessions,
  topScores,
  symptoms,
  error,
}: {
  patients: PatientRow[];
  sessions: SessionRow[];
  topScores: ScoreRow[];
  symptoms: SymptomRow[];
  error?: string | null;
}) {
  const isGuest = useIsGuest();
  const guest = useGuestData();

  const patientRows = isGuest ? guest.patients : patients;
  const sessionRows = isGuest ? guest.sessions : sessions;
  const scoreRows = isGuest ? guest.scores.filter((s) => s.rank === 1) : topScores;
  const symptomRows = isGuest ? guest.symptoms : symptoms;

  const [patientFilter, setPatientFilter] = useState("all");
  const [likelihoodFilter, setLikelihoodFilter] = useState<LikelihoodFilter>("all");
  const [range, setRange] = useState<RangeKey>("all");
  const [status, setStatus] = useState<StatusFilter>("active");

  const patientById = useMemo(() => new Map(patientRows.map((p) => [p.id, p])), [patientRows]);

  const topDxBySession = useMemo(() => {
    const m = new Map<string, ScoreRow>();
    scoreRows.forEach((r) => m.set(r.session_id, r));
    return m;
  }, [scoreRows]);

  const symptomsBySession = useMemo(() => {
    const m = new Map<string, string[]>();
    symptomRows.forEach((r) => {
      const arr = m.get(r.session_id) ?? [];
      if (!arr.includes(r.symptom)) arr.push(r.symptom);
      m.set(r.session_id, arr);
    });
    return m;
  }, [symptomRows]);

  // Only patients that actually have a session belong in the patient filter.
  const patientOptions = useMemo(() => {
    const ids = new Set(sessionRows.map((s) => s.patient_id));
    return patientRows
      .filter((p) => ids.has(p.id))
      .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
  }, [patientRows, sessionRows]);

  const cutoff = rangeCutoff(range);
  const visible = sortSessionsNewestFirst(sessionRows).filter((s) => {
    if (!patientById.has(s.patient_id)) return false;
    if (status !== "all" && s.status !== status) return false;
    if (patientFilter !== "all" && s.patient_id !== patientFilter) return false;
    if (cutoff && s.session_date < cutoff) return false;
    if (likelihoodFilter !== "all" && topDxBySession.get(s.id)?.likelihood !== likelihoodFilter) return false;
    return true;
  });

  const groups: { date: string; rows: SessionRow[] }[] = [];
  visible.forEach((s) => {
    const last = groups[groups.length - 1];
    if (last && last.date === s.session_date) last.rows.push(s);
    else groups.push({ date: s.session_date, rows: [s] });
  });

  const filtersActive =
    patientFilter !== "all" || likelihoodFilter !== "all" || range !== "all" || status !== "active";
  const resetFilters = () => {
    setPatientFilter("all");
    setLikelihoodFilter("all");
    setRange("all");
    setStatus("active");
  };

  const total = sessionRows.length;
  const subtitle =
    visible.length === total
      ? `${total} ${total === 1 ? "analysis" : "analyses"}`
      : `${visible.length} of ${total} analyses`;

  return (
    <div className="history-view">
      <header className="history-topbar">
        <div>
          <h1 className="history-topbar-title">History</h1>
          <p className="history-topbar-sub">{error && !isGuest ? "Past analyses across your caseload" : subtitle}</p>
        </div>
        <Link href="/home" className={blueButtonClassName("primary")}>
          + New analysis
        </Link>
      </header>

      {error && !isGuest ? (
        <div className="history-body">
          <p className="message error" role="alert">
            {error}
          </p>
        </div>
      ) : (
        <>
          <div className="history-filters" role="group" aria-label="Filter analyses">
            <label className="history-filter">
              <span>Patient</span>
              <select value={patientFilter} onChange={(e) => setPatientFilter(e.target.value)}>
                <option value="all">All patients</option>
                {patientOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.last_name}, {p.first_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="history-filter">
              <span>Date</span>
              <select value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
                {RANGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="history-filter">
              <span>Top likelihood</span>
              <select
                value={likelihoodFilter}
                onChange={(e) => setLikelihoodFilter(e.target.value as LikelihoodFilter)}
              >
                <option value="all">Any</option>
                <option value="High">High</option>
                <option value="Moderate">Moderate</option>
                <option value="Low">Low</option>
              </select>
            </label>
            <label className="history-filter">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </label>
            {filtersActive ? (
              <button type="button" className="history-reset" onClick={resetFilters}>
                Clear filters
              </button>
            ) : null}
          </div>

          <div className="history-body">
            {total === 0 ? (
              <section className="history-empty">
                <span className="history-empty-icon" aria-hidden="true">
                  <History size={22} />
                </span>
                <h2>No analyses yet</h2>
                <p>Every analysis you save against a patient shows up here, newest first.</p>
                <Link href="/home" className={blueButtonClassName("primary")}>
                  Run an analysis
                </Link>
              </section>
            ) : visible.length === 0 ? (
              <section className="history-empty">
                <h2>No analyses match these filters</h2>
                <button type="button" className={blueButtonClassName("secondary")} onClick={resetFilters}>
                  Clear filters
                </button>
              </section>
            ) : (
              groups.map((g) => (
                <section key={g.date} className="history-group">
                  <h2 className="history-group-date">
                    {g.date === todayLocalDate() ? "Today" : formatDate(g.date)}
                  </h2>
                  <ol className="history-list">
                    {g.rows.map((s) => {
                      const p = patientById.get(s.patient_id)!;
                      const topDx = topDxBySession.get(s.id);
                      const chips = symptomsBySession.get(s.id) ?? [];
                      const href = `/patients/${p.id}?tab=sessions&status=${s.status}`;
                      return (
                        <li key={s.id}>
                          <Link href={href} className="history-entry">
                            <span className="history-avatar" aria-hidden="true">
                              {initials(p.first_name, p.last_name)}
                            </span>
                            <span className="history-entry-main">
                              <span className="history-entry-head">
                                <span className="history-patient">
                                  {p.first_name} {p.last_name}
                                </span>
                                <span className="history-meta">
                                  v{s.version} · {sessionTypeLabel(s.session_type)}
                                  {s.status === "archived" ? " · Archived" : ""}
                                </span>
                              </span>
                              {chips.length ? (
                                <span className="history-chips">
                                  {chips.slice(0, MAX_CHIPS).map((c) => (
                                    <span key={c} className="history-chip">
                                      {c}
                                    </span>
                                  ))}
                                  {chips.length > MAX_CHIPS ? (
                                    <span className="history-chip history-chip-more">
                                      +{chips.length - MAX_CHIPS}
                                    </span>
                                  ) : null}
                                </span>
                              ) : null}
                            </span>
                            {topDx ? (
                              <span className="history-dx">
                                <span className="history-dx-name">{topDx.diagnosis}</span>
                                <span className={`history-lk ${likelihoodClass(topDx.likelihood)}`}>
                                  {topDx.likelihood}
                                </span>
                              </span>
                            ) : (
                              <span className="history-dx history-dx-none">No ranked diagnosis</span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
