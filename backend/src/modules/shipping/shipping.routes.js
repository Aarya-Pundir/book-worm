import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as service from "./shipping.service.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Addresses belong to the signed-in member only. Every query is scoped by member id (FR-071). */
export function createAddressRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", wrap(async (req, res) => res.json({ items: await service.listAddresses(req.member.id) })));
  router.post("/", wrap(async (req, res) => res.status(201).json({ address: await service.createAddress(req.member.id, req.body) })));
  router.put("/:id", wrap(async (req, res) => res.json({ address: await service.updateAddress(req.member.id, req.params.id, req.body) })));
  router.delete(
    "/:id",
    wrap(async (req, res) => {
      await service.deleteAddress(req.member.id, req.params.id);
      res.status(204).end();
    }),
  );

  return router;
}
