import { z } from "zod";
import { AppError, notFound, validationError } from "../../lib/errors.js";
import { fieldErrors } from "../../lib/validation.js";
import { withTransaction } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { toCents } from "../../lib/money.js";
import * as orders from "../order/order.service.js";
import { getGateway } from "./gateway/index.js";
import * as repo from "./payment.repository.js";

/**
 * PAYMENT SERVICE (temporary mock gateway; PENDING ADMIN APPROVAL: provider and lifecycle).
 * Payment requirements stay PARTIAL until the Admin approves a provider and this is verified against it.
 *
 * Safety rules enforced here:
 *  - An order is Confirmed only after the gateway approves (online) or the COD terms are accepted (FR-061, SC-014).
 *  - The same idempotency key never creates a second payment, and an order never has two successful payments
 *    (unique key + a partial unique index in the database) (FR-074, SC-015).
 *  - The gateway is called OUTSIDE any database transaction; stock is reserved before and released if it fails.
 *  - No card, UPI or bank details are accepted, stored or logged (FR-073, SC-021).
 */

const GENERIC_FAILURE = "The payment could not be processed. You have not been charged. Please try again or choose another method.";
// A reservation older than this with no result is treated as abandoned and released, so stock never stays held.
const STALE_MS = 2 * 60 * 1000;
const SUCCESS = new Set(["AUTHORIZED", "PAY_ON_DELIVERY_PENDING", "PAID"]);

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
const ALLOWED_FIELDS = new Set(["orderNumber", "method", "idempotencyKey", "acceptCodTerms", "simulate"]);

const paySchema = z.object({
  orderNumber: z.string({ error: "Order number is required" }).trim().min(1, "Order number is required").max(40),
  method: z.enum(["CARD", "UPI", "NET_BANKING", "COD"], { error: "Choose a payment method" }),
  idempotencyKey: z.string({ error: "A payment request id is required" }).regex(KEY_PATTERN, "The payment request id is not valid"),
  acceptCodTerms: z.boolean().optional(),
  simulate: z.enum(["decline", "error"]).optional(),
});

function parsePay(body, headerKey) {
  const raw = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  // Anything else (card number, security code, UPI id ...) is refused outright and never echoed back.
  if (Object.keys(raw).some((k) => !ALLOWED_FIELDS.has(k))) {
    throw validationError({ _: "Payment details are not accepted by this service. Do not send card, UPI or bank details." });
  }
  const parsed = paySchema.safeParse({ ...raw, idempotencyKey: headerKey ?? raw.idempotencyKey });
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  return parsed.data;
}

const isStale = (payment) => Date.now() - new Date(payment.createdAt).getTime() > STALE_MS;

/** Marks the payment failed and gives back stock, coupon use and gift points. Runs inside a transaction. */
async function settleFailure(db, order, payment, reason) {
  await repo.updateStatus(db, payment.id, "FAILED", { failureReason: reason });
  await orders.releaseOrder(db, order, "Payment failed - points returned");
}

const summary = (payment, order) => ({
  payment: {
    method: payment.method,
    amount: payment.amount,
    status: payment.status,
    reference: payment.reference,
    createdAt: payment.createdAt,
  },
  order: {
    orderNumber: order.orderNumber,
    status: order.status,
    total: order.total,
    estimatedDelivery: order.estimatedDelivery,
    confirmedAt: order.confirmedAt,
  },
});

/** Turns a stored payment into the HTTP outcome. A failed payment is an error the member can retry from. */
function outcome(payment, order, extra = {}) {
  if (payment.status === "FAILED") throw new AppError(402, "PAYMENT_FAILED", payment.failureReason || GENERIC_FAILURE);
  return { ...summary(payment, order), ...extra };
}

export async function pay(member, body, headerKey) {
  const input = parsePay(body, headerKey);
  // Scoped to the member, so one member's key can never collide with or reveal another's.
  const key = `${member.id}:${input.idempotencyKey}`;

  // ---- Phase 1 (one transaction): validate, reserve, record the attempt --------------------------------------
  const phase1 = await withTransaction(async (db) => {
    const order = await orders.lockOrderForPayment(db, member.id, input.orderNumber);
    if (!order) throw notFound("Order not found");

    const existing = await repo.findByKey(db, key);
    if (existing) {
      if (existing.orderId !== order.id) {
        throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "This payment request id was already used for a different order.");
      }
      if (existing.status === "INITIATED") {
        if (!isStale(existing)) throw new AppError(409, "PAYMENT_IN_PROGRESS", "Your payment is being processed. Please wait a moment.");
        await settleFailure(db, order, existing, GENERIC_FAILURE);
        return { kind: "replay", payment: await repo.findById(db, existing.id), order: await orders.refreshOrder(db, order.id) };
      }
      return { kind: "replay", payment: existing, order };
    }

    if (order.status !== "Pending Payment") {
      const done = await repo.latestForOrder(order.id, db);
      // Already paid: report that payment instead of charging again.
      if (order.status === "Confirmed" && done && SUCCESS.has(done.status)) return { kind: "replay", payment: done, order };
      throw new AppError(409, "ORDER_NOT_PAYABLE", "This order cannot be paid.");
    }

    let current = order;
    if (current.stockHeld) {
      const last = await repo.latestForOrder(current.id, db);
      if (last?.status === "INITIATED" && !isStale(last)) {
        throw new AppError(409, "PAYMENT_IN_PROGRESS", "A payment for this order is already in progress. Please wait a moment.");
      }
      if (last?.status === "INITIATED") await settleFailure(db, current, last, GENERIC_FAILURE);
      else await orders.releaseOrder(db, current, "Stale reservation released");
      current = await orders.refreshOrder(db, current.id);
    }

    const method = (await orders.paymentMethodsForOrder(db, current)).find((m) => m.method === input.method);
    if (!method?.available) {
      throw new AppError(422, "METHOD_UNAVAILABLE", method?.reason ?? "This payment method is not available for this order.");
    }
    if (input.method === "COD" && input.acceptCodTerms !== true) {
      throw validationError({ acceptCodTerms: "Please accept the Cash on Delivery terms to continue" });
    }

    // Throws (and rolls everything back) if stock, price, coupon or gift points no longer hold.
    await orders.reserveOrder(db, current);

    const base = { orderId: current.id, method: input.method, amount: current.total, idempotencyKey: key };
    const amountCents = toCents(current.total);

    if (input.method === "COD") {
      // FR-072a: Confirmed on acceptance of the terms; payment stays "Pay on Delivery - Pending" until delivery.
      const payment = await repo.insertPayment(db, { ...base, status: "PAY_ON_DELIVERY_PENDING" });
      await orders.confirmOrder(db, current);
      return { kind: "done", payment, order: await orders.refreshOrder(db, current.id) };
    }
    if (amountCents === 0) {
      const payment = await repo.insertPayment(db, { ...base, status: "AUTHORIZED", gatewayRef: "NO-CHARGE" });
      await orders.confirmOrder(db, current);
      return { kind: "done", payment, order: await orders.refreshOrder(db, current.id) };
    }
    const payment = await repo.insertPayment(db, { ...base, status: "INITIATED" });
    return { kind: "pending", payment, order: current, amountCents };
  });

  if (phase1.kind === "replay") return outcome(phase1.payment, phase1.order, { replayed: true });
  if (phase1.kind === "done") {
    logger.info({ event: "payment.cod_accepted", orderNumber: phase1.order.orderNumber }, "Cash on Delivery order confirmed");
    return outcome(phase1.payment, phase1.order);
  }

  // ---- Gateway call: outside any transaction, never trusted -------------------------------------------------
  const { payment, order } = phase1;
  let approved = false;
  let gatewayRef;
  let failureReason = GENERIC_FAILURE;
  try {
    const result = await getGateway().authorize({
      method: input.method,
      amountCents: phase1.amountCents,
      reference: `${order.orderNumber}-${payment.id}`,
      simulate: input.simulate,
    });
    if (result?.approved === true && typeof result.gatewayRef === "string" && result.gatewayRef.length > 0) {
      approved = true;
      gatewayRef = result.gatewayRef.slice(0, 100);
    } else if (result?.approved === false && typeof result.failureReason === "string" && result.failureReason.length <= 200) {
      failureReason = result.failureReason;
    } else {
      logger.error({ event: "payment.unexpected_response", orderNumber: order.orderNumber }, "Unexpected gateway response");
    }
  } catch (err) {
    // Only the message is logged; the error object could carry request data.
    logger.error({ event: "payment.gateway_error", orderNumber: order.orderNumber, err: err?.message }, "Payment gateway error");
  }

  // ---- Phase 2 (one transaction): settle ---------------------------------------------------------------------
  const settled = await withTransaction(async (db) => {
    const locked = await orders.lockOrderForPayment(db, member.id, input.orderNumber);
    const current = await repo.findById(db, payment.id);
    // Another request (or the stale-reservation cleanup) already settled it: report what is stored.
    if (current.status !== "INITIATED") return { payment: current, order: locked };
    if (approved) {
      await repo.updateStatus(db, payment.id, "AUTHORIZED", { gatewayRef });
      await orders.confirmOrder(db, locked);
    } else {
      await settleFailure(db, locked, current, failureReason);
    }
    return { payment: await repo.findById(db, payment.id), order: await orders.refreshOrder(db, locked.id) };
  });

  logger.info(
    { event: settled.payment.status === "AUTHORIZED" ? "payment.authorized" : "payment.failed", orderNumber: order.orderNumber, method: input.method },
    "Payment settled",
  );
  return outcome(settled.payment, settled.order);
}

/** The payment confirmation stored with an order (FR-076). Null if none. */
export async function paymentForOrder(orderId) {
  const p = await repo.latestForOrder(orderId);
  return p && { method: p.method, amount: p.amount, status: p.status, reference: p.reference, createdAt: p.createdAt };
}
