/*
 * Rule-based differential scoring engine.
 *
 * This is the DSM-5-aligned keyword matcher that used to live inline in the /home page.
 * It is deliberately free of React, Supabase and `window` so both callers can share it:
 *
 *   - the browser, for guest sessions (see lib/analysis/client.ts), and
 *   - the /api/analyze route handler, for signed-in users.
 *
 * When the signed-in path swaps to an LLM, only the route handler changes; guests keep
 * running this engine locally and the result shape stays the same.
 */

export type AnalysisSymptom = {
  text: string;
  onset: string;
  frequency: string;
  pattern: string;
};

export type RiskLevel = "low" | "moderate" | "high" | "emergency";

export type AnalysisCandidate = {
  id: string;
  name: string;
  short: string;
  pct: number;
  matched: string[];
  unmatched: string[];
  criteriaCount: number;
  minCriteria: number;
};

export type AnalysisRisk = { level: RiskLevel; triggers: string[] };

export type AnalysisEngine = "rule-based" | "llm";

export type AnalysisResult = {
  engine: AnalysisEngine;
  candidates: AnalysisCandidate[];
  risk: AnalysisRisk;
};

type Disease = {
  id: "mdd" | "schiz" | "bipolar";
  name: string;
  short: string;
  minCriteria: number;
  criteria: Array<{ label: string; kw: string[] }>;
};

export const MIN_SYMPTOMS_TO_ANALYZE = 2;

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

function scoreDisease(disease: Disease, syms: AnalysisSymptom[]) {
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
  return { matched, unmatched, score };
}

export function computeRisk(syms: AnalysisSymptom[]): AnalysisRisk {
  const text = syms.map((s) => s.text).join(" ").toLowerCase();
  const e = RISK_TRIGGERS.emergency.filter((k) => text.includes(k));
  const h = RISK_TRIGGERS.high.filter((k) => text.includes(k));
  const m = RISK_TRIGGERS.moderate.filter((k) => text.includes(k));
  if (e.length) return { level: "emergency", triggers: e.slice(0, 4) };
  if (h.length) return { level: "high", triggers: h.slice(0, 4) };
  if (m.length) return { level: "moderate", triggers: m.slice(0, 4) };
  return { level: "low", triggers: [] };
}

export function runRuleBasedAnalysis(symptoms: AnalysisSymptom[]): AnalysisResult {
  const scored = DISEASES.map((disease) => ({ disease, ...scoreDisease(disease, symptoms) }));
  const total = scored.reduce((sum, r) => sum + r.score, 0);

  const candidates: AnalysisCandidate[] = scored
    .map((r) => ({
      id: r.disease.id,
      name: r.disease.name,
      short: r.disease.short,
      pct: total > 0 ? Math.round((r.score / total) * 100) : 0,
      matched: r.matched,
      unmatched: r.unmatched,
      criteriaCount: r.disease.criteria.length,
      minCriteria: r.disease.minCriteria,
    }))
    .sort((a, b) => b.pct - a.pct);

  return { engine: "rule-based", candidates, risk: computeRisk(symptoms) };
}
