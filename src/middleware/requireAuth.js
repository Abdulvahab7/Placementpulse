import { auth } from "../lib/firebaseAdmin.js";

/**
 * requireAuth
 *
 * Verifies the Firebase ID token sent in the `Authorization: Bearer <token>` header.
 * Never trusts a userId supplied by the client body/query — req.user.uid is the only
 * source of truth for "who is making this request", and it comes straight from the
 * verified token.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHENTICATED", message: "Missing or malformed Authorization header" },
      });
    }

    const decoded = await auth.verifyIdToken(token);

    req.user = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
    };

    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: { code: "INVALID_TOKEN", message: "Invalid or expired authentication token" },
    });
  }
}
