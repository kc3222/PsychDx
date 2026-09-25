# Home Page (`/home`)

This page is the main PsychDx clinical command center where symptoms are collected and analyzed.

## Core Functionality

- Captures patient symptoms through manual input and quick-add symptom chips.
- Lets users enrich each symptom with onset, frequency, and pattern details.
- Runs an analysis through the RAG service or, when its flag is off, a DSM-5-aligned
  rule-based scoring flow against three conditions:
  - Major Depressive Disorder (MDD)
  - Bipolar I
  - Schizophrenia
- Produces ranked differential results, each with a High / Moderate / Low likelihood tier
  (both engines use the same scale; there are no percentages).
- Highlights matched and missing diagnostic criteria for each condition.
- Computes a risk level (`low`, `moderate`, `high`, `emergency`) from trigger phrases.
- Shows a risk banner with recommended urgency and trigger chips.
- Supports sidebar collapse/expand behavior and a sign-out action via Supabase auth.
- Saves a result as a new session against a patient (v1 initial assessment, v2+ follow-up).

## Where the analysis runs

The page calls `analyzeSymptoms()` in `lib/analysis/client.ts`:

- **Signed-in users** POST to `/api/analyze`, which uses the PsychDx-RAG service when
  `RAG_DIAGNOSE_ENABLED=true` and the rule-based engine (`lib/analysis/rule-based.ts`)
  otherwise.
- **Guests** always run the rule-based engine locally and never call the backend.

The results header tags which engine produced the result.

## RAG results

`RagResults.tsx` renders an `engine: "rag"` result, following the safety rules in
`FRONTEND.md` §6:

- A **clinician review** banner sits above everything when `clinician_alert.triggered`.
- A grounding refusal shows a neutral "no matching reference material" note and no
  candidates; unparseable model output is shown as plain text; an empty list says the
  reference material supports no diagnosis.
- Candidates show a **High / Moderate / Low** tier badge, never a percentage or bar, with
  contributing factors, unaccounted symptoms and information needed when expanded.
- The service's disclaimer is always shown, with a collapsible list of DSM-5-TR sources.

"Add to patient" appears only when there are candidates to save. Candidates from either
engine are saved to `diagnostic_scores.likelihood` (migration V4).

The overview card's risk value is computed on the client as symptoms are added, so it tracks
what is typed; the risk panel under the results shows the risk the last analysis returned and
goes stale until the next re-analyze, exactly like the rankings beside it.

## Notes

The page is client-rendered and keeps analysis state locally in React state. In a guest
session the patient list, the patient banner and "Add to patient" read and write the
per-tab guest store instead of Supabase.
