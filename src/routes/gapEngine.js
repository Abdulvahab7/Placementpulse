// Gap Engine: deterministic skill-gap calculation for Company/Role Explorer.

import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { db } from "../lib/firebaseAdmin.js";
import { ok, notFound } from "../lib/apiResponse.js";
import { computeGaps, summarizeGaps } from "../lib/gapEngine.js";

const router = Router();

// GET /api/gap-engine/:roleId — this student's gap against a role's requirements.
router.get("/:roleId", requireAuth, async (req, res, next) => {
  try {
    const { roleId } = req.params;

    const roleSnap = await db.collection("roles").doc(roleId).get();
    if (!roleSnap.exists) throw notFound("Role not found");

    const requirementsSnap = await db.collection("roleRequirements").where("roleId", "==", roleId).get();
    const requirements = requirementsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const studentSkillsSnap = await db
      .collection("studentSkills")
      .where("userId", "==", req.user.uid)
      .get();
    const studentSkillsBySkillId = new Map(
      studentSkillsSnap.docs.map((d) => [d.data().skillId, { id: d.id, ...d.data() }])
    );

    const gaps = computeGaps(requirements, studentSkillsBySkillId);
    const summary = summarizeGaps(gaps);

    return ok(res, {
      roleId,
      role: { id: roleSnap.id, ...roleSnap.data() },
      gaps,
      summary,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
