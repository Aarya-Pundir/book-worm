import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as orders from "../order/order.service.js";
import * as service from "./payment.service.js";

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createPaymentRoutes() {
  const router = Router();
  router.use(requireAuth);

  // The idempotency key comes from the Idempotency-Key header (or the body). Repeating it never charges twice.
  router.post("/", wrap(async (req, res) => res.json(await service.pay(req.member, req.body, req.get("Idempotency-Key")))));

  // Payment confirmation for the member's own order (FR-076).
  router.get(
    "/:orderNumber",
    wrap(async (req, res) => {
      const order = await orders.getOrder(req.member.id, req.params.orderNumber);
      res.json({ payment: await service.paymentForOrder(order.id) });
    }),
  );

  return router;
}
