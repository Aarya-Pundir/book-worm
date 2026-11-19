import { rateLimit } from "express-rate-limit";
import { AppError } from "../lib/errors.js";

const handler = (_req, _res, next) =>
  next(new AppError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Please try again later."));

/**
 * Temporarily limits repeated attempts (FR-007).
 * Only failed sign-ins count (skipSuccessfulRequests), keyed by client IP.
 */
export function createLoginLimiter({ max = 10, windowMs = 15 * 60 * 1000 } = {}) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler,
  });
}

export function createRegisterLimiter({ max = 20, windowMs = 60 * 60 * 1000 } = {}) {
  return rateLimit({ windowMs, limit: max, standardHeaders: "draft-8", legacyHeaders: false, handler });
}
