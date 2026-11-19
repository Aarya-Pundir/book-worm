import { AppError } from "../lib/errors.js";

/**
 * Role check, enforced on the server for every protected route (FR-012).
 * Must run after requireAuth. Roles are PENDING ADMIN APPROVAL placeholders (MEMBER, ADMIN).
 */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.member) return next(new AppError(401, "UNAUTHENTICATED", "Please sign in to continue"));
    if (!roles.includes(req.member.role)) {
      return next(new AppError(403, "FORBIDDEN", "You do not have permission to do this"));
    }
    return next();
  };
