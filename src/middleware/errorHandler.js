import { ApiError } from "../lib/apiResponse.js";

// Central Express error handler. Keep this last in the middleware chain.
// Never leaks stack traces or internals to the client.
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // Unknown/unexpected error — log server-side, return a generic message.
  console.error("[unhandled error]", err);
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.originalUrl}` },
  });
}
