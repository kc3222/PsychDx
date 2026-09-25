# Analyze Route (`/api/analyze`)

Runs a differential analysis for a signed-in clinician.

## Core Functionality

- Exposes a `POST` handler that requires a Supabase session; returns `401` without one.
- Validates the body as `{ symptoms: Array<{ text, onset?, frequency?, pattern? }> }`,
  lowercases and trims each `text`, and drops entries without one. Returns `400` when
  fewer than two usable symptoms remain.
- Picks the engine from the `RAG_DIAGNOSE_ENABLED` feature flag (server env):
  - **On (`true`)** — forwards the symptoms to the PsychDx-RAG `/diagnose` endpoint via
    `lib/rag/client.ts` (needs `RAG_API_KEY`; `RAG_URL` defaults to `http://localhost:8000`).
    The flag and both settings are read in `lib/rag/config.ts`. Each symptom's onset,
    frequency and pattern are folded into its text, e.g. `insomnia (for 2 weeks, daily)`.
    Returns `{ engine: "rag", ...DiagnoseResponse }` without `usage`. Rejects more than 30
    symptoms or any item over 200 characters with `400` before calling the service.
  - **Off (anything else, the default)** — returns `{ engine: "rule-based", candidates, risk }`
    from `lib/analysis/rule-based.ts`.

The response type is `AnalysisResult` in `lib/analysis/result.ts`.

## RAG errors

A RAG failure is returned as an error; the route never silently falls back to the
rule-based engine, so the clinician always knows which engine produced a result.

| RAG status | Returned | Notes |
| --- | --- | --- |
| `429` | `429` + `Retry-After` | Shared rate limit across the whole app |
| `422` | `400` | First validation message only; the body echoes symptom text and is not logged |
| `401`, `5xx`, other | `502` | Logged with status and `X-Request-ID` only |
| timeout (90 s) | `504` | |
| missing `RAG_API_KEY` | `502` | Logged |

## Usage Context

Signed-in users reach this route through `analyzeSymptoms()` in `lib/analysis/client.ts`;
guests never do — they run the rule-based engine in the browser, since they have no session
and nothing they type should leave the tab. The flag therefore has no effect on guests.

Symptom text is PHI-adjacent and is never logged here.
