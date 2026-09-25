/*
 * Results panel for a PsychDx-RAG analysis (engine "rag").
 *
 * FRONTEND.md §6 rules, which are safety requirements: the clinician alert sits above
 * everything and is checked on every response, a grounding refusal is a neutral state and
 * shows no candidates, likelihood stays a tier (never a percentage or a bar), LLM text is
 * rendered as plain text, and the disclaimer is always visible.
 */

import { ChevronDown } from "lucide-react";
import { ragView, type RagAnalysisResult } from "@/lib/analysis/result";
import type { Diagnosis, Likelihood, RiskCategory } from "@/lib/rag/types";

const ALERT_LABELS: Record<RiskCategory, string> = {
  suicidality: "Suicide risk mentioned",
  self_harm: "Self-harm mentioned",
  harm_to_others: "Risk of harm to others mentioned",
  psychosis_emergency: "Possible psychiatric emergency",
};

/** Tier badge modifier for `.analysis-dx-tier`; the rule-based results reuse it. */
export const LIKELIHOOD_CLASS: Record<Likelihood, string> = {
  High: "tier-high",
  Moderate: "tier-moderate",
  Low: "tier-low",
};

export const ragRowId = (idx: number) => `rag-${idx}`;

function DetailList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <>
      <strong className="analysis-dx-detail-label">{label}</strong>
      <ul>
        {items.map((item, i) => (
          <li key={`${i}-${item}`}>{item}</li>
        ))}
      </ul>
    </>
  );
}

function DiagnosisRow({
  dx,
  id,
  isTop,
  open,
  onToggle,
}: {
  dx: Diagnosis;
  id: string;
  isTop: boolean;
  open: boolean;
  onToggle: (id: string | null) => void;
}) {
  return (
    <div className={`analysis-dx-row ${isTop ? "is-top" : ""}`.trim()}>
      <button
        type="button"
        className="analysis-dx-row-head"
        onClick={() => onToggle(open ? null : id)}
        aria-expanded={open}
      >
        <span className="analysis-dx-name">{dx.name}</span>
        <span className={`analysis-dx-tier ${LIKELIHOOD_CLASS[dx.likelihood]}`}>{dx.likelihood}</span>
        <ChevronDown size={16} className={`analysis-dx-chevron ${open ? "open" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="analysis-dx-detail">
          <DetailList label="Contributing factors" items={dx.contributing_factors} />
          <DetailList label="Symptoms not accounted for" items={dx.unaccounted_symptoms} />
          <DetailList label="Additional information needed" items={dx.additional_information_needed} />
        </div>
      ) : null}
    </div>
  );
}

export function RagResults({
  result,
  openDxId,
  onToggleDx,
}: {
  result: RagAnalysisResult;
  openDxId: string | null;
  onToggleDx: (id: string | null) => void;
}) {
  const view = ragView(result);
  const alert = result.clinician_alert;

  return (
    <>
      {alert.triggered ? (
        <div className="analysis-alert-banner" role="alert">
          <strong>Clinician review needed</strong>
          <span>
            The symptoms mention topics that call for a safety review. This is a phrase match, not a
            risk assessment.
          </span>
          <div className="analysis-risk-chips">
            {alert.categories.map((c) => (
              <span key={c}>{ALERT_LABELS[c] ?? c}</span>
            ))}
          </div>
        </div>
      ) : null}

      {view.kind === "refused" ? (
        <div className="analysis-rag-note">
          <strong>No matching reference material</strong>
          <p className="analysis-rag-text">{view.message}</p>
          <span>Try rephrasing the symptoms in clinical terms.</span>
        </div>
      ) : null}

      {view.kind === "none" ? (
        <div className="analysis-rag-note">
          <strong>No candidate diagnosis</strong>
          <span>The reference material does not support a diagnosis for these symptoms.</span>
        </div>
      ) : null}

      {view.kind === "text" ? (
        <>
          <h2 className="analysis-section-label">Diagnosis</h2>
          <p className="analysis-rag-note analysis-rag-text">{view.text}</p>
        </>
      ) : null}

      {view.kind === "cards" ? (
        <>
          <div className="analysis-assessment-card">
            <p className="analysis-inner-label">Assessment</p>
            <p>
              Most closely matches <strong>{view.items[0].name}.</strong>
            </p>
            <span className={`analysis-dx-tier ${LIKELIHOOD_CLASS[view.items[0].likelihood]}`}>
              {view.items[0].likelihood} likelihood
            </span>
          </div>

          <h2 className="analysis-section-label">Diagnosis</h2>
          <div className="analysis-dx-list">
            {view.items.map((dx, idx) => {
              const id = ragRowId(idx);
              return (
                <DiagnosisRow
                  key={id}
                  dx={dx}
                  id={id}
                  isTop={idx === 0}
                  open={openDxId === id}
                  onToggle={onToggleDx}
                />
              );
            })}
          </div>
        </>
      ) : null}

      <p className="analysis-disclaimer">{result.disclaimer}</p>

      {result.sources.length ? (
        <details className="analysis-sources">
          <summary>Sources ({result.sources.length})</summary>
          <ul>
            {result.sources.map((s, i) => (
              <li key={i}>
                <p>{s.excerpt}</p>
                <span>Similarity {s.score ?? "n/a"}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
