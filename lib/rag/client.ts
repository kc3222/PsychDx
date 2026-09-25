/*
 * Server-side client for the PsychDx-RAG service (see FRONTEND.md).
 *
 * Server files only: it sends RAG_API_KEY, a shared secret. Never import this from a
 * "use client" module. Configuration (flag, URL, key) lives in lib/rag/config.ts.
 */

import { getRagConfig } from "@/lib/rag/config";
import type { DiagnoseResponse, ErrorBody } from "@/lib/rag/types";

// An LLM call is usually 2–8 s; a Cloud Run cold start adds ~15 s.
const TIMEOUT_MS = 90_000;

export class RagError extends Error {
  constructor(
    public status: number,
    public detail: ErrorBody["detail"] | string,
    public requestId: string | null,
    public retryAfterSeconds: number | null
  ) {
    super(`RAG request failed with ${status}`);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const { url, apiKey } = getRagConfig();
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    // 500s are plain text ("Internal Server Error"); everything else is JSON.
    const text = await res.text();
    let detail: ErrorBody["detail"] | string = text;
    try {
      detail = (JSON.parse(text) as ErrorBody).detail;
    } catch {}
    const retryAfter = res.headers.get("Retry-After");
    throw new RagError(
      res.status,
      detail,
      res.headers.get("X-Request-ID"),
      retryAfter ? Number(retryAfter) : null
    );
  }
  return (await res.json()) as T;
}

export const diagnoseSymptoms = (symptoms: string[]) =>
  post<DiagnoseResponse>("/diagnose", { symptoms });
