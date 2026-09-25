/*
 * Row shapes and formatting helpers shared by the patients list and the patient detail
 * view. The types mirror the Supabase columns those views select; the guest store
 * (lib/guest/store.ts) produces structurally identical rows so one view renders both.
 */

import type { Likelihood } from "@/lib/rag/types";

export type PatientRow = {
  id: string;
  first_name: string;
  last_name: string;
  age_range: string | null;
  gender: string | null;
  status: "active" | "archived";
  created_at: string;
};

export type SessionRow = {
  id: string;
  patient_id: string;
  version: number;
  session_type: "initial_assessment" | "follow_up_evaluation";
  session_date: string;
  status: "active" | "archived";
};

export type ScoreRow = {
  session_id: string;
  diagnosis: string;
  likelihood: Likelihood;
  rank: number;
};

export type SymptomRow = {
  session_id: string;
  symptom: string;
};

export function initials(first: string, last: string) {
  const a = (first?.trim()?.[0] ?? "").toUpperCase();
  const b = (last?.trim()?.[0] ?? "").toUpperCase();
  return `${a}${b}` || "?";
}

export function formatAgeGender(p: { age_range: string | null; gender: string | null }) {
  const age = p.age_range?.trim();
  const gender = p.gender?.trim();
  if (age && gender) return `${age} · ${gender}`;
  return age || gender || "";
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// sessions.session_date is a Postgres `date`, so it arrives as a bare "YYYY-MM-DD"
// (the guest store writes the same shape). `new Date()` parses that as UTC midnight,
// which renders as the previous day for anyone behind UTC, so build those at local
// midnight instead. Full ISO timestamps (created_at) keep the default parsing.
export function formatDate(d: string | null | undefined) {
  if (!d) return "";
  const parts = DATE_ONLY_RE.exec(d);
  let dt: Date;
  if (parts) {
    const [, year, month, day] = parts.map(Number);
    dt = new Date(year, month - 1, day);
    dt.setFullYear(year);
    if (dt.getMonth() !== month - 1 || dt.getDate() !== day) return "";
  } else {
    dt = new Date(d);
  }
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function sessionTypeLabel(t: SessionRow["session_type"]) {
  return t === "follow_up_evaluation" ? "Follow-up evaluation" : "Initial assessment";
}

export function diagnosisShort(d: string) {
  const raw = d.trim();
  const map: Record<string, string> = {
    schizophrenia: "SCZ",
    "major depressive disorder": "MDD",
    depression: "MDD",
    "bipolar i": "Bipolar I",
    "generalized anxiety disorder": "GAD",
  };
  const key = raw.toLowerCase();
  return map[key] ?? raw.toUpperCase().slice(0, 6);
}

export function dxClass(short: string) {
  const s = short.trim().toUpperCase();
  if (s === "SCZ") return "dx-scz";
  if (s === "MDD") return "dx-mdd";
  if (s === "GAD") return "dx-gad";
  return "dx-default";
}

export function sortSessionsNewestFirst<T extends { session_date: string; version: number }>(rows: T[]) {
  return [...rows].sort(
    (a, b) => b.session_date.localeCompare(a.session_date) || b.version - a.version
  );
}
