/*
 * POST /api/analyze — run a differential analysis for a signed-in clinician.
 *
 * Requires a Supabase session: guests are handled entirely in the browser and must never
 * reach this route. The engine is chosen by the RAG_DIAGNOSE_ENABLED feature flag:
 *
 *   - on:  forward the symptoms to the PsychDx-RAG /diagnose endpoint (lib/rag/client.ts).
 *   - off: run the local rule-based engine, as before.
 *
 * A RAG failure is reported as an error, never silently answered by the rule-based engine —
 * the clinician must know which engine produced what they are reading.
 *
 * Symptom text is PHI-adjacent — it is never logged here, and neither are RAG 422 bodies,
 * which echo it back.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RagAnalysisResult } from "@/lib/analysis/result";
import {
  MIN_SYMPTOMS_TO_ANALYZE,
  runRuleBasedAnalysis,
  type AnalysisSymptom,
} from "@/lib/analysis/rule-based";
import { diagnoseSymptoms, RagError } from "@/lib/rag/client";
import { isRagDiagnoseEnabled } from "@/lib/rag/config";
import { RAG_LIMITS } from "@/lib/rag/types";

const ONSET_LABELS: Record<string, string> = {
  "1w": "1 week",
  "2w": "2 weeks",
  "1m": "1 month",
  "3m": "3 months",
  "6m": "6 months",
  "1y": "1 year",
  "1y+": "over 1 year",
};

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

/** One /diagnose item per symptom, with its timing details folded into the text. */
function toRagSymptom(s: AnalysisSymptom) {
  const details = [
    ONSET_LABELS[s.onset] ? `for ${ONSET_LABELS[s.onset]}` : "",
    s.frequency.replace(/_/g, " "),
    s.pattern,
  ].filter(Boolean);
  return details.length ? `${s.text} (${details.join(", ")})` : s.text;
}

async function runRag(symptoms: AnalysisSymptom[]) {
  const items = symptoms.map(toRagSymptom);
  if (items.length > RAG_LIMITS.maxSymptoms) {
    return NextResponse.json({ error: `At most ${RAG_LIMITS.maxSymptoms} symptoms.` }, { status: 400 });
  }
  if (items.some((s) => s.length > RAG_LIMITS.maxSymptomChars)) {
    return NextResponse.json(
      { error: `Each symptom, including its timing details, must be ${RAG_LIMITS.maxSymptomChars} characters or fewer.` },
      { status: 400 }
    );
  }

  try {
    const { usage: _usage, ...response } = await diagnoseSymptoms(items);
    const result: RagAnalysisResult = { engine: "rag", ...response };
    return NextResponse.json(result);
  } catch (err) {
    return ragErrorResponse(err);
  }
}

function ragErrorResponse(err: unknown) {
  if (err instanceof RagError) {
    if (err.status === 429) {
      const wait = err.retryAfterSeconds;
      return NextResponse.json(
        { error: `The diagnosis service is busy. Try again${wait ? ` in ${wait} seconds` : " shortly"}.` },
        { status: 429, headers: wait ? { "Retry-After": String(wait) } : undefined }
      );
    }
    if (err.status === 422 && Array.isArray(err.detail)) {
      const msg = err.detail[0]?.msg ?? "Invalid symptoms.";
      return NextResponse.json({ error: `The diagnosis service rejected the symptoms: ${msg}` }, { status: 400 });
    }
    // 401 means our RAG_API_KEY is wrong, not the user's fault; 5xx is an upstream failure.
    console.error("RAG /diagnose failed", { status: err.status, requestId: err.requestId });
    return NextResponse.json({ error: "The diagnosis service is unavailable. Try again." }, { status: 502 });
  }
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return NextResponse.json({ error: "The diagnosis service did not respond in time." }, { status: 504 });
  }
  console.error("RAG /diagnose failed", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "The diagnosis service is unavailable. Try again." }, { status: 502 });
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

  if (isRagDiagnoseEnabled()) return runRag(symptoms);
  return NextResponse.json(runRuleBasedAnalysis(symptoms));
}
