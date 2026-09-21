"use client";

/*
 * Ephemeral store backing guest sessions.
 *
 * Guests exercise the whole app — patients, analyses, session history — without writing a
 * single row to Supabase. Everything lives in sessionStorage, which is per-tab and is
 * dropped by the browser when the tab closes, so a guest workspace wipes itself with no
 * cleanup job. Rows mirror the shapes of the `patients`, `sessions`, `diagnostic_scores`
 * and `session_symptoms` tables so the same view components render both paths.
 *
 * Reads go through `useGuestData()`, which renders empty on the server and re-renders with
 * the tab's data after hydration.
 */

import { useSyncExternalStore } from "react";
import type { AnalysisCandidate } from "@/lib/analysis/rule-based";
import { todayLocalDate } from "@/lib/date";

export type GuestPatientRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  age_range: string | null;
  gender: string | null;
  patient_ref_id: string | null;
  initial_notes: string | null;
  status: "active" | "archived";
  created_at: string;
};

export type GuestSessionRow = {
  id: string;
  patient_id: string;
  version: number;
  session_type: "initial_assessment" | "follow_up_evaluation";
  session_date: string;
  status: "active" | "archived";
  created_at: string;
};

export type GuestScoreRow = {
  session_id: string;
  diagnosis: string;
  confidence_pct: number;
  rank: number;
};

export type GuestSymptomRow = {
  session_id: string;
  symptom: string;
};

export type GuestData = {
  patients: GuestPatientRow[];
  sessions: GuestSessionRow[];
  scores: GuestScoreRow[];
  symptoms: GuestSymptomRow[];
};

const STORAGE_KEY = "psychdx.guest.data";
const EMPTY: GuestData = { patients: [], sessions: [], scores: [], symptoms: [] };

let cache: GuestData | null = null;
const listeners = new Set<() => void>();

function read(): GuestData {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<GuestData>) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: GuestData) {
  cache = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private-mode or quota failure: the tab keeps working off the in-memory cache.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useGuestData(): GuestData {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export type NewGuestPatient = {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  age_range: string | null;
  gender: string | null;
  patient_ref_id: string | null;
  initial_notes: string | null;
};

export function addGuestPatient(input: NewGuestPatient): GuestPatientRow {
  const data = read();
  const patient: GuestPatientRow = {
    ...input,
    id: newId(),
    status: "active",
    created_at: new Date().toISOString(),
  };
  write({ ...data, patients: [patient, ...data.patients] });
  return patient;
}

export function saveGuestAnalysis({
  patientId,
  candidates,
  symptoms,
}: {
  patientId: string;
  candidates: AnalysisCandidate[];
  symptoms: string[];
}): GuestSessionRow {
  const data = read();
  const versions = data.sessions.filter((s) => s.patient_id === patientId).map((s) => s.version);
  const version = (versions.length ? Math.max(...versions) : 0) + 1;

  const session: GuestSessionRow = {
    id: newId(),
    patient_id: patientId,
    version,
    session_type: version === 1 ? "initial_assessment" : "follow_up_evaluation",
    session_date: todayLocalDate(),
    status: "active",
    created_at: new Date().toISOString(),
  };

  write({
    ...data,
    sessions: [session, ...data.sessions],
    scores: [
      ...data.scores,
      ...candidates.map((c, idx) => ({
        session_id: session.id,
        diagnosis: c.name,
        confidence_pct: c.pct,
        rank: idx + 1,
      })),
    ],
    symptoms: [
      ...data.symptoms,
      ...symptoms.map((symptom) => ({ session_id: session.id, symptom })),
    ],
  });

  return session;
}

export function clearGuestData() {
  cache = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
  listeners.forEach((listener) => listener());
}
