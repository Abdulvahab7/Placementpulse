// Isolated Gemini client. Used in exactly two places in Phase 2:
//   1. JD parsing (routes/jd.js)             -> parseJobDescription()
//   2. Failure classification (routes/failureAutopsy.js) -> classifyFailure()
//
// The API key (GEMINI_API_KEY) lives only in the backend environment and is
// never sent to, or readable by, the frontend. Every Gemini response is
// validated with Zod before it is trusted or stored; invalid responses are
// retried once, then rejected outright (never stored unvalidated).

import { geminiFailureClassificationSchema, geminiJdParseSchema } from "../schemas/index.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

class GeminiError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "GeminiError";
    this.cause = cause;
  }
}

/**
 * Low-level call: sends a prompt, asks for JSON-only output, strips code
 * fences defensively, and returns the parsed (but not yet schema-validated) JSON.
 */
async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError("GEMINI_API_KEY is not configured on the backend");
  }

  const res = await fetch(`${GEMINI_ENDPOINT(GEMINI_MODEL)}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GeminiError(`Gemini API returned ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  const cleaned = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new GeminiError("Gemini response was not valid JSON", err);
  }
}

/**
 * Runs `callGemini(prompt)` and validates the result against `schema`.
 * Retries once on failure (either a Gemini/network error or a schema
 * validation failure) with a stricter follow-up prompt. Never returns
 * unvalidated data — throws if both attempts fail.
 */
async function callAndValidate(prompt, schema, retryPrompt) {
  for (const attemptPrompt of [prompt, retryPrompt ?? prompt]) {
    try {
      const raw = await callGemini(attemptPrompt);
      const result = schema.safeParse(raw);
      if (result.success) return result.data;
    } catch (err) {
      // fall through to retry
    }
  }
  throw new GeminiError("Gemini output failed schema validation after retry");
}

/**
 * JD parsing. Gemini is allowed here ONLY for structured role/skill extraction.
 * Output is always stored with sourceType = "ai_inferred" by the caller — never
 * presented as verified company information.
 */
export async function parseJobDescription(description) {
  const basePrompt = `You are extracting structured role requirements from a job description.
Return ONLY JSON matching exactly this shape, nothing else:
{"skills":[{"skill":"<skill name>","importance":"HIGH"|"MEDIUM"|"LOW"}]}

Rules:
- Extract only skills explicitly implied by the text.
- "importance" must be exactly one of HIGH, MEDIUM, LOW.
- Do not invent company-specific facts not present in the text.

Job description:
"""
${description}
"""`;

  const retryPrompt = `${basePrompt}

Your previous response was invalid. Return ONLY the raw JSON object, no prose, no markdown fences, matching the exact shape described above.`;

  return callAndValidate(basePrompt, geminiJdParseSchema, retryPrompt);
}

/**
 * Failure classification. Gemini is allowed here ONLY for classifying an
 * already-computed, structured evidence bundle (deterministic signals +
 * sanitized attempt facts) — never raw/unstructured student data.
 */
export async function classifyFailure(evidenceBundle) {
  const basePrompt = `You are classifying why a student's attempt failed, using ONLY the structured evidence below.
Return ONLY JSON matching exactly this shape:
{"failure_pattern":"algorithm_selection"|"edge_cases"|"implementation"|"complexity_analysis"|"time_management"|"premature_solving"|"technical_explanation","confidence":0.0-1.0,"evidence":["..."],"intervention":"..."}

Rules:
- Base the classification strictly on the evidence provided.
- "evidence" must reference facts present in the bundle, in your own words.
- "intervention" must be one concrete, actionable suggestion.
- Describe observable behavior only. Never make personality or ability judgments
  (e.g. do not say "bad at DSA" — say what was observed instead).

Structured evidence:
${JSON.stringify(evidenceBundle, null, 2)}`;

  const retryPrompt = `${basePrompt}

Your previous response was invalid or did not match the required JSON shape exactly. Return ONLY the raw JSON object.`;

  return callAndValidate(basePrompt, geminiFailureClassificationSchema, retryPrompt);
}

export { GeminiError };
