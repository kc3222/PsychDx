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

type Symptom = { text: string; onset: string; frequency: string; pattern: string; expanded: boolean };
type RiskLevel = "low" | "moderate" | "high" | "emergency";
type Disease = {
  id: "mdd" | "schiz" | "bipolar";
  name: string;
  short: string;
  minCriteria: number;
  criteria: Array<{ label: string; kw: string[] }>;
};

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

const DISEASES: Disease[] = [
  {
    id: "mdd",
    name: "Major Depressive Disorder",
    short: "MDD",
    minCriteria: 5,
    criteria: [
      { label: "Depressed mood", kw: ["depressed mood", "sad", "hopeless", "low mood"] },
      { label: "Anhedonia", kw: ["anhedonia", "loss of interest", "no pleasure"] },
      { label: "Appetite/weight change", kw: ["appetite", "weight loss", "weight gain", "poor appetite"] },
      { label: "Sleep disturbance", kw: ["insomnia", "sleep disturbance", "poor sleep"] },
      { label: "Fatigue/low energy", kw: ["fatigue", "tired", "no energy", "exhausted"] },
      { label: "Worthlessness/guilt", kw: ["worthless", "guilt", "shame", "self-blame"] },
      { label: "Trouble concentrating", kw: ["concentration", "cannot think", "brain fog"] },
      { label: "Psychomotor changes", kw: ["psychomotor", "agitated", "slowed down"] },
      { label: "Thoughts of death/suicide", kw: ["suicidal", "suicide", "wants to die", "self-harm"] },
    ],
  },
  {
    id: "bipolar",
    name: "Bipolar I",
    short: "Bipolar I",
    minCriteria: 3,
    criteria: [
      { label: "Elevated/irritable mood", kw: ["mania", "manic", "euphoric", "irritable"] },
      { label: "Grandiosity", kw: ["grandiose", "grandiosity", "overconfident"] },
      { label: "Decreased need for sleep", kw: ["decreased sleep", "no sleep", "not slept"] },
      { label: "Pressured speech", kw: ["pressured speech", "rapid speech", "talking too much"] },
      { label: "Racing thoughts", kw: ["racing thoughts", "flight of ideas"] },
      { label: "Impulsive/risky behavior", kw: ["reckless", "risky behavior", "spending spree", "impulsive"] },
      { label: "Alternating depressive episodes", kw: ["depressed", "hopeless", "anhedonia"] },
    ],
  },
  {
    id: "schiz",
    name: "Schizophrenia",
    short: "SCZ",
    minCriteria: 2,
    criteria: [
      { label: "Delusions", kw: ["delusion", "delusional", "paranoid"] },
      { label: "Hallucinations", kw: ["hallucination", "hearing voices", "voices"] },
      { label: "Disorganized speech", kw: ["disorganized speech", "incoherent", "word salad"] },
      { label: "Disorganized/catatonic behavior", kw: ["catatonic", "bizarre behavior", "disorganized behavior"] },
      { label: "Negative symptoms", kw: ["flat affect", "social withdrawal", "avolition", "alogia"] },
    ],
  },
];

const RISK_TRIGGERS: Record<Exclude<RiskLevel, "low">, string[]> = {
  emergency: [
    "suicidal ideation",
    "suicidal",
    "suicide",
    "wants to die",
    "self harm",
    "self-harm",
    "command hallucination",
    "voices telling me to",
    "homicidal",
  ],
  high: [
    "delusion",
    "hallucination",
    "hearing voices",
    "psychosis",
    "hopeless",
    "bizarre behavior",
    "no sleep for days",
    "spending all money",
  ],
  moderate: [
    "social withdrawal",
    "insomnia",
    "sleep disturbance",
    "anhedonia",
    "fatigue",
    "poor concentration",
    "flat affect",
    "manic",
  ],
};

function displaySymptomLabel(text: string) {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function scoreDisease(disease: Disease, syms: Symptom[]) {
  const texts = syms.map((s) => s.text);
  const matched: string[] = [];
  const unmatched: string[] = [];
  let durationBonus = 0;

  syms.forEach((s) => {
    if (["6m", "1y", "1y+"].includes(s.onset)) durationBonus = Math.max(durationBonus, 0.08);
    else if (s.onset === "3m") durationBonus = Math.max(durationBonus, 0.04);
    else if (s.onset === "1m") durationBonus = Math.max(durationBonus, 0.02);
  });

  disease.criteria.forEach((c) => {
    const hit = c.kw.some((kw) => texts.some((t) => t.includes(kw) || kw.includes(t.split(" ")[0] ?? "")));
    if (hit) matched.push(c.label);
    else unmatched.push(c.label);
  });

  const raw = matched.length / disease.criteria.length;
  const bonus = matched.length >= disease.minCriteria ? 0.15 : 0;
  const penalty = syms.length < 4 ? -0.05 : 0;
  const score = Math.min(0.97, Math.max(0.03, raw + bonus + penalty + durationBonus));
  return { matched, unmatched, score, pct: 0 };
}

function computeRisk(syms: Symptom[]) {
  const text = syms.map((s) => s.text).join(" ").toLowerCase();
  const e = RISK_TRIGGERS.emergency.filter((k) => text.includes(k));
  const h = RISK_TRIGGERS.high.filter((k) => text.includes(k));
  const m = RISK_TRIGGERS.moderate.filter((k) => text.includes(k));
  if (e.length) return { level: "emergency" as RiskLevel, triggers: e.slice(0, 4) };
  if (h.length) return { level: "high" as RiskLevel, triggers: h.slice(0, 4) };
  if (m.length) return { level: "moderate" as RiskLevel, triggers: m.slice(0, 4) };
  return { level: "low" as RiskLevel, triggers: [] };
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

  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [input, setInput] = useState("");
  const [results, setResults] = useState<
    Array<{ disease: Disease; matched: string[]; unmatched: string[]; score: number; pct: number }>
  >([]);
  const [patientContext, setPatientContext] = useState<PatientContext | null>(null);
  const [clinicianPatients, setClinicianPatients] = useState<PatientContext[]>([]);
  const [patientsListReady, setPatientsListReady] = useState(false);
  const [patientMenuOpen, setPatientMenuOpen] = useState(false);
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [openDxId, setOpenDxId] = useState<string | null>(null);
  const addPatientWrapRef = useRef<HTMLDivElement>(null);

  const canAnalyze = symptoms.length >= 2;
  const analyzed = results.length > 0;
  const hasClinicianPatients = clinicianPatients.length > 0;

  useEffect(() => {
    if (!analyzed) setPatientMenuOpen(false);
  }, [analyzed]);
  const risk = useMemo(() => computeRisk(symptoms), [symptoms]);
  const top = results[0];

  useEffect(() => {
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
        setPatientsListReady(true);
        if (error) {
          setClinicianPatients([]);
          return;
        }
        setClinicianPatients(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!patientId) {
      setPatientContext(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("patients")
      .select("id, first_name, last_name")
      .eq("id", patientId)
      .maybeSingle<PatientContext>()
      .then(({ data }) => setPatientContext(data ?? null));
  }, [patientId]);

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

  const analyze = () => {
    if (!canAnalyze) return;
    const scored = DISEASES.map((d) => ({ disease: d, ...scoreDisease(d, symptoms) }));
    const total = scored.reduce((s, r) => s + r.score, 0);
    scored.forEach((r) => {
      r.pct = Math.round((r.score / total) * 100);
    });
    scored.sort((a, b) => b.pct - a.pct);
    setResults(scored);
    setSaveMessage(null);
    setOpenDxId(scored[0]?.disease.id ?? null);
  };

  const saveAnalysisToPatient = async (targetPatientId: string) => {
    if (!analyzed || !targetPatientId || savingAnalysis) return;
    setSavingAnalysis(true);
    setSaveMessage(null);
    setPatientMenuOpen(false);
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
      setSaveMessage(latestError.message);
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
        status: "active",
      })
      .select("id")
      .single<{ id: string }>();

    if (sessionError || !insertedSession) {
      setSavingAnalysis(false);
      setSaveMessage(sessionError?.message ?? "Could not create session.");
      return;
    }

    const sessionId = insertedSession.id;
    const scoreRows = results.map((r, idx) => ({
      session_id: sessionId,
      diagnosis: r.disease.name,
      confidence_pct: r.pct,
      rank: idx + 1,
    }));
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
      setSaveMessage(scoreError?.message ?? symptomError?.message ?? "Failed to save analysis details.");
      return;
    }

    router.push(`/patients/${targetPatientId}`);
    router.refresh();
  };

  const confidenceClass =
    top && top.pct > 60 ? "" : top && top.pct > 40 ? "moderate" : top ? "low" : "";

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
                <strong className={`risk-${risk.level}`}>{risk.level}</strong>
              </div>
              <div className="analysis-stat-card">
                <span>Top match</span>
                <strong>{analyzed && top ? top.disease.short : "—"}</strong>
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
                    <p>Add at least 2 symptoms to get started.</p>
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

          <button className="analysis-reanalyze" type="button" onClick={analyze} disabled={!canAnalyze}>
            {analyzed ? "Re-analyze" : "Analyze"}
          </button>
        </div>

        <div className="analysis-page-divider" aria-hidden />

        <div className="analysis-col analysis-col-right">
          <div className="analysis-results-head">
            <h2 className="analysis-section-label" style={{ marginBottom: 0 }}>
              Results
            </h2>
            {patientsListReady && hasClinicianPatients && analyzed ? (
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
            {!analyzed ? (
              <div className="analysis-empty-results">
                <FileSearch size={48} strokeWidth={1.15} />
                <p>Add symptoms on the left, then press Analyze.</p>
              </div>
            ) : (
              <>
                {top ? (
                  <div className="analysis-assessment-card">
                    <p className="analysis-inner-label">Assessment</p>
                    <p>
                      Most closely matches <strong>{top.disease.name}.</strong>
                    </p>
                    <span className={`analysis-confidence-badge ${confidenceClass}`.trim()}>
                      {top.pct > 60 ? "High confidence" : top.pct > 40 ? "Moderate confidence" : "Low confidence"}
                    </span>
                  </div>
                ) : null}

                <div className={`analysis-risk-panel risk-${risk.level}`}>
                  <strong>{risk.level} risk</strong>
                  <span>{riskFollowupCopy(risk.level)}</span>
                  {risk.triggers.length ? (
                    <div className="analysis-risk-chips">
                      {risk.triggers.map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <h2 className="analysis-section-label">Diagnosis</h2>
                <div className="analysis-dx-list">
                  {results.map((r) => {
                    const isTop = top?.disease.id === r.disease.id;
                    const open = openDxId === r.disease.id;
                    return (
                      <div key={r.disease.id} className={`analysis-dx-row ${isTop ? "is-top" : ""}`.trim()}>
                        <button
                          type="button"
                          className="analysis-dx-row-head"
                          onClick={() => setOpenDxId(open ? null : r.disease.id)}
                          aria-expanded={open}
                        >
                          <span className="analysis-dx-name">{r.disease.name}</span>
                          <span className="analysis-dx-pct">{r.pct}%</span>
                          <ChevronDown size={16} className={`analysis-dx-chevron ${open ? "open" : ""}`} aria-hidden />
                        </button>
                        {open ? (
                          <div className="analysis-dx-detail">
                            <div className="bar">
                              <span style={{ width: `${r.pct}%` }} />
                            </div>
                            <p style={{ margin: "0 0 0.35rem" }}>
                              DSM-5 criteria met: {r.matched.length}/{r.disease.criteria.length}
                              {r.matched.length < r.disease.minCriteria ? (
                                <span className="minimum-badge" style={{ marginLeft: 6 }}>
                                  Below minimum
                                </span>
                              ) : null}
                            </p>
                            <strong style={{ color: "#475569" }}>Confirmed criteria</strong>
                            <ul>
                              {r.matched.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                            <strong style={{ color: "#475569" }}>Missing to confirm</strong>
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

          {saveMessage ? (
            <p className="message error analysis-save-error" role="alert">
              {saveMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
