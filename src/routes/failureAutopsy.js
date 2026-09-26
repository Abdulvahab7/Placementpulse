// Failure Autopsy: WHY did this student fail?
// Pipeline: raw attempt -> deterministic metrics -> structured evidence -> Gemini
// -> validated JSON -> database. Raw student data is never sent to Gemini directly;
// only the sanitized, structured evidence bundle from failureSignals.js is.

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { db } from "../lib/firebaseAdmin.js";
import { ok, created, notFound, forbidden, ApiError } from "../lib/apiResponse.js";
import { extractSignals } from "../lib/failureSignals.js";
import { classifyFailure, GeminiError } from "../lib/gemini.js";
import { aggregateFailurePatterns, computeFingerprint, primaryRecurringIssue } from "../lib/failureAggregation.js";

const router = Router();

const analyzeRequestSchema = z.object({
  attemptId: z.string().min(1),
});

function severityFromConfidence(confidence) {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

// POST /api/failure-autopsy/analyze — run the full pipeline for one attempt.
router.post("/analyze", requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), validate(analyzeRequestSchema), async (req, res, next) => {
  try {
    const { attemptId } = req.body;

    const attemptSnap = await db.collection("attempts").doc(attemptId).get();
    if (!attemptSnap.exists) throw notFound("Attempt not found");
    const attempt = attemptSnap.data();
    if (attempt.userId !== req.user.uid) throw forbidden();
    if (attempt.correct) {
      throw new ApiError(400, "BAD_REQUEST", "Failure Autopsy only applies to failed (incorrect) attempts.");
    }

    const deterministicSignals = extractSignals(attempt);

    // Only the structured, deterministic evidence bundle is sent to Gemini —
    // never the raw answer text or other unstructured student data.
    const evidenceBundle = {
      contextType: attempt.contextType ?? "coding",
      type: attempt.type,
      signals: deterministicSignals,
    };

    let classification;
    try {
      classification = await classifyFailure(evidenceBundle);
    } catch (err) {
      if (err.name === "GeminiError") {
        throw new ApiError(502, "AI_CLASSIFICATION_FAILED", "Could not produce a validated failure classification.");
      }
      throw err;
    }

    const payload = {
      userId: req.user.uid,
      attemptId,
      pattern: classification.failure_pattern,
      failurePatternValue: classification.failure_pattern,
      frequency: 1,
      severity: severityFromConfidence(classification.confidence),
      evidence: classification.evidence,
      confidence: classification.confidence,
      intervention: classification.intervention,
      contextType: evidenceBundle.contextType,
      deterministicSignals,
      source: "gemini_classification",
      lastDetected: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection("failurePatterns").add(payload);
    return created(res, { id: ref.id, ...payload });
  } catch (err) {
    next(err);
  }
});

// GET /api/failure-autopsy — this student's aggregated Failure Autopsy view.
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const snap = await db.collection("failurePatterns").where("userId", "==", req.user.uid).get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const classificationDocs = docs.filter((d) => d.failurePatternValue);

    const aggregation = aggregateFailurePatterns(classificationDocs);
    const attemptsAnalyzed = new Set(classificationDocs.map((d) => d.attemptId)).size;

    return ok(res, {
      attemptsAnalyzed,
      failureCategories: aggregation.categories,
      primaryRecurringIssue: primaryRecurringIssue(aggregation),
      records: classificationDocs,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/failure-autopsy/fingerprint — student-level aggregated profile.
// Observable-behavior only; no causal or psychological claims.
router.get("/fingerprint", requireAuth, async (req, res, next) => {
  try {
    const snap = await db.collection("failurePatterns").where("userId", "==", req.user.uid).get();
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.failurePatternValue);

    return ok(res, { fingerprint: computeFingerprint(docs) });
  } catch (err) {
    next(err);
  }
});

export default router;
