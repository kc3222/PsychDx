/*
 * Browser-side entry point for running an analysis.
 *
 * Guest sessions run the rule-based engine locally and never touch the backend — a guest
 * has no Supabase session, so /api/analyze would reject them anyway, and nothing a guest
 * types should leave the tab. Signed-in users POST to /api/analyze, which is the single
 * place that later swaps from the rule-based engine to the LLM API.
 */

import {
  runRuleBasedAnalysis,
  type AnalysisResult,
  type AnalysisSymptom,
} from "@/lib/analysis/rule-based";

export async function analyzeSymptoms(
  symptoms: AnalysisSymptom[],
  { guest }: { guest: boolean }
): Promise<AnalysisResult> {
  if (guest) return runRuleBasedAnalysis(symptoms);

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symptoms }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (AnalysisResult & { error?: string })
    | null;

  if (!response.ok || !payload?.candidates) {
    throw new Error(payload?.error ?? `Analysis failed (${response.status}).`);
  }

  return payload;
}
