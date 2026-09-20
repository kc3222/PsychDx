/*
 * POST /api/analyze — run a differential analysis for a signed-in clinician.
 *
 * Requires a Supabase session: guests are handled entirely in the browser and must never
 * reach this route. The scoring is still the rule-based engine; this handler is the seam
 * where that is replaced by the LLM API, so callers keep the same request/response shape.
 *
 * Symptom text is PHI-adjacent — it is never logged here.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MIN_SYMPTOMS_TO_ANALYZE,
  runRuleBasedAnalysis,
  type AnalysisSymptom,
} from "@/lib/analysis/rule-based";

function toSymptom(value: unknown): AnalysisSymptom | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const text = typeof raw.text === "string" ? raw.text.trim().toLowerCase() : "";
  if (!text) return null;
  return {
    text,
    onset: typeof raw.onset === "string" ? raw.onset : "",
    frequency: typeof raw.frequency === "string" ? raw.frequency : "",
    pattern: typeof raw.pattern === "string" ? raw.pattern : "",
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { symptoms?: unknown } | null;
  if (!body || !Array.isArray(body.symptoms)) {
    return NextResponse.json({ error: "Expected a symptoms array." }, { status: 400 });
  }

  const symptoms = body.symptoms.map(toSymptom).filter((s): s is AnalysisSymptom => s !== null);
  if (symptoms.length < MIN_SYMPTOMS_TO_ANALYZE) {
    return NextResponse.json(
      { error: `At least ${MIN_SYMPTOMS_TO_ANALYZE} symptoms are required.` },
      { status: 400 }
    );
  }

  return NextResponse.json(runRuleBasedAnalysis(symptoms));
}
