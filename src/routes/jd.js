// Demand Engine: JD parsing.
// Paste Job Description -> Gemini -> structured requirements -> Zod -> Firestore.
// Gemini is used ONLY for this JD/role parsing step and for failure
// classification (routes/failureAutopsy.js) — nowhere else in the backend.

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { db } from "../lib/firebaseAdmin.js";
import { created, notFound, ApiError } from "../lib/apiResponse.js";
import { parseJobDescription, GeminiError } from "../lib/gemini.js";
import { importanceLevelToWeight } from "../schemas/index.js";

const router = Router();

const jdParseRequestSchema = z.object({
  roleId: z.string().min(1),
  description: z.string().min(20).max(20000),
});

/** Find an existing skill by case-insensitive name, or create it. */
async function findOrCreateSkill(name) {
  const normalized = name.trim();
  const snap = await db.collection("skills").get();
  const existing = snap.docs.find((d) => (d.data().name || "").toLowerCase() === normalized.toLowerCase());
  if (existing) return existing.id;

  const ref = await db.collection("skills").add({
    name: normalized,
    category: "ai_inferred",
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

/** Find an existing roleRequirement for (roleId, skillId), if any. */
async function findExistingRequirement(roleId, skillId) {
  const snap = await db
    .collection("roleRequirements")
    .where("roleId", "==", roleId)
    .where("skillId", "==", skillId)
    .get();
  return snap.docs[0] ?? null;
}

// POST /api/jd/parse — paste a JD, get back stored (ai_inferred) role requirements.
router.post("/parse", requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), validate(jdParseRequestSchema), async (req, res, next) => {
  try {
    const { roleId, description } = req.body;

    const roleSnap = await db.collection("roles").doc(roleId).get();
    if (!roleSnap.exists) throw notFound("Role not found");

    let parsed;
    try {
      parsed = await parseJobDescription(description);
    } catch (err) {
      if (err.name === "GeminiError") {
        throw new ApiError(502, "AI_PARSE_FAILED", "Could not extract structured requirements from this JD.");
      }
      throw err;
    }

    const results = [];
    for (const { skill, importance } of parsed.skills) {
      const skillId = await findOrCreateSkill(skill);
      const payload = {
        roleId,
        skillId,
        importance: importanceLevelToWeight[importance] ?? 0.5,
        importanceLevel: importance,
        sourceType: "ai_inferred", // NEVER "verified" — this came from an LLM parse
        createdAt: new Date().toISOString(),
      };

      const existing = await findExistingRequirement(roleId, skillId);
      if (existing) {
        await db.collection("roleRequirements").doc(existing.id).set(payload, { merge: true });
        results.push({ id: existing.id, ...existing.data(), ...payload });
      } else {
        const ref = await db.collection("roleRequirements").add(payload);
        results.push({ id: ref.id, ...payload });
      }
    }

    return created(res, { roleId, requirements: results });
  } catch (err) {
    next(err);
  }
});

export default router;
