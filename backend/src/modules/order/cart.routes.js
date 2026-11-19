import { Router } from "express";
import { optionalAuth } from "../../middleware/auth.js";
import * as service from "./cart.service.js";
import { CART_COOKIE, cartCookieOptions, hashCartToken, newCartToken } from "./cart.token.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Carts are open to guests (FR-047), so every route works for a member or a guest cookie. */
export function createCartRoutes() {
  const router = Router();
  router.use(optionalAuth);

  const ownerOf = (req) => service.resolveOwner({ member: req.member, cartToken: req.cookies?.[CART_COOKIE] });

  // A visitor's first add creates their guest token. Reading the cart never does.
  const ownerForAdd = (req, res) => {
    const owner = ownerOf(req);
    if (owner) return owner;
    const token = newCartToken();
    res.cookie(CART_COOKIE, token, cartCookieOptions());
    return { tokenHash: hashCartToken(token) };
  };

  router.get("/", wrap(async (req, res) => res.json({ cart: await service.getCart(ownerOf(req)) })));

  router.post(
    "/items",
    wrap(async (req, res) => {
      res.json(await service.addItem(ownerForAdd(req, res), req.body));
    }),
  );

  router.patch(
    "/items/:bookId",
    wrap(async (req, res) => res.json(await service.updateItem(ownerOf(req), req.params.bookId, req.body))),
  );

  router.delete(
    "/items/:bookId",
    wrap(async (req, res) => res.json(await service.removeItem(ownerOf(req), req.params.bookId))),
  );

  return router;
}
