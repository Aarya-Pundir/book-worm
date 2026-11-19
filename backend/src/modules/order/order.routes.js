import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { authorize } from "../../middleware/authorize.js";
import * as lifecycle from "./order.lifecycle.js";
import * as service from "./order.service.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Checkout and orders belong to the signed-in member. Every lookup is scoped by member id (FR-071). */
export function createOrderRoutes() {
  const router = Router();

  // Read-only summary of what checkout would charge (address, shipping, coupon, points, total).
  router.post("/checkout/review", requireAuth, wrap(async (req, res) => res.json({ review: await service.review(req.member.id, req.body) })));
  // Creates (or refreshes) the member's order in Pending Payment.
  router.post("/checkout/order", requireAuth, wrap(async (req, res) => res.status(201).json(await service.placeOrder(req.member.id, req.body))));
  // My Orders (newest first) and the full details of one order. Both are scoped to the signed-in member (FR-063, FR-064).
  router.get("/orders", requireAuth, wrap(async (req, res) => res.json({ items: await lifecycle.listOrders(req.member.id) })));
  router.get("/orders/:orderNumber", requireAuth, wrap(async (req, res) => res.json({ order: await lifecycle.getOrderDetail(req.member.id, req.params.orderNumber) })));
  router.post("/orders/:orderNumber/cancel", requireAuth, wrap(async (req, res) => res.json({ order: await lifecycle.cancelOrder(req.member.id, req.params.orderNumber, req.body) })));
  router.post("/orders/:orderNumber/return", requireAuth, wrap(async (req, res) => res.json({ order: await lifecycle.requestReturn(req.member.id, req.params.orderNumber) })));
  router.post("/orders/:orderNumber/buy-again", requireAuth, wrap(async (req, res) => res.json(await lifecycle.buyAgain(req.member.id, req.params.orderNumber))));

  // Admin-only demo override of the simulated carrier (FR-059a). Members and guests are refused by the server.
  router.post("/admin/orders/:orderNumber/shipment", requireAuth, authorize("ADMIN"), wrap(async (req, res) => res.json(await lifecycle.overrideShipmentStatus(req.params.orderNumber, req.body))));
  router.post("/admin/orders/:orderNumber/return", requireAuth, authorize("ADMIN"), wrap(async (req, res) => res.json(await lifecycle.overrideReturnStatus(req.params.orderNumber, req.body))));

  return router;
}

export function createGiftPointRoutes() {
  const router = Router();
  router.use(requireAuth);
  router.get("/", wrap(async (req, res) => res.json(await service.giftPoints(req.member.id))));
  return router;
}
