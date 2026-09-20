# Home Page (`/home`)

This page is the main PsychDx clinical command center where symptoms are collected and analyzed.

## Core Functionality

- Captures patient symptoms through manual input and quick-add symptom chips.
- Lets users enrich each symptom with onset, frequency, and pattern details.
- Runs a DSM-5-aligned scoring flow against three conditions:
  - Major Depressive Disorder (MDD)
  - Bipolar I
  - Schizophrenia
- Produces ranked differential results with confidence percentages.
- Highlights matched and missing diagnostic criteria for each condition.
- Computes a risk level (`low`, `moderate`, `high`, `emergency`) from trigger phrases.
- Shows a risk banner with recommended urgency and trigger chips.
- Supports sidebar collapse/expand behavior and a sign-out action via Supabase auth.
- Saves a result as a new session against a patient (v1 initial assessment, v2+ follow-up).

## Where the analysis runs

Scoring itself lives in `lib/analysis/rule-based.ts`, and the page calls it through
`analyzeSymptoms()` in `lib/analysis/client.ts`:

- **Signed-in users** POST to `/api/analyze`, the seam that later swaps to the LLM API.
- **Guests** run the same rule-based engine locally and never call the backend.

The overview card's risk value is computed on the client as symptoms are added, so it tracks
what is typed; the risk panel under the results shows the risk the last analysis returned and
goes stale until the next re-analyze, exactly like the rankings beside it.

## Notes

The page is client-rendered and keeps analysis state locally in React state. In a guest
session the patient list, the patient banner and "Add to patient" read and write the
per-tab guest store instead of Supabase.
