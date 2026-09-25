/*
 * The shape /api/analyze returns, and what the /home page renders.
 *
 * Two engines, discriminated by `engine`:
 *   - "rule-based": the local keyword matcher (guests, and signed-in users with the flag off).
 *   - "rag": the PsychDx-RAG /diagnose response, minus `usage` (cost is never shown to
 *     clinicians). Its likelihood is a tier, not a percentage, so the two do not share a
 *     candidate shape.
 */

import type { RuleBasedResult } from "@/lib/analysis/rule-based";
import type { DiagnoseResponse, Diagnosis } from "@/lib/rag/types";

export type RagAnalysisResult = { engine: "rag" } & Omit<DiagnoseResponse, "usage">;

export type AnalysisResult = RuleBasedResult | RagAnalysisResult;

export type RagView =
  | { kind: "refused"; message: string }
  | { kind: "text"; text: string }
  | { kind: "none" }
  | { kind: "cards"; items: Diagnosis[] };

/** Which view a RAG result gets, in the order FRONTEND.md §6 requires. */
export function ragView(r: RagAnalysisResult): RagView {
  if (!r.grounding.sufficient) return { kind: "refused", message: r.diagnoses };
  if (r.diagnoses_structured === null) return { kind: "text", text: r.diagnoses };
  if (r.diagnoses_structured.length === 0) return { kind: "none" };
  return { kind: "cards", items: r.diagnoses_structured };
}
