import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { db } from "../lib/firebaseAdmin.js";
import { ok, created, notFound } from "../lib/apiResponse.js";

/**
 * Builds an Express router for a shared reference collection (skills, companies,
 * roles, roleRequirements). Any authenticated user can read; writes are allowed
 * here at the API layer for Phase 1 admin/content-seeding purposes, but Firestore
 * rules additionally restrict direct client writes to these collections.
 */
export function makePublicCollectionRouter(collectionName, schema, { filterableFields = [] } = {}) {
  const router = Router();

  // GET / — list all, with optional equality filters, e.g. ?companyId=xyz
  router.get("/", requireAuth, async (req, res, next) => {
    try {
      let query = db.collection(collectionName);
      for (const field of filterableFields) {
        if (req.query[field] !== undefined) {
          query = query.where(field, "==", req.query[field]);
        }
      }
      const snap = await query.get();
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return ok(res, items);
    } catch (err) {
      next(err);
    }
  });

  // GET /:id
  router.get("/:id", requireAuth, async (req, res, next) => {
    try {
      const snap = await db.collection(collectionName).doc(req.params.id).get();
      if (!snap.exists) throw notFound();
      return ok(res, { id: snap.id, ...snap.data() });
    } catch (err) {
      next(err);
    }
  });

  // POST / — create (Phase 1: any authenticated user; tighten in Firestore rules / later phases)
  router.post("/", requireAuth, validate(schema), async (req, res, next) => {
    try {
      const payload = { ...req.body, createdAt: new Date().toISOString() };
      const ref = await db.collection(collectionName).add(payload);
      return created(res, { id: ref.id, ...payload });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
