import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../lib/firebaseAdmin.js";
import { ok, created, notFound, forbidden } from "../lib/apiResponse.js";

/**
 * Builds an Express router for a Firestore collection whose documents belong
 * to exactly one user (studentSkills, attempts, failurePatterns, interventions, readiness).
 *
 * Every document is stamped with userId = req.user.uid (never client-supplied),
 * and every read/update/delete is scoped to docs owned by the caller — this is
 * the Express-side half of isolation; Firestore rules enforce the other half.
 */
export function makeOwnedCollectionRouter(collectionName, schema) {
  const router = Router();

  // GET / — list only the caller's own documents
  router.get("/", requireAuth, async (req, res, next) => {
    try {
      const snap = await db.collection(collectionName).where("userId", "==", req.user.uid).get();
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return ok(res, items);
    } catch (err) {
      next(err);
    }
  });

  // GET /:id — a single doc, only if owned by the caller
  router.get("/:id", requireAuth, async (req, res, next) => {
    try {
      const ref = db.collection(collectionName).doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) throw notFound();
      if (snap.data().userId !== req.user.uid) throw forbidden();
      return ok(res, { id: snap.id, ...snap.data() });
    } catch (err) {
      next(err);
    }
  });

  // POST / — create a new doc owned by the caller
  router.post("/", requireAuth, validate(schema), async (req, res, next) => {
    try {
      const payload = { ...req.body, userId: req.user.uid, createdAt: new Date().toISOString() };
      const ref = await db.collection(collectionName).add(payload);
      return created(res, { id: ref.id, ...payload });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id — update a doc, only if owned by the caller
  router.patch("/:id", requireAuth, validate(schema.partial()), async (req, res, next) => {
    try {
      const ref = db.collection(collectionName).doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) throw notFound();
      if (snap.data().userId !== req.user.uid) throw forbidden();
      await ref.set({ ...req.body, updatedAt: new Date().toISOString() }, { merge: true });
      const updated = await ref.get();
      return ok(res, { id: updated.id, ...updated.data() });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id — delete a doc, only if owned by the caller
  router.delete("/:id", requireAuth, async (req, res, next) => {
    try {
      const ref = db.collection(collectionName).doc(req.params.id);
      const snap = await ref.get();
      if (!snap.exists) throw notFound();
      if (snap.data().userId !== req.user.uid) throw forbidden();
      await ref.delete();
      return ok(res, { id: req.params.id, deleted: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
