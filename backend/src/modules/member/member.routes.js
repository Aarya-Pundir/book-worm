import { Router } from "express";
import { clearCookieOptions, cookieOptions, SESSION_COOKIE, signSession } from "../../lib/session.js";
import { requireAuth } from "../../middleware/auth.js";
import { createLoginLimiter, createRegisterLimiter } from "../../middleware/rateLimit.js";
import { logger } from "../../lib/logger.js";
import { CART_COOKIE, clearCartCookieOptions } from "../order/cart.token.js";
import { mergeGuestCart } from "../order/cart.service.js";
import * as service from "./member.service.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Moves the guest cart into the member's cart (FR-051). A cart problem must never block sign-in. */
async function mergeCartOnSignIn(req, res, memberId) {
  const token = req.cookies?.[CART_COOKIE];
  if (!token) return;
  try {
    await mergeGuestCart(token, memberId);
    res.clearCookie(CART_COOKIE, clearCartCookieOptions());
  } catch (err) {
    logger.error({ err: err.message }, "Guest cart merge failed");
  }
}

/** Limiter options are injectable so tests can use small limits. */
export function createMemberRoutes({ loginLimiter = createLoginLimiter(), registerLimiter = createRegisterLimiter() } = {}) {
  const router = Router();

  router.post(
    "/register",
    registerLimiter,
    wrap(async (req, res) => {
      const member = await service.register(req.body);
      res.status(201).json({ member, message: "Account created. You can now sign in." });
    }),
  );

  router.post(
    "/login",
    loginLimiter,
    wrap(async (req, res) => {
      const member = await service.login(req.body);
      res.cookie(SESSION_COOKIE, signSession(member.id), cookieOptions());
      await mergeCartOnSignIn(req, res, member.id);
      res.json({ member });
    }),
  );

  router.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, clearCookieOptions());
    res.status(204).end();
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ member: req.member });
  });

  return router;
}
