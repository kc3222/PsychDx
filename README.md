# PsychDx `index.html` Functionality Guide

This project is a **single-file web application** in `index.html` that combines UI, styles, and logic for a psychiatric clinical decision-support workflow.

## What `index.html` does

`index.html` provides an end-to-end workflow for:

- collecting patient symptom observations,
- matching symptoms against psychiatric criteria,
- estimating diagnostic likelihood across 3 disorders,
- tracking risk indicators,
- saving longitudinal patient sessions locally,
- reviewing historical analyses,
- generating a structured clinical PDF report.

The application targets:

- **Major Depression (MDD)**
- **Schizophrenia**
- **Bipolar I Disorder**

---

## Main Functional Areas

### 1. Unified Single-Page App Structure

The file contains:

- **HTML layout** (header, diagnose view, dashboard view, modals, references, footer),
- **CSS styling** (all component styling and responsive behavior),
- **JavaScript logic** (translations, auth, analysis, patient/session management, report generation).

No external build system is required to run the UI.

### 2. Internationalization (EN/VI)

The app includes a built-in translation dictionary (`TRANSLATIONS`) for English and Vietnamese.

Key capabilities:

- language switch via UI buttons,
- dynamic text replacement through `data-i18n`,
- translated placeholders and labels,
- translated runtime messages (toasts, statuses, report labels).

Core functions:

- `setLang(lang)`
- `applyTranslations()`
- `t(key, ...args)`

### 3. Authentication (Local, Device-Only)

Users can sign up/log in through modal forms.

Current implementation:

- stores user records in `localStorage`,
- encodes passwords with `btoa(...)` (obfuscation, not secure hashing),
- stores patient lists and activity under the logged-in user object.

Core functions:

- `doSignup()`
- `doLogin()`
- `loginUser(user)`
- `logout()`
- `saveUserData()`

### 4. Symptom Entry + Timeline Context

Clinicians can:

- enter custom symptoms,
- quick-add preset symptoms,
- attach timeline metadata to each symptom:
  - onset,
  - frequency,
  - pattern.

The symptom chip UI supports add/remove/edit and timeline toggles.

Core functions:

- `addSymptom(text)`
- `removeSymptom(idx)`
- `updateTimeline(idx, field, value)`
- `renderSymptoms()`

### 5. Diagnostic Scoring Pipeline

The analysis flow combines:

1. **Local heuristic scoring** using symptom-keyword matching (`scoreDisease(...)`), and
2. **AI-assisted JSON output** via `analyzeWithClaude(...)`.

After scoring:

- results are normalized/ranked,
- top diagnosis and confidence are shown,
- criteria chips and explanatory notes are rendered.

Core functions:

- `scoreDisease(disease, syms)`
- `analyzeWithClaude(syms)`
- `renderResults(localResults, ai)`

### 6. Clinical Risk Stratification

The app computes risk from:

- symptom text,
- AI red-flag output.

Risk tiers:

- low,
- moderate,
- high,
- emergency.

Core functions:

- `computeRisk(syms, aiRedFlags)`
- `buildRiskBanner(risk)`

### 7. Patient Dashboard + Session Records

Authenticated users can manage anonymized patient records:

- add patient aliases and metadata,
- save analysis sessions to a selected patient,
- view active vs archived sessions,
- search/filter patients,
- add clinical addenda,
- inspect recent activity.

Core functions:

- `refreshDashboard()`
- `saveNewPatient()`
- `confirmSave()`
- `renderPatientList(list)`
- `renderPatientDetail(p)`
- `toggleArchiveSession(patientId, si)`
- `saveAddendum(patientId, si)`

### 8. Patient Overview Modal (Longitudinal Insights)

The patient dashboard modal (`openPdash`) provides four tabs:

- **Overview**: high-level patient stats and symptom prevalence,
- **Symptom Timeline**: session-by-session symptom progression,
- **Diagnostic Evolution**: probability trends across visits,
- **Symptom Tracker**: clinician status tagging (improved/unchanged/worsened).

Core functions:

- `openPdash(patientId)`
- `switchPdashTab(tab)`
- `renderPdashTab(tab, p)`
- `setSymStatus(patientId, sym, status)`

### 9. Historical Session Replay (Read-Only)

Clinicians can open a past session and replay its full analysis context in diagnose view.

Behavior:

- restores stored symptoms and result set,
- shows a patient context banner,
- locks editing mode for read-only review,
- allows exiting back to dashboard and resetting state.

Core functions:

- `openHistoricalSession(patientId, sessionIdx)`
- `exitHistoricalView()`

### 10. Clinical PDF Report Generation

The app uses jsPDF (CDN) to generate a downloadable report that includes:

- clinician and patient context,
- risk level,
- primary impression,
- symptom/timeline summary,
- differential diagnosis section,
- follow-up clinical questions,
- recommended next steps,
- urgent concerns (when present),
- footer disclaimers/references.

Core function:

- `generateClinicalReport()`

---

## Data Storage Model

All persistent app data is stored in browser `localStorage`.

Stored entities include:

- clinician user profile,
- patient list,
- session records (diagnoses, symptoms, notes, addenda),
- activity feed.

There is no backend database in this file.

## External Dependencies / Integrations

`index.html` references:

- **jsPDF** from CDN for report export.
- **Anthropic Messages API endpoint** in `analyzeWithClaude(...)` for AI-assisted outputs.

## Compliance + Clinical Guardrails in UI

The interface includes:

- explicit “decision-support only” messaging,
- references to DSM/ICD/NICE-aligned logic text,
- de-identified patient input guidance,
- compliance-oriented copy for Vietnam privacy regulations.

---

## At-a-Glance Technical Summary

- **Architecture:** Single-file SPA (`index.html`)
- **Frontend stack:** Vanilla HTML/CSS/JS
- **Persistence:** Browser `localStorage`
- **Languages:** English + Vietnamese
- **Major modules:** I18N, auth, symptom capture, analysis, risk, patient records, historical replay, PDF export
