import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { userProfileSchema, userProfileUpdateSchema } from "../schemas/index.js";
import { db } from "../lib/firebaseAdmin.js";
import { ok, created, notFound } from "../lib/apiResponse.js";

const router = Router();
const COLLECTION = "users";

// GET /api/users/me — the authenticated user's own profile
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const snap = await db.collection(COLLECTION).doc(req.user.uid).get();
    if (!snap.exists) throw notFound("User profile not found");
    return ok(res, { userId: snap.id, ...snap.data() });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/me — create or fully set the authenticated user's profile
router.put("/me", requireAuth, validate(userProfileSchema), async (req, res, next) => {
  try {
    const docRef = db.collection(COLLECTION).doc(req.user.uid);
    const payload = { ...req.body, email: req.user.email, userId: req.user.uid };
    await docRef.set(payload, { merge: false });
    return created(res, { userId: req.user.uid, ...payload });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/me — partial update of the authenticated user's profile
router.patch("/me", requireAuth, validate(userProfileUpdateSchema), async (req, res, next) => {
  try {
    const docRef = db.collection(COLLECTION).doc(req.user.uid);
    await docRef.set(req.body, { merge: true });
    const snap = await docRef.get();
    return ok(res, { userId: snap.id, ...snap.data() });
  } catch (err) {
    next(err);
  }
});

export default router;
