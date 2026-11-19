import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, "NOT_FOUND", "Resource not found"));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    const body = { code: err.code, message: err.message };
    if (err.fields) body.fields = err.fields;
    return res.status(err.status).json({ error: body });
  }
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request is too large" } });
  }
  if (err?.type === "entity.parse.failed" || err?.status === 400) {
    return res
      .status(400)
      .json({ error: { code: "BAD_REQUEST", message: "Invalid request" } });
  }
  // Details are logged server-side only; clients get a generic message.
  logger.error({ err }, "Unhandled error");
  return res
    .status(500)
    .json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}
