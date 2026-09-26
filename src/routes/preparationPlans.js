// Adaptive Preparation Engine — API layer (Phase 3).
// All prioritization/branching logic lives in lib/preparationPlan.js; this
// file only wires Firestore reads/writes and enforces ownership, matching
// the pattern used by gapEngine.js and failureAutopsy.js.

import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../lib/firebaseAdmin.js";
import { ok, created, notFound, forbidden, badRequest, ApiError } from "../lib/apiResponse.js";
import { createPreparationPlanSchema, preparationPlanProgressSchema } from "../schemas/preparationPlan.js";
import { prioritizeSkills, generatePlanSteps, applyProgress } from "../lib/preparationPlan.js";

const router = Router();

/**
 * Loads everything the engine needs for a given user + role:
 * roleRequirements, studentSkills (as a Map keyed by skillId), skills (as a
 * Map keyed by id), and this user's Gemini-classified failurePatterns docs.
 */
async function loadPlanInputs(roleId, userId) {
  const roleSnap = await db.collection("roles").doc(roleId).get();
  if (!roleSnap.exists) throw notFound("Role not found");

  const requirementsSnap = await db.collection("roleRequirements").where("roleId", "==", roleId).get();
  const requirements = requirementsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const studentSkillsSnap = await db.collection("studentSkills").where("userId", "==", userId).get();
  const studentSkillsBySkillId = new Map(
    studentSkillsSnap.docs.map((d) => [d.data().skillId, { id: d.id, ...d.data() }])
  );

  const skillsSnap = await db.collection("skills").get();
  const skillsById = new Map(skillsSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));

  const failurePatternsSnap = await db.collection("failurePatterns").where("userId", "==", userId).get();
  const failurePatternDocs = skillsSnap.docs.length
    ? failurePatternsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.failurePatternValue)
    : [];

  return { role: { id: roleSnap.id, ...roleSnap.data() }, requirements, studentSkillsBySkillId, skillsById, failurePatternDocs };
}

function generatePlanDocument({ userId, roleId, requirements, studentSkillsBySkillId, skillsById, failurePatternDocs }) {
  const prioritized = prioritizeSkills(requirements, studentSkillsBySkillId, skillsById, failurePatternDocs);
  const steps = generatePlanSteps(prioritized);
  const now = new Date().toISOString();

  return {
    userId,
    roleId,
    status: "active",
    createdAt: now,
    updatedAt: now,
    currentStep: steps.length > 0 ? steps[0].stepId : null,
    steps,
    prioritization: prioritized.map((p) => ({
      skillId: p.skillId,
      skillName: p.skillName,
      priorityScore: p.priorityScore,
      priority: p.priority,
      reason: p.reason,
      matchedFailurePatterns: p.matchedFailurePatterns,
    })),
  };
}

// GET /api/preparation-plans/role/:roleId — most recent active plan for this
// user + role, if one exists (frontend uses this to decide "generate" vs "view").
router.get("/role/:roleId", requireAuth, async (req, res, next) => {
  try {
    const { roleId } = req.params;
    const snap = await db
      .collection("preparationPlans")
      .where("userId", "==", req.user.uid)
      .where("roleId", "==", roleId)
      .get();

    const plans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const active = plans.find((p) => p.status === "active") ?? null;
    return ok(res, { plan: active });
  } catch (err) {
    next(err);
  }
});

// POST /api/preparation-plans — generate a new adaptive preparation plan for
// { roleId }. Deterministic: same gaps + failures + role => same plan shape.
router.post("/", requireAuth, validate(createPreparationPlanSchema), async (req, res, next) => {
  try {
    const { roleId } = req.body;
    const inputs = await loadPlanInputs(roleId, req.user.uid);

    if (inputs.requirements.length === 0) {
      throw badRequest("This role has no requirements configured yet; cannot generate a plan.");
    }

    const planDoc = generatePlanDocument({ userId: req.user.uid, roleId, ...inputs });
    const ref = await db.collection("preparationPlans").add(planDoc);
    return created(res, { id: ref.id, ...planDoc });
  } catch (err) {
    next(err);
  }
});

// GET /api/preparation-plans/:planId — fetch a plan, only if owned by the caller.
router.get("/:planId", requireAuth, async (req, res, next) => {
  try {
    const ref = db.collection("preparationPlans").doc(req.params.planId);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("Preparation plan not found");
    if (snap.data().userId !== req.user.uid) throw forbidden();
    return ok(res, { id: snap.id, ...snap.data() });
  } catch (err) {
    next(err);
  }
});

// POST /api/preparation-plans/:planId/progress — mark progress on a step.
// The route never decides pass/fail itself; lib/preparationPlan.js does,
// from explicit evidence in the request body plus this user's failurePatterns.
router.post("/:planId/progress", requireAuth, validate(preparationPlanProgressSchema), async (req, res, next) => {
  try {
    const ref = db.collection("preparationPlans").doc(req.params.planId);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("Preparation plan not found");
    const plan = { id: snap.id, ...snap.data() };
    if (plan.userId !== req.user.uid) throw forbidden();

    const { stepId, completed, assessmentScore } = req.body;
    const step = plan.steps.find((s) => s.stepId === stepId);
    if (!step) throw notFound("Step not found in this plan");

    // Check whether an unresolved high-severity failure pattern still blocks this skill.
    let unresolvedHighSeverityFailure = false;
    if (step.failurePattern) {
      const failuresSnap = await db
        .collection("failurePatterns")
        .where("userId", "==", req.user.uid)
        .get();
      unresolvedHighSeverityFailure = failuresSnap.docs.some((d) => {
        const data = d.data();
        return data.failurePatternValue === step.failurePattern && data.severity === "high";
      });
      // A passing assessment score is treated as resolving evidence even if an
      // older high-severity record exists, so students are never permanently stuck.
      if (assessmentScore != null && assessmentScore >= 70) unresolvedHighSeverityFailure = false;
    }

    let result;
    try {
      result = applyProgress(plan, { stepId, completed, assessmentScore, unresolvedHighSeverityFailure });
    } catch (engineErr) {
      throw new ApiError(400, "BAD_REQUEST", engineErr.message);
    }

    const status = result.currentStep == null ? "completed" : "active";
    await ref.set(
      { steps: result.steps, currentStep: result.currentStep, status, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    const updated = await ref.get();
    return ok(res, { id: updated.id, ...updated.data() });
  } catch (err) {
    next(err);
  }
});

// POST /api/preparation-plans/:planId/regenerate — recompute the plan from
// current gap/failure evidence (role change, new evidence, or explicit request).
router.post("/:planId/regenerate", requireAuth, async (req, res, next) => {
  try {
    const ref = db.collection("preparationPlans").doc(req.params.planId);
    const snap = await ref.get();
    if (!snap.exists) throw notFound("Preparation plan not found");
    const existing = { id: snap.id, ...snap.data() };
    if (existing.userId !== req.user.uid) throw forbidden();

    const inputs = await loadPlanInputs(existing.roleId, req.user.uid);
    const regenerated = generatePlanDocument({ userId: req.user.uid, roleId: existing.roleId, ...inputs });
    regenerated.createdAt = existing.createdAt; // preserve original creation time

    await ref.set(regenerated, { merge: false });
    const updated = await ref.get();
    return ok(res, { id: updated.id, ...updated.data() });
  } catch (err) {
    next(err);
  }
});

export default router;
