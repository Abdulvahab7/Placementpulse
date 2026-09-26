import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { db } from "../lib/firebaseAdmin.js";
import { ok, created, notFound, forbidden, ApiError } from "../lib/apiResponse.js";
import { createCorrectionDrillSchema, submitCorrectionDrillSchema, reassessmentSchema } from "../schemas/correctionDrill.js";
import { generateFallbackQuestions, scoreQuestions } from "../lib/correctionDrill.js";
import { updateEvidence, calculateReadiness } from "../lib/readinessCalculator.js";

const router = Router();

async function getOwnedDrill(id, uid) {
  const snap = await db.collection("correctionDrills").doc(id).get();
  if (!snap.exists) throw notFound("Correction drill not found");
  const drill = { id: snap.id, ...snap.data() };
  if (drill.userId !== uid) throw forbidden();
  return drill;
}

async function updateReadinessForRole(uid, roleId) {
  const reqSnap = await db.collection("roleRequirements").where("roleId", "==", roleId).get();
  const skillSnap = await db.collection("studentSkills").where("userId", "==", uid).get();
  const bySkill = new Map(skillSnap.docs.map((d) => [d.data().skillId, { id: d.id, ...d.data() }]));
  const requirements = reqSnap.docs.map((d) => d.data());
  const result = calculateReadiness(requirements, bySkill);
  const docId = `${uid}_${roleId}`;
  const payload = {
    userId: uid,
    roleId,
    overall: result.overall,
    skillGaps: result.skillGaps,
    updatedAt: new Date().toISOString(),
  };
  await db.collection("readiness").doc(docId).set(payload, { merge: true });
  return { id: docId, ...payload };
}

router.post("/", requireAuth, rateLimit({ windowMs: 60_000, max: 10 }), validate(createCorrectionDrillSchema), async (req, res, next) => {
  try {
    const { roleId, skillId, failurePattern, sourceAttemptIds } = req.body;
    const roleSnap = await db.collection("roles").doc(roleId).get();
    if (!roleSnap.exists) throw notFound("Role not found");
    const skillSnap = await db.collection("skills").doc(skillId).get();
    if (!skillSnap.exists) throw notFound("Skill not found");

    const failureSnap = await db.collection("failurePatterns").where("userId", "==", req.user.uid).get();
    const derivedAttemptIds = failureSnap.docs
      .map((d) => d.data())
      .filter((d) => d.failurePatternValue === failurePattern && d.attemptId)
      .map((d) => d.attemptId);
    const resolvedSourceAttemptIds = [...new Set([...sourceAttemptIds, ...derivedAttemptIds])].slice(0, 20);
    const questions = generateFallbackQuestions(failurePattern, 3, "drill");
    const now = new Date().toISOString();
    const payload = {
      userId: req.user.uid,
      roleId,
      skillId,
      failurePattern,
      sourceAttemptIds: resolvedSourceAttemptIds,
      questions,
      status: "generated",
      createdAt: now,
      completedAt: null,
      score: null,
    };
    const ref = await db.collection("correctionDrills").add(payload);
    return created(res, { id: ref.id, ...payload });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const snap = await db.collection("correctionDrills").where("userId", "==", req.user.uid).get();
    const drills = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return ok(res, drills);
  } catch (err) {
    next(err);
  }
});

router.get("/:drillId", requireAuth, async (req, res, next) => {
  try {
    return ok(res, await getOwnedDrill(req.params.drillId, req.user.uid));
  } catch (err) {
    next(err);
  }
});

router.post("/:drillId/start", requireAuth, async (req, res, next) => {
  try {
    const drill = await getOwnedDrill(req.params.drillId, req.user.uid);
    if (drill.status === "completed") throw new ApiError(409, "ALREADY_COMPLETED", "This drill is already completed.");
    const payload = { status: "in_progress" };
    await db.collection("correctionDrills").doc(drill.id).set(payload, { merge: true });
    return ok(res, { ...drill, ...payload });
  } catch (err) {
    next(err);
  }
});

router.post("/:drillId/submit", requireAuth, validate(submitCorrectionDrillSchema), async (req, res, next) => {
  try {
    const drill = await getOwnedDrill(req.params.drillId, req.user.uid);
    if (drill.status === "completed") throw new ApiError(409, "ALREADY_COMPLETED", "This drill has already been submitted.");
    const score = scoreQuestions(drill.questions, req.body.answers);
    const completedAt = new Date().toISOString();
    await db.collection("correctionDrills").doc(drill.id).set({ status: "completed", score, completedAt }, { merge: true });
    return ok(res, { id: drill.id, score, status: "completed", completedAt, questions: drill.questions });
  } catch (err) {
    next(err);
  }
});

router.get("/:drillId/result", requireAuth, async (req, res, next) => {
  try {
    const drill = await getOwnedDrill(req.params.drillId, req.user.uid);
    return ok(res, {
      id: drill.id,
      status: drill.status,
      score: drill.score,
      completedAt: drill.completedAt,
      failurePattern: drill.failurePattern,
      skillId: drill.skillId,
      roleId: drill.roleId,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:drillId/reassess", requireAuth, validate(reassessmentSchema.omit({ drillId: true })), async (req, res, next) => {
  try {
    const drill = await getOwnedDrill(req.params.drillId, req.user.uid);
    if (drill.status !== "completed") throw new ApiError(400, "DRILL_NOT_COMPLETED", "Complete the correction drill before reassessment.");

    const questions = generateFallbackQuestions(drill.failurePattern, 3, "reassessment");
    const score = scoreQuestions(questions, req.body.answers);
    const now = new Date().toISOString();

    const existingSkillSnap = await db.collection("studentSkills")
      .where("userId", "==", req.user.uid)
      .where("skillId", "==", drill.skillId)
      .get();
    let previous = 0;
    if (existingSkillSnap.docs.length) previous = Number(existingSkillSnap.docs[0].data().evidenceScore ?? 0);
    const newEvidence = updateEvidence(previous, score);

    let skillDocId;
    if (existingSkillSnap.docs.length) {
      skillDocId = existingSkillSnap.docs[0].id;
      await db.collection("studentSkills").doc(skillDocId).set({ evidenceScore: newEvidence, lastAssessed: now }, { merge: true });
    } else {
      const ref = await db.collection("studentSkills").add({ userId: req.user.uid, skillId: drill.skillId, evidenceScore: newEvidence, confidence: 0.5, lastAssessed: now });
      skillDocId = ref.id;
    }

    const attemptPayload = {
      userId: req.user.uid,
      type: "reassessment",
      contextType: "coding",
      questionId: questions.map((q) => q.questionId).join(","),
      answer: JSON.stringify(req.body.answers),
      correct: score >= 70,
      timeTaken: 0,
      hintsUsed: 0,
      attemptsCount: 1,
      correctionDrillId: drill.id,
      failurePatternValue: drill.failurePattern,
      score,
      createdAt: now,
    };
    const attemptRef = await db.collection("attempts").add(attemptPayload);

    const readiness = await updateReadinessForRole(req.user.uid, drill.roleId);

    // Add a compact reassessment record. Failure Autopsy remains the source of
    // truth for normal failure classification; this record lets Progress show
    // the intervention journey without inventing failure data.
    const reassessmentPayload = {
      userId: req.user.uid,
      drillId: drill.id,
      roleId: drill.roleId,
      skillId: drill.skillId,
      failurePattern: drill.failurePattern,
      attemptId: attemptRef.id,
      score,
      previousEvidence: previous,
      newEvidence,
      createdAt: now,
    };
    const reassessmentRef = await db.collection("reassessments").add(reassessmentPayload);

    return created(res, {
      id: reassessmentRef.id,
      ...reassessmentPayload,
      readiness,
      studentSkillId: skillDocId,
      message: score >= 70
        ? "Reassessment met the progression threshold; your evidence and readiness were updated."
        : "Reassessment recorded; your evidence and readiness were updated, but the weakness still needs practice.",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:drillId/reassessment", requireAuth, async (req, res, next) => {
  try {
    const drill = await getOwnedDrill(req.params.drillId, req.user.uid);
    const snap = await db.collection("reassessments").where("drillId", "==", drill.id).get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (rows[0]) return ok(res, rows[0]);
    return ok(res, {
      available: true,
      questions: generateFallbackQuestions(drill.failurePattern, 3, "reassessment"),
      failurePattern: drill.failurePattern,
      skillId: drill.skillId,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
