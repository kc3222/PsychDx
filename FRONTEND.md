# Frontend integration guide (TypeScript)

How a TypeScript frontend (Next.js App Router assumed) talks to the PsychDx-RAG service:
the connection setup, every request and response shape as TypeScript types, errors, and
what the UI must show. `README.md` has the backend side; this file is the contract as
seen from the client.

> **Decision support only.** Every screen that shows `/query` or `/diagnose` output must
> make clear that it is not a diagnosis and must be reviewed by a qualified clinician.

---

## 1. Architecture: call it from the server, never the browser

```
Browser ──fetch──▶ Next.js Route Handler / Server Action ──X-API-Key──▶ PsychDx-RAG (Cloud Run)
          (your own user auth)          (holds RAG_API_KEY)
```

- `RAG_API_KEY` is a single shared secret. If it reaches the browser, anyone can spend
  against the OpenAI account. Keep it in server-only env vars with **no** `NEXT_PUBLIC_`
  prefix, and import the client module with `import "server-only"`.
- Authenticate your own users in the Route Handler before forwarding.
- CORS on the service only matters if a browser calls it directly, which you should not
  do. Server-to-server `fetch` ignores CORS.

### Environment variables (Next.js)

`.env.local`:

```
RAG_URL=http://localhost:8000   # Cloud Run service URL in deployed environments, no trailing slash
RAG_API_KEY=<same value as the service's RAG_API_KEY>
```

On Vercel, set both as server-side environment variables. Locally, run the backend with
`python -m uvicorn main:app --reload` (port 8000). With `ENV=dev` and no `RAG_API_KEY`,
the backend skips auth and serves interactive docs at `http://localhost:8000/docs`.

---

## 2. Endpoints at a glance

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | none | Liveness; use it to warm a cold container |
| `POST` | `/query` | `X-API-Key` | Clinical question → grounded answer |
| `POST` | `/diagnose` | `X-API-Key` | Symptom list → up to 3 candidate diagnoses |
| `GET` | `/debug?q=` | `X-API-Key` | Raw retrieved chunks. Off in production (returns `404`); don't build UI on it |

All request and response bodies are JSON. Every response carries an `X-Request-ID`
header.

---

## 3. TypeScript types

Put these in `lib/rag-types.ts`. They match what `main.py` actually returns.

```ts
// ---- Requests -------------------------------------------------------------

export interface QueryRequest {
  /** 1–1000 characters. Whitespace-only is rejected. */
  question: string;
}

export interface DiagnoseRequest {
  /** 1–30 items, each 1–200 characters. Newlines inside an item become spaces. */
  symptoms: string[];
}

// ---- Shared pieces --------------------------------------------------------

export interface Source {
  /** First 300 characters of the retrieved DSM-5-TR chunk. */
  excerpt: string;
  /** Cosine similarity, 3 decimals. `null` when the score is missing or exactly 0. */
  score: number | null;
}

export interface Grounding {
  /** false → the LLM was NOT called; answer/diagnoses hold a fixed refusal message. */
  sufficient: boolean;
  /** Highest similarity among retrieved chunks; `null` if nothing was retrieved. */
  best_score: number | null;
  /** Server's MIN_SIMILARITY_SCORE (default 0.25). */
  threshold: number;
}

export type RiskCategory =
  | "suicidality"
  | "self_harm"
  | "harm_to_others"
  | "psychosis_emergency";

export interface ClinicianAlert {
  triggered: boolean;
  /** Sorted, unique. Empty when not triggered. */
  categories: RiskCategory[];
  /** The phrases that matched, sorted. Empty when not triggered. */
  matched_terms: string[];
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  embedding_tokens: number;
  /** Estimate from list prices, not a bill. */
  estimated_cost_usd: number;
}

// ---- /query ---------------------------------------------------------------

export interface QueryResponse {
  /** Markdown-ish plain text. On a grounding refusal, the fixed "Insufficient grounding..." message. */
  answer: string;
  sources: Source[];
  grounding: Grounding;
  clinician_alert: ClinicianAlert;
  usage: Usage;
}

// ---- /diagnose ------------------------------------------------------------

export type Likelihood = "High" | "Moderate" | "Low";

export interface Diagnosis {
  name: string;
  /** Always one of the three English tiers, never a number. */
  likelihood: Likelihood;
  contributing_factors: string[];
  unaccounted_symptoms: string[];
  additional_information_needed: string[];
}

export interface DiagnoseResponse {
  /** Plain-text rendering of diagnoses_structured, or raw model text if parsing failed,
   *  or the "Insufficient grounding..." message on refusal. */
  diagnoses: string;
  sources: Source[];
  /** 0–3 items, most likely first. `null` on grounding refusal or unparseable model output.
   *  `[]` means the reference material supports no diagnosis. */
  diagnoses_structured: Diagnosis[] | null;
  grounding: Grounding;
  clinician_alert: ClinicianAlert;
  /** Fixed text. Must be displayed. */
  disclaimer: string;
  usage: Usage;
}

// ---- Health ---------------------------------------------------------------

export interface HealthResponse {
  status: "ok";
}

// ---- Errors ---------------------------------------------------------------

/** FastAPI validation error item (422). */
export interface ValidationIssue {
  type: string;
  /** e.g. ["body", "symptoms", 2] */
  loc: (string | number)[];
  msg: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
}

export interface ErrorBody {
  /** string for 401/404/429; array for 422. */
  detail: string | ValidationIssue[];
}
```

---

## 4. Server-side client

`lib/rag.ts`:

```ts
import "server-only";
import type {
  DiagnoseResponse,
  ErrorBody,
  HealthResponse,
  QueryResponse,
} from "./rag-types";

const RAG_URL = process.env.RAG_URL;
const RAG_API_KEY = process.env.RAG_API_KEY;
if (!RAG_URL || !RAG_API_KEY) throw new Error("RAG_URL and RAG_API_KEY must be set");

// An LLM call is usually 2–8 s; a cold start adds ~15 s. Leave headroom.
const TIMEOUT_MS = 90_000;

export class RagError extends Error {
  constructor(
    public status: number,
    public detail: ErrorBody["detail"] | string,
    public requestId: string | null,
    public retryAfterSeconds: number | null,
  ) {
    super(`RAG request failed with ${status}`);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${RAG_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": RAG_API_KEY! },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    // 500s are plain text ("Internal Server Error"), everything else is JSON.
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
      retryAfter ? Number(retryAfter) : null,
    );
  }
  return (await res.json()) as T;
}

export const queryRag = (question: string) =>
  post<QueryResponse>("/query", { question });

export const diagnoseSymptoms = (symptoms: string[]) =>
  post<DiagnoseResponse>("/diagnose", { symptoms });

/** Fire-and-forget warm-up. Cloud Run scales to zero; the first request pays ~15 s. */
export async function warmUp(): Promise<boolean> {
  try {
    const res = await fetch(`${RAG_URL}/health`, { cache: "no-store" });
    return res.ok && ((await res.json()) as HealthResponse).status === "ok";
  } catch {
    return false;
  }
}
```

---

## 5. Route Handlers the browser calls

`app/api/diagnose/route.ts`:

```ts
import { diagnoseSymptoms, RagError } from "@/lib/rag";

export async function POST(req: Request) {
  // 1. Authenticate YOUR user here (session, Clerk, NextAuth...). Reject if not signed in.

  const { symptoms } = (await req.json()) as { symptoms?: unknown };
  if (!Array.isArray(symptoms) || !symptoms.every((s) => typeof s === "string")) {
    return Response.json({ detail: "symptoms must be an array of strings" }, { status: 400 });
  }

  try {
    return Response.json(await diagnoseSymptoms(symptoms));
  } catch (err) {
    return toErrorResponse(err);
  }
}

function toErrorResponse(err: unknown): Response {
  if (err instanceof RagError) {
    // Never forward 401: it means OUR server's key is wrong, not the user's fault.
    if (err.status === 401) {
      console.error("RAG_API_KEY rejected", err.requestId);
      return Response.json({ detail: "Service unavailable" }, { status: 502 });
    }
    const headers = err.retryAfterSeconds ? { "Retry-After": String(err.retryAfterSeconds) } : undefined;
    const status = err.status >= 500 ? 502 : err.status;
    return Response.json({ detail: err.detail, requestId: err.requestId }, { status, headers });
  }
  // Timeout (AbortError / TimeoutError) or network failure.
  return Response.json({ detail: "The service did not respond in time" }, { status: 504 });
}
```

`app/api/query/route.ts` is the same shape, calling `queryRag(question)`.

For warm-up, call `warmUp()` from the Server Component that renders the input page (no
`await` needed), so the container is starting while the clinician types.

---

## 6. Rendering rules

These are safety requirements, not styling suggestions.

### `clinician_alert`
When `clinician_alert.triggered` is `true`, show a prominent banner **above** the
answer, listing `categories` in human wording, e.g.:

| Category | Label |
|---|---|
| `suicidality` | Suicide risk mentioned |
| `self_harm` | Self-harm mentioned |
| `harm_to_others` | Risk of harm to others mentioned |
| `psychosis_emergency` | Possible psychiatric emergency |

It is a deterministic phrase match (English only) and fires on clinical questions that
only mention a topic, so word it as "review needed", not as an assessment. It is returned
on grounding refusals too, so check it on every response.

### `grounding.sufficient === false`
The model was not called. Show the returned `answer` / `diagnoses` message as a neutral
"no matching reference material" state, not as an error, and suggest rephrasing. Do not
render candidate diagnoses. Vietnamese input is refused more often (known gap, see
README).

### `/diagnose` output
Pick the view in this order:

```ts
function diagnoseView(r: DiagnoseResponse) {
  if (!r.grounding.sufficient) return { kind: "refused", message: r.diagnoses } as const;
  if (r.diagnoses_structured === null) return { kind: "text", text: r.diagnoses } as const; // parse fallback
  if (r.diagnoses_structured.length === 0) return { kind: "none" } as const;
  return { kind: "cards", items: r.diagnoses_structured } as const;
}
```

- Show `likelihood` as a tier badge (`High` / `Moderate` / `Low`). Never convert it to a
  percentage or a progress bar that implies a number.
- Keep the order the server gives; it is most to least likely.
- Render text fields as plain text (`{value}` in JSX), never with
  `dangerouslySetInnerHTML`. It is LLM output.
- `diagnoses` (string) uses `\n` line breaks; wrap it in `white-space: pre-wrap` when
  shown as text.
- **Always show `disclaimer`**, near the results, not hidden in a tooltip.

### `/query` output
`answer` is plain text that may contain Markdown-style lists and bold. Either render it
with a Markdown renderer that escapes HTML, or show it with `white-space: pre-wrap`. It
is answered in the question's language. There is no `disclaimer` field on `/query`, so
show your own static one.

### `sources`
Optional "Sources" disclosure listing `excerpt` (DSM-5-TR text, truncated) and `score`.
Handle `score === null`. There is no page number or section title in the response.

### `usage`
For internal dashboards or admin views only; don't show cost to clinicians.

---

## 7. Errors

| Status | Body | Cause | Frontend handling |
|---|---|---|---|
| `401` | `{"detail": "Invalid or missing API key."}` | Server env misconfigured | Log it; show "service unavailable". Never retry. |
| `404` | `{"detail": "Not Found"}` | `/debug` while disabled, or wrong path | Bug on our side |
| `422` | `{"detail": ValidationIssue[]}` | Empty/whitespace input, too long, >30 symptoms, wrong type | Map `loc` to the field; see below |
| `429` | `{"detail": "Rate limit exceeded (30 per 1 minute). Try again in N seconds."}` + `Retry-After` | Too many requests | Disable submit for `Retry-After` seconds |
| `500` | plain text `Internal Server Error` | OpenAI error/timeout after retries | "Something went wrong, try again", log `X-Request-ID` |

Example `422` for an empty third symptom:

```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", "symptoms"],
      "msg": "Value error, must not be empty or whitespace-only",
      "input": ["depressed mood", "insomnia", "   "],
      "ctx": { "error": {} }
    }
  ]
}
```

Note that `input` echoes the user's text back. Don't log `422` bodies wholesale, since
that puts clinical text in your logs.

**Rate limit is shared.** All frontend users go through one API key, so the default
`30/minute` is for the whole app, not per user. Add your own per-user limit in the Route
Handler if needed, and ask the backend owner to raise `RATE_LIMIT` before launch.

### Validate before sending
Mirror the limits client-side so users get instant feedback (the server remains the
authority):

```ts
export const LIMITS = { maxQuestionChars: 1000, maxSymptoms: 30, maxSymptomChars: 200 } as const;

export function validateSymptoms(raw: string[]): string | null {
  const items = raw.map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return "Enter at least one symptom.";
  if (items.length > LIMITS.maxSymptoms) return `At most ${LIMITS.maxSymptoms} symptoms.`;
  if (items.some((s) => s.length > LIMITS.maxSymptomChars))
    return `Each symptom must be ${LIMITS.maxSymptomChars} characters or fewer.`;
  return null;
}
```

Drop blank items before sending; the server rejects the whole request if any item is
blank. Lengths are measured after the server trims whitespace and strips invisible
characters, so checking trimmed text as above matches it. The limits are server-configurable (`MAX_QUESTION_CHARS`, `MAX_SYMPTOMS`,
`MAX_SYMPTOM_CHARS`), so keep these constants in sync with the deployment.

---

## 8. Latency and UX

| | Typical | Slow |
|---|---|---|
| `/query` | ~1.6 s | ~7 s |
| `/diagnose` | ~2.2 s | ~4 s |
| Grounding refusal | ~0.4 s | |
| Cold start (after idle) | +~15 s | |

- Show a loading state immediately and disable the submit button while in flight (this
  also protects the shared rate limit).
- There is no streaming; the response arrives in one piece.
- Don't auto-retry `/query` or `/diagnose` on failure; each attempt costs an LLM call.
  Let the user retry.

---

## 9. Request IDs and privacy

- Every response has `X-Request-ID`. Log it with your own errors so a failed request can
  be found in the backend logs. You may also send your own `X-Request-ID` (1–128 letters,
  digits, `.`, `-`, `_`), and the backend will reuse it.
- The backend never logs question or symptom text by default. Keep it that way on the
  frontend: don't send it to analytics, error trackers (Sentry breadcrumbs, request
  bodies), or client-side storage without an explicit decision.

---

## 10. Quick test

```bash
curl -s http://localhost:8000/health
```

```bash
curl -s -X POST http://localhost:8000/diagnose -H "Content-Type: application/json" -H "X-API-Key: $RAG_API_KEY" -d '{"symptoms": ["depressed mood", "loss of interest", "insomnia", "fatigue"]}'
```
