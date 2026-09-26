// Consistent API response envelope used by every route.

export function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function created(res, data) {
  return ok(res, data, 201);
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = "Resource not found") {
  return new ApiError(404, "NOT_FOUND", message);
}

export function forbidden(message = "You do not have access to this resource") {
  return new ApiError(403, "FORBIDDEN", message);
}

export function badRequest(message = "Invalid request", details) {
  return new ApiError(400, "BAD_REQUEST", message, details);
}
