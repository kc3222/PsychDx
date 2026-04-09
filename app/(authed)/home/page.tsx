"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
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
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const canAnalyze = symptoms.length >= 2;
  const analyzed = results.length > 0;
  const canSave = analyzed && !!patientId;
  const risk = useMemo(() => computeRisk(symptoms), [symptoms]);
  const top = results[0];

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
  };

  const saveAnalysisToPatient = async () => {
    if (!canSave || !patientId || savingAnalysis) return;
    setSavingAnalysis(true);
    setSaveMessage(null);
    const supabase = createClient();

    const { data: latestSession, error: latestError } = await supabase
      .from("sessions")
      .select("version")
      .eq("patient_id", patientId)
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
        patient_id: patientId,
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

    router.push(`/patients/${patientId}`);
    router.refresh();
  };

  return (
    <>
      <div className="ccc-header-row">
        <div className="ccc-title-row">
          <h2>New Analysis</h2>
          <span className="pill">DSM-5 aligned</span>
        </div>
        <span className="ccc-title-icon" aria-hidden="true">
          <ClipboardList size={22} />
        </span>
      </div>
      {patientContext ? (
        <div className="analysis-patient-context">
          Saving analysis for <strong>{patientContext.first_name} {patientContext.last_name}</strong>
        </div>
      ) : null}
      <div className="diagnose-stack">
        <section className="panel">
          <div className="panel-head">Patient symptoms</div>
          <div className="ccc-stats">
            <div className="stat-box">
              <span>Symptoms Entered</span>
              <strong>{symptoms.length}</strong>
            </div>
            <div className="stat-box">
              <span>Risk Level</span>
              <strong className={`risk-${risk.level}`}>{risk.level}</strong>
            </div>
            <div className="stat-box">
              <span>Top Match</span>
              <strong>{analyzed ? top?.disease.short : "-"}</strong>
            </div>
          </div>
          <div className="entry-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. persistent sadness for 3 weeks"
              onKeyDown={(e) => e.key === "Enter" && addSymptom()}
            />
            <button type="button" onClick={() => addSymptom()}>
              +
            </button>
          </div>
          <div className="quick-add">
            {QUICK_ADD.map((item) => (
              <button key={item} type="button" onClick={() => addSymptom(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="symptom-list">
            {symptoms.map((s, idx) => (
              <div className="symptom-card" key={`${s.text}-${idx}`}>
                <div className="symptom-line">
                  <span>{s.text}</span>
                  <div className="symptom-actions">
                    <button
                      type="button"
                      className="timeline-toggle"
                      onClick={() =>
                        setSymptoms((prev) => prev.map((x, i) => (i === idx ? { ...x, expanded: !x.expanded } : x)))
                      }
                    >
                      {s.expanded ? "-" : "+"}
                    </button>
                    <button type="button" onClick={() => setSymptoms((prev) => prev.filter((_, i) => i !== idx))}>
                      x
                    </button>
                  </div>
                </div>
                {s.expanded ? (
                  <div className="timeline-grid">
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
            ))}
          </div>
          <button className="analyze-btn" type="button" onClick={analyze} disabled={!canAnalyze}>
            {analyzed ? "Re-analyze" : "Analyze symptoms"}
          </button>
          {patientId ? (
            <button
              className="save-analysis-btn"
              type="button"
              onClick={saveAnalysisToPatient}
              disabled={!canSave || savingAnalysis}
            >
              {savingAnalysis ? "Saving..." : "Save to patient"}
            </button>
          ) : null}
          {saveMessage ? (
            <p className="message error" role="alert">
              {saveMessage}
            </p>
          ) : null}
        </section>

        <section className="panel">
          <div className="panel-head">Results</div>
          {top ? (
            <div className="summary-box">
              <div className="summary-label">Assessment</div>
              <p>
                The reported symptoms most closely match <strong>{top.disease.name}</strong>.
              </p>
              <span className="confidence-pill">
                {top.pct > 60 ? "High confidence" : top.pct > 40 ? "Moderate confidence" : "Low confidence"}
              </span>
            </div>
          ) : null}
          <div className={`risk-banner risk-${risk.level}`}>
            <strong>{risk.level} risk</strong>
            <span>
              {risk.level === "emergency"
                ? "Immediate psychiatric safety assessment recommended."
                : risk.level === "high"
                  ? "Prompt specialist evaluation recommended."
                  : risk.level === "moderate"
                    ? "Follow-up within 1-2 weeks recommended."
                    : "No major acute risk indicators detected."}
            </span>
            {risk.triggers.length ? (
              <div className="risk-trigger-row">
                {risk.triggers.map((t) => (
                  <span key={t} className="risk-trigger-chip">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="results-grid">
            {results.map((r) => (
              <article key={r.disease.id} className={`result-card ${top?.disease.id === r.disease.id ? "top" : ""}`}>
                <h4>
                  {r.disease.name} <span>{r.pct}%</span>
                </h4>
                <div className="bar">
                  <span style={{ width: `${r.pct}%` }} />
                </div>
                <p>
                  DSM-5 criteria met: {r.matched.length}/{r.disease.criteria.length}
                  {r.matched.length < r.disease.minCriteria ? <span className="minimum-badge">Below minimum</span> : null}
                </p>
                <div className="criteria-group">
                  <strong>Confirmed criteria</strong>
                  <ul>{r.matched.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
                <div className="criteria-group">
                  <strong>Missing to confirm diagnosis</strong>
                  <ul>{r.unmatched.slice(0, 4).map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

