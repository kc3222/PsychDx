/*
 * Wire types for the PsychDx-RAG service's /diagnose endpoint (see FRONTEND.md §3).
 *
 * Types only, so both the server client (lib/rag/client.ts) and the /home page can import
 * them. `likelihood` is a tier, never a number — do not turn it into a percentage.
 */

export interface Source {
  /** First 300 characters of the retrieved DSM-5-TR chunk. */
  excerpt: string;
  /** Cosine similarity, 3 decimals. `null` when missing or exactly 0. */
  score: number | null;
}

export interface Grounding {
  /** false → the LLM was not called; `diagnoses` holds a fixed refusal message. */
  sufficient: boolean;
  best_score: number | null;
  threshold: number;
}

export type RiskCategory = "suicidality" | "self_harm" | "harm_to_others" | "psychosis_emergency";

export interface ClinicianAlert {
  triggered: boolean;
  categories: RiskCategory[];
  matched_terms: string[];
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  embedding_tokens: number;
  estimated_cost_usd: number;
}

export type Likelihood = "High" | "Moderate" | "Low";

export interface Diagnosis {
  name: string;
  likelihood: Likelihood;
  contributing_factors: string[];
  unaccounted_symptoms: string[];
  additional_information_needed: string[];
}

export interface DiagnoseResponse {
  /** Plain text: rendered diagnoses, raw model text on a parse failure, or the refusal message. */
  diagnoses: string;
  sources: Source[];
  /** 0–3 items, most likely first. `null` on refusal or unparseable output; `[]` = none supported. */
  diagnoses_structured: Diagnosis[] | null;
  grounding: Grounding;
  clinician_alert: ClinicianAlert;
  /** Fixed text. Must be displayed. */
  disclaimer: string;
  usage: Usage;
}

/** FastAPI validation error item (422). */
export interface ValidationIssue {
  type: string;
  loc: (string | number)[];
  msg: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

export interface ErrorBody {
  /** string for 401/404/429; array for 422. */
  detail: string | ValidationIssue[];
}

export const RAG_LIMITS = { maxSymptoms: 30, maxSymptomChars: 200 } as const;
