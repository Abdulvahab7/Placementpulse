// Minimal in-memory rate limiter, scoped to AI-cost-bearing endpoints
// (JD parsing, failure classification). Phase 1 explicitly flagged the lack
// of this as a Known Issue "worth revisiting once Phase 2 adds AI-cost-bearing
// endpoints" — this is that revisit. Per-user (req.user.uid), sliding window.
//
// NOTE: in-memory only, so it resets on restart and does not share state across
// multiple server instances. Good enough for Phase 2's scope; a shared store
// (Redis, Firestore-backed counters) would be needed for multi-instance deployment.

const buckets = new Map(); // uid -> array of request timestamps (ms)

export function rateLimit({ windowMs = 60_000, max = 10 } = {}) {
  return (req, res, next) => {
    const key = req.user?.uid ?? req.ip;
    const now = Date.now();
    const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

    if (timestamps.length >= max) {
      return res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: `Too many requests. Limit is ${max} per ${Math.round(windowMs / 1000)}s.`,
        },
      });
    }

    timestamps.push(now);
    buckets.set(key, timestamps);
    return next();
  };
}

// Test-only helper to reset state between test files/suites.
export function __resetRateLimitState() {
  buckets.clear();
}
