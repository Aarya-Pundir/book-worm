import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middleware/auth.js";
import * as wishlist from "./wishlist.service.js";
import * as writers from "./writers.service.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * /api/wishlist: members only (FR-081, FR-090). Guests get 401 before any code runs. Every call is scoped to the
 * member in the session; nothing in a request can name another member.
 */
export function createWishlistRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", wrap(async (req, res) => res.json(await wishlist.getWishlist(req.member.id))));

  router.post(
    "/items",
    wrap(async (req, res) => {
      const { created, item, count } = await wishlist.addToWishlist(req.member.id, req.body);
      res.status(created ? 201 : 200).json({ item, count });
    }),
  );

  router.delete(
    "/items/:bookId",
    wrap(async (req, res) => {
      await wishlist.removeFromWishlist(req.member.id, req.params.bookId);
      res.status(204).end();
    }),
  );

  router.post("/cart", wrap(async (req, res) => res.json(await wishlist.addWishlistToCart(req.member.id, req.body))));

  return router;
}

/** /api/writers: members only. The writer's books come from the public catalogue (GET /api/books?author=). */
export function createWritersRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", wrap(async (req, res) => res.json(await writers.listFollowedWriters(req.member.id))));

  router.post(
    "/:authorId/follow",
    wrap(async (req, res) => {
      const { created, author } = await writers.followWriter(req.member.id, req.params.authorId);
      res.status(created ? 201 : 200).json({ author });
    }),
  );

  router.delete(
    "/:authorId/follow",
    wrap(async (req, res) => {
      await writers.unfollowWriter(req.member.id, req.params.authorId);
      res.status(204).end();
    }),
  );

  return router;
}

/**
 * GET /api/authors/:id is public like the rest of the catalogue (FR-089). It lives in the Member module so that
 * Catalog never has to know about members; the list `GET /api/authors` stays in Catalog and is not touched.
 */
export function createWriterPageRoutes() {
  const router = Router();
  router.get("/:id", optionalAuth, wrap(async (req, res) => res.json({ author: await writers.getWriter(req.member, req.params.id) })));
  return router;
}
