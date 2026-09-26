import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { readinessSchema } from "../schemas/index.js";
import { db } from "../lib/firebaseAdmin.js";
import { ok, notFound, forbidden } from "../lib/apiResponse.js";

const router = Router();
const COLLECTION = "readiness";

// GET / — all readiness records for the caller
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const snap = await db.collection(COLLECTION).where("userId", "==", req.user.uid).get();
    return ok(res, snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    next(err);
  }
});

// PUT /:roleId — upsert the caller's readiness for a given role
router.put("/:roleId", requireAuth, validate(readinessSchema.omit({ roleId: true })), async (req, res, next) => {
  try {
    const docId = `${req.user.uid}_${req.params.roleId}`;
    const ref = db.collection(COLLECTION).doc(docId);
    const payload = {
      ...req.body,
      roleId: req.params.roleId,
      userId: req.user.uid,
      updatedAt: new Date().toISOString(),
    };
    await ref.set(payload, { merge: true });
    return ok(res, { id: docId, ...payload });
  } catch (err) {
    next(err);
  }
});

// GET /:roleId
router.get("/:roleId", requireAuth, async (req, res, next) => {
  try {
    const docId = `${req.user.uid}_${req.params.roleId}`;
    const snap = await db.collection(COLLECTION).doc(docId).get();
    if (!snap.exists) throw notFound();
    if (snap.data().userId !== req.user.uid) throw forbidden();
    return ok(res, { id: snap.id, ...snap.data() });
  } catch (err) {
    next(err);
  }
});

export default router;
