import cookieParser from "cookie-parser";
import { AppError } from "../lib/errors.js";
import { SESSION_COOKIE, verifySession } from "../lib/session.js";
import { getProfile } from "../modules/member/member.service.js";

export const parseCookies = cookieParser();

/** Sets req.member when a valid session exists; never rejects (for public routes that personalise). */
export async function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    const memberId = token ? verifySession(token) : null;
    req.member = memberId ? await getProfile(memberId) : null;
    next();
  } catch (err) {
    next(err);
  }
}

/** Rejects with 401 unless a valid session exists. Sets req.member (id, name, email, mobile, role). */
export async function requireAuth(req, _res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    const memberId = token ? verifySession(token) : null;
    const member = memberId ? await getProfile(memberId) : null;
    if (!member) throw new AppError(401, "UNAUTHENTICATED", "Please sign in to continue");
    req.member = member;
    next();
  } catch (err) {
    next(err);
  }
}
