"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FileSearch,
  FileText,
  MoreHorizontal,
  UserPlus,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { analyzeSymptoms } from "@/lib/analysis/client";
import { todayLocalDate } from "@/lib/date";
import { ragView, type AnalysisResult } from "@/lib/analysis/result";
import {
  computeRisk,
  MIN_SYMPTOMS_TO_ANALYZE,
  type AnalysisSymptom,
  type RiskLevel,
} from "@/lib/analysis/rule-based";
import { useIsGuest } from "@/lib/guest/provider";
import { saveGuestAnalysis, useGuestData } from "@/lib/guest/store";
import { LIKELIHOOD_CLASS, ragRowId, RagResults } from "./RagResults";

type Symptom = AnalysisSymptom & { expanded: boolean };

type PatientContext = {
  id: string;
  first_name: string;
  last_name: string;
};

const QUICK_ADD = [
  "Depressed mood",
  "Anhedonia",
  "Insomnia",
  "Fatigue",
  "Hearing voices",
  "Paranoid delusions",
  "Social withdrawal",
  "Manic episode",
  "Racing thoughts",
  "Suicidal ideation",
  "Flat affect",
  "Poor appetite",
  "Grandiosity",
  "Pressured speech",
];

function displaySymptomLabel(text: string) {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function riskFollowupCopy(level: RiskLevel) {
  if (level === "emergency") return "Immediate psychiatric safety assessment recommended.";
  if (level === "high") return "Prompt specialist evaluation recommended.";
  if (level === "moderate") return "Follow-up within 1–2 weeks recommended.";
  return "No major acute risk indicators detected.";
}

export default function DiagnosePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");
  const isGuest = useIsGuest();
  const guest = useGuestData();

  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [input, setInput] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [remotePatients, setRemotePatients] = useState<PatientContext[]>([]);
  const [remotePatientsReady, setRemotePatientsReady] = useState(false);
  const [remotePatientContext, setRemotePatientContext] = useState<PatientContext | null>(null);
  const [patientMenuOpen, setPatientMenuOpen] = useState(false);
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openDxId, setOpenDxId] = useState<string | null>(null);
  const addPatientWrapRef = useRef<HTMLDivElement>(null);

  const canAnalyze = symptoms.length >= MIN_SYMPTOMS_TO_ANALYZE;
  const analyzed = analysis !== null;
  const results = analysis?.engine === "rule-based" ? analysis.candidates : [];
  const top = results[0];
  const ragResultView = analysis?.engine === "rag" ? ragView(analysis) : null;
  const ragDiagnoses = ragResultView?.kind === "cards" ? ragResultView.items : [];
  const topMatchLabel = top?.short ?? ragDiagnoses[0]?.name ?? "—";
  // Only a result with ranked candidates can become a patient session.
  const canSave = results.length > 0 || ragDiagnoses.length > 0;

  const clinicianPatients = isGuest ? guest.patients : remotePatients;
  const patientsListReady = isGuest ? true : remotePatientsReady;
  const hasClinicianPatients = clinicianPatients.length > 0;
  const patientContext = isGuest
    ? guest.patients.find((p) => p.id === patientId) ?? null
    : remotePatientContext;

  useEffect(() => {
    if (!analyzed) setPatientMenuOpen(false);
  }, [analyzed]);

  // Live triage hint for the overview card: it tracks what is typed, while the risk panel
  // below shows the risk the last analysis returned.
  const liveRisk = useMemo(() => computeRisk(symptoms), [symptoms]);

  useEffect(() => {
    if (isGuest) return;
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("patients")
      .select("id, first_name, last_name")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .returns<PatientContext[]>()
      .then(({ data, error }) => {
        if (cancelled) return;
        setRemotePatientsReady(true);
        if (error) {
          setRemotePatients([]);
          return;
        }
        setRemotePatients(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [isGuest]);

  useEffect(() => {
    if (isGuest) return;
    if (!patientId) {
      setRemotePatientContext(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("patients")
      .select("id, first_name, last_name")
      .eq("id", patientId)
      .maybeSingle<PatientContext>()
      .then(({ data }) => setRemotePatientContext(data ?? null));
  }, [isGuest, patientId]);

  useEffect(() => {
    if (!patientMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (addPatientWrapRef.current?.contains(e.target as Node)) return;
      setPatientMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPatientMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [patientMenuOpen]);

  const addSymptom = (text?: string) => {
    const value = (text ?? input).trim().toLowerCase();
    if (!value) return;
    if (symptoms.some((s) => s.text === value)) {
      setInput("");
      return;
    }
    setSymptoms((prev) => [...prev, { text: value, onset: "", frequency: "", pattern: "", expanded: false }]);
    setInput("");
  };

  const analyze = async () => {
    if (!canAnalyze || analyzing) return;
    setAnalyzing(true);
    setNotice(null);
    try {
      const result = await analyzeSymptoms(
        symptoms.map(({ text, onset, frequency, pattern }) => ({ text, onset, frequency, pattern })),
        { guest: isGuest }
      );
      setAnalysis(result);
      setOpenDxId(result.engine === "rule-based" ? result.candidates[0]?.id ?? null : ragRowId(0));
    } catch (err) {
      setAnalysis(null);
      setNotice(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const saveAnalysisToPatient = async (targetPatientId: string) => {
    if (!analysis || !canSave || !targetPatientId || savingAnalysis) return;
    setSavingAnalysis(true);
    setNotice(null);
    setPatientMenuOpen(false);

    // Guests always run the rule-based engine, so their results always carry candidates.
    if (isGuest && analysis.engine === "rule-based") {
      saveGuestAnalysis({
        patientId: targetPatientId,
        candidates: analysis.candidates,
        symptoms: symptoms.map((s) => s.text),
      });
      setSavingAnalysis(false);
      router.push(`/patients/${targetPatientId}`);
      return;
    }

    const supabase = createClient();

    const { data: latestSession, error: latestError } = await supabase
      .from("sessions")
      .select("version")
      .eq("patient_id", targetPatientId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle<{ version: number }>();

    if (latestError) {
      setSavingAnalysis(false);
      setNotice(latestError.message);
      return;
    }

    const nextVersion = (latestSession?.version ?? 0) + 1;
    const sessionType = nextVersion === 1 ? "initial_assessment" : "follow_up_evaluation";

    const { data: insertedSession, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        patient_id: targetPatientId,
        version: nextVersion,
        session_type: sessionType,
        // Sent explicitly rather than left to the column's `default current_date`, which
        // the database evaluates in UTC and so dates evening sessions to tomorrow.
        session_date: todayLocalDate(),
        status: "active",
      })
      .select("id")
      .single<{ id: string }>();

    if (sessionError || !insertedSession) {
      setSavingAnalysis(false);
      setNotice(sessionError?.message ?? "Could not create session.");
      return;
    }

    const sessionId = insertedSession.id;
    const scoreRows = (analysis.engine === "rule-based" ? analysis.candidates : ragDiagnoses).map(
      (c, idx) => ({
        session_id: sessionId,
        diagnosis: c.name,
        likelihood: c.likelihood,
        rank: idx + 1,
      })
    );
    const symptomRows = symptoms.map((s) => ({
      session_id: sessionId,
      symptom: s.text,
    }));

    const [{ error: scoreError }, { error: symptomError }] = await Promise.all([
      supabase.from("diagnostic_scores").insert(scoreRows),
      symptomRows.length ? supabase.from("session_symptoms").insert(symptomRows) : Promise.resolve({ error: null }),
    ]);

    setSavingAnalysis(false);
    if (scoreError || symptomError) {
      setNotice(scoreError?.message ?? symptomError?.message ?? "Failed to save analysis details.");
      return;
    }

    router.push(`/patients/${targetPatientId}`);
    router.refresh();
  };

  return (
    <div className="analysis-page">
      <header className="analysis-page-header">
        <div className="analysis-page-title-row">
          <h1 className="analysis-page-title">New Analysis</h1>
          <span className="analysis-page-badge">DSM-5 aligned</span>
        </div>
        <button type="button" className="analysis-page-menu" aria-label="More options">
          <MoreHorizontal size={18} strokeWidth={2} />
        </button>
      </header>

      {patientContext ? (
        <p className="analysis-patient-banner">
          Saving analysis for{" "}
          <strong>
            {patientContext.first_name} {patientContext.last_name}
          </strong>
        </p>
      ) : null}

      <div className="analysis-page-body">
        <div className="analysis-col analysis-col-left">
          <div className="analysis-left-fixed">
            <h2 className="analysis-section-label">Overview</h2>
            <div className="analysis-overview-row">
              <div className="analysis-stat-card">
                <span>Symptoms</span>
                <strong>{symptoms.length}</strong>
              </div>
              <div className="analysis-stat-card">
                <span>Risk</span>
                <strong className={`risk-${liveRisk.level}`}>{liveRisk.level}</strong>
              </div>
              <div className="analysis-stat-card">
                <span>Top match</span>
                <strong>{topMatchLabel}</strong>
              </div>
            </div>

            <h2 className="analysis-section-label analysis-section-label-spaced">Add symptom</h2>
            <div className="analysis-add-row">
              <input
                className="analysis-add-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. persistent sadness for 3 weeks"
                onKeyDown={(e) => e.key === "Enter" && addSymptom()}
              />
              <button type="button" className="analysis-add-btn" onClick={() => addSymptom()} aria-label="Add symptom">
                +
              </button>
            </div>
          </div>

          <div className="analysis-left-split">
            <div className="analysis-left-pane analysis-left-pane-quick">
              <h2 className="analysis-section-label analysis-section-label-spaced">Quick add</h2>
              <div className="analysis-quick-add">
                {QUICK_ADD.map((item) => {
                  const key = item.toLowerCase();
                  const isActive = symptoms.some((s) => s.text === key);
                  return (
                    <button
                      key={item}
                      type="button"
                      className={isActive ? "is-active" : undefined}
                      onClick={() => addSymptom(item)}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="analysis-left-pane analysis-left-pane-active">
              <h2 className="analysis-section-label analysis-section-label-spaced">Active symptoms</h2>
              <div className="analysis-active-list">
                {symptoms.length === 0 ? (
                  <div className="analysis-empty-hint">
                    <FileText size={40} strokeWidth={1.25} />
                    <p>Add at least {MIN_SYMPTOMS_TO_ANALYZE} symptoms to get started.</p>
                  </div>
                ) : (
                  symptoms.map((s, idx) => (
                    <div key={`${s.text}-${idx}`}>
                      <div className="analysis-symptom-item">
                        <span>{displaySymptomLabel(s.text)}</span>
                        <button
                          type="button"
                          className="analysis-symptom-expand"
                          aria-expanded={s.expanded}
                          aria-label={s.expanded ? "Hide timing details" : "Timing and pattern"}
                          onClick={() =>
                            setSymptoms((prev) => prev.map((x, i) => (i === idx ? { ...x, expanded: !x.expanded } : x)))
                          }
                        >
                          <ChevronDown size={16} className={`analysis-dx-chevron ${s.expanded ? "open" : ""}`} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="analysis-symptom-remove"
                          aria-label="Remove symptom"
                          onClick={() => setSymptoms((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          ×
                        </button>
                      </div>
                      {s.expanded ? (
                        <div className="analysis-symptom-meta">
                          <select
                            value={s.onset}
                            onChange={(e) =>
                              setSymptoms((prev) => prev.map((x, i) => (i === idx ? { ...x, onset: e.target.value } : x)))
                            }
                          >
                            <option value="">Onset</option>
                            <option value="1w">1 week</option>
                            <option value="2w">2 weeks</option>
                            <option value="1m">1 month</option>
                            <option value="3m">3 months</option>
                            <option value="6m">6 months</option>
                            <option value="1y">1 year</option>
                            <option value="1y+">&gt;1 year</option>
                          </select>
                          <select
                            value={s.frequency}
                            onChange={(e) =>
                              setSymptoms((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, frequency: e.target.value } : x))
                              )
                            }
                          >
                            <option value="">Frequency</option>
                            <option value="daily">Daily</option>
                            <option value="most_days">Most days</option>
                            <option value="weekly">Weekly</option>
                            <option value="occasional">Occasional</option>
                          </select>
                          <select
                            value={s.pattern}
                            onChange={(e) =>
                              setSymptoms((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, pattern: e.target.value } : x))
                              )
                            }
                          >
                            <option value="">Pattern</option>
                            <option value="continuous">Continuous</option>
                            <option value="episodic">Episodic</option>
                            <option value="worsening">Worsening</option>
                            <option value="improving">Improving</option>
                          </select>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <button className="analysis-reanalyze" type="button" onClick={analyze} disabled={!canAnalyze || analyzing}>
            {analyzing ? "Analyzing…" : analyzed ? "Re-analyze" : "Analyze"}
          </button>
        </div>

        <div className="analysis-page-divider" aria-hidden />

        <div className="analysis-col analysis-col-right">
          <div className="analysis-results-head">
            <h2 className="analysis-section-label" style={{ marginBottom: 0 }}>
              Results
            </h2>
            {analysis ? (
              <span className="analysis-engine-tag">
                {analysis.engine === "rule-based" ? "Rule-based" : "DSM-5-TR RAG"}
                {isGuest ? " · guest" : ""}
              </span>
            ) : null}
            {patientsListReady && hasClinicianPatients && canSave ? (
              <div className="analysis-add-patient-wrap" ref={addPatientWrapRef}>
                <button
                  type="button"
                  className="analysis-add-patient"
                  disabled={savingAnalysis}
                  aria-expanded={patientMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Add analysis to a patient"
                  onClick={() => setPatientMenuOpen((o) => !o)}
                >
                  <UserPlus size={14} strokeWidth={2} aria-hidden />
                  {savingAnalysis ? "Saving…" : "Add to patient"}
                  <ChevronDown size={14} strokeWidth={2} className="analysis-add-patient-chevron" aria-hidden />
                </button>
                {patientMenuOpen ? (
                  <ul className="analysis-patient-dropdown" role="listbox" aria-label="Choose patient">
                    {clinicianPatients.map((p) => (
                      <li key={p.id} role="none">
                        <button
                          type="button"
                          role="option"
                          disabled={savingAnalysis}
                          onClick={() => saveAnalysisToPatient(p.id)}
                        >
                          {p.first_name} {p.last_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="analysis-results-scroll">
            {!analysis ? (
              <div className="analysis-empty-results">
                <FileSearch size={48} strokeWidth={1.15} />
                <p>Add symptoms on the left, then press Analyze.</p>
              </div>
            ) : analysis.engine === "rag" ? (
              <RagResults result={analysis} openDxId={openDxId} onToggleDx={setOpenDxId} />
            ) : (
              <>
                {top ? (
                  <div className="analysis-assessment-card">
                    <p className="analysis-inner-label">Assessment</p>
                    <p>
                      Most closely matches <strong>{top.name}.</strong>
                    </p>
                    <span className={`analysis-dx-tier ${LIKELIHOOD_CLASS[top.likelihood]}`}>
                      {top.likelihood} likelihood
                    </span>
                  </div>
                ) : null}

                <div className={`analysis-risk-panel risk-${analysis.risk.level}`}>
                  <strong>{analysis.risk.level} risk</strong>
                  <span>{riskFollowupCopy(analysis.risk.level)}</span>
                  {analysis.risk.triggers.length ? (
                    <div className="analysis-risk-chips">
                      {analysis.risk.triggers.map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <h2 className="analysis-section-label">Diagnosis</h2>
                <div className="analysis-dx-list">
                  {results.map((r) => {
                    const isTop = top?.id === r.id;
                    const open = openDxId === r.id;
                    return (
                      <div key={r.id} className={`analysis-dx-row ${isTop ? "is-top" : ""}`.trim()}>
                        <button
                          type="button"
                          className="analysis-dx-row-head"
                          onClick={() => setOpenDxId(open ? null : r.id)}
                          aria-expanded={open}
                        >
                          <span className="analysis-dx-name">{r.name}</span>
                          <span className={`analysis-dx-tier ${LIKELIHOOD_CLASS[r.likelihood]}`}>
                            {r.likelihood}
                          </span>
                          <ChevronDown size={16} className={`analysis-dx-chevron ${open ? "open" : ""}`} aria-hidden />
                        </button>
                        {open ? (
                          <div className="analysis-dx-detail">
                            <p style={{ margin: "0.5rem 0 0.35rem" }}>
                              DSM-5 criteria met: {r.matched.length}/{r.criteriaCount}
                              {r.matched.length < r.minCriteria ? (
                                <span className="minimum-badge" style={{ marginLeft: 6 }}>
                                  Below minimum
                                </span>
                              ) : null}
                            </p>
                            <strong style={{ color: "var(--text-3)" }}>Confirmed criteria</strong>
                            <ul>
                              {r.matched.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                            <strong style={{ color: "var(--text-3)" }}>Missing to confirm</strong>
                            <ul>
                              {r.unmatched.slice(0, 4).map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {notice ? (
            <p className="message error analysis-save-error" role="alert">
              {notice}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
