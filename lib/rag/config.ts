/*
 * PsychDx-RAG configuration — the one place the RAG env vars are read.
 *
 *   RAG_DIAGNOSE_ENABLED  "true" routes signed-in analyses to the RAG service; anything else
 *                         (or unset) keeps the rule-based engine. Default: off.
 *   RAG_URL               Base URL of the RAG backend, no trailing slash needed.
 *                         Default: http://localhost:8000 (the local uvicorn server).
 *   RAG_API_KEY           Shared secret sent as X-API-Key. No default.
 *
 * Server files only: RAG_API_KEY must never reach the browser, so none of these carry the
 * NEXT_PUBLIC_ prefix. Values are read per call, not at module load, so the app builds and
 * runs with the flag off and the other variables unset.
 */

export const DEFAULT_RAG_URL = "http://localhost:8000";

/** Feature flag for the RAG diagnosis path. */
export function isRagDiagnoseEnabled() {
  return process.env.RAG_DIAGNOSE_ENABLED === "true";
}

/** Backend URL and key; throws when the key is missing, since every RAG call needs it. */
export function getRagConfig() {
  const url = (process.env.RAG_URL?.trim() || DEFAULT_RAG_URL).replace(/\/+$/, "");
  const apiKey = process.env.RAG_API_KEY?.trim();
  if (!apiKey) throw new Error("RAG_API_KEY must be set when RAG_DIAGNOSE_ENABLED=true");
  return { url, apiKey };
}
