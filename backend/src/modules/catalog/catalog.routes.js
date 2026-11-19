import { Router } from "express";
import { optionalAuth } from "../../middleware/auth.js";
import * as service from "./catalog.service.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Catalogue viewing is public (FR-014). Only /books/recommended looks at the session.
export function createCatalogRoutes() {
  const router = Router();

  router.get("/categories", wrap(async (_req, res) => res.json(await service.categories())));
  router.get("/authors", wrap(async (req, res) => res.json(await service.authors(req.query.q))));
  router.get("/publishers", wrap(async (_req, res) => res.json(await service.publishers())));
  router.get("/languages", wrap(async (_req, res) => res.json(await service.languages())));

  router.get("/books", wrap(async (req, res) => res.json(await service.searchBooks(req.query))));
  // Declared before /books/:id so "featured" and "recommended" are not read as ids.
  router.get("/books/featured", wrap(async (req, res) => res.json(await service.featured(req.query.type, req.query.limit))));
  router.get(
    "/books/recommended",
    optionalAuth,
    wrap(async (req, res) => res.json(await service.recommended(req.member, req.query.limit))),
  );
  router.get("/books/:id", wrap(async (req, res) => res.json({ book: await service.getBook(req.params.id) })));

  return router;
}
