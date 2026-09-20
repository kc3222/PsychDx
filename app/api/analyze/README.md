# Analyze Route (`/api/analyze`)

Runs a differential analysis for a signed-in clinician.

## Core Functionality

- Exposes a `POST` handler that requires a Supabase session; returns `401` without one.
- Validates the body as `{ symptoms: Array<{ text, onset?, frequency?, pattern? }> }`,
  lowercases and trims each `text`, and drops entries without one. Returns `400` when
  fewer than two usable symptoms remain.
- Returns `{ engine, candidates, risk }` from `lib/analysis/rule-based.ts`.

## Usage Context

This is the seam between the two analysis paths. Signed-in users reach it through
`analyzeSymptoms()` in `lib/analysis/client.ts`; guests never do — they run the same engine
in the browser, since they have no session and nothing they type should leave the tab.

Swapping the rule-based engine for the LLM API means changing this handler only: the
request and response shapes stay as they are, and the guest path is unaffected.

Symptom text is PHI-adjacent and is never logged here.
