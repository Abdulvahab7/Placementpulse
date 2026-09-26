import { badRequest } from "../lib/apiResponse.js";

/**
 * validate(schema) — Zod request-body validator.
 * Rejects malformed input with 400 before any Firestore access happens,
 * and strips unknown fields by replacing req.body with the parsed result.
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(badRequest("Validation failed", result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}
