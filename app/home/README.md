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

## Notes

The page is client-rendered and keeps analysis state locally in React state.
