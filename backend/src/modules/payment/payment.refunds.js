import { query, withTransaction } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { toCents } from "../../lib/money.js";
import { getGateway } from "./gateway/index.js";
import * as repo from "./payment.repository.js";

/**
 * REFUNDS AND DELIVERY-TIME PAYMENT CHANGES (temporary mock gateway; PENDING ADMIN APPROVAL: provider and lifecycle).
 * Payment requirements stay PARTIAL. This file only touches the payments and refunds tables; it never imports
 * the order module, so the order module can call it without a dependency cycle.
 *
 * Safety rules:
 *  - An order is refunded at most once per reason (unique index), so a repeated request never refunds twice (FR-077).
 *  - The gateway is called OUTSIDE any database transaction. If it fails, throws or answers oddly, the refund simply
 *    stays PENDING and is retried later; money is never marked returned without an approval (FR-080).
 *  - Cash on Delivery is refunded only if the cash was already collected (status PAID) (FR-077).
 */

const REFUNDABLE = new Set(["AUTHORIZED", "PAID"]);

/** Creates the refund record inside the caller's transaction. Returns { id, status }. */
export async function startRefund(db, { orderId, reason, amountCents }) {
  const payment = await repo.latestForOrder(orderId, db);

  let status = "NOT_REQUIRED";
  let amount = 0;
  if (payment && REFUNDABLE.has(payment.status) && amountCents > 0) {
    status = "PENDING";
    amount = Math.min(amountCents, toCents(payment.amount)) / 100;
  } else if (payment?.status === "PAY_ON_DELIVERY_PENDING") {
    // No cash was collected, so no money moves. The payment simply ends here.
    await repo.updateStatus(db, payment.id, "CANCELLED");
  }

  const { rows } = await db.query(
    `INSERT INTO refunds (order_id, payment_id, reason, amount, status) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (order_id, reason) DO NOTHING RETURNING id::int AS id, status`,
    [orderId, payment?.id ?? null, reason, amount, status],
  );
  if (rows[0]) return rows[0];
  const existing = await db.query("SELECT id::int AS id, status FROM refunds WHERE order_id = $1 AND reason = $2", [orderId, reason]);
  return existing.rows[0];
}

/** Cash on Delivery becomes Paid when the shipment is Delivered (FR-072a). Inside the caller's transaction. */
export async function markCodPaid(db, orderId) {
  await db.query("UPDATE payments SET status = 'PAID', updated_at = now() WHERE order_id = $1 AND status = 'PAY_ON_DELIVERY_PENDING'", [orderId]);
}

/**
 * Asks the gateway to return the money, then records the result. Safe to call again: only a PENDING refund acts, and
 * the gateway is given a fixed reference per order and reason so it can recognise a repeat.
 */
export async function settleRefund(refundId) {
  const { rows } = await query(
    `SELECT r.id::int AS id, r.order_id::int AS "orderId", r.payment_id::int AS "paymentId", r.reason, r.status,
            r.amount::float8 AS amount, o.order_number AS "orderNumber"
       FROM refunds r JOIN orders o ON o.id = r.order_id WHERE r.id = $1`,
    [refundId],
  );
  const refund = rows[0];
  if (!refund || refund.status !== "PENDING") return refund ?? null;

  let approved = false;
  let gatewayRef;
  try {
    const gateway = getGateway();
    if (typeof gateway.refund === "function") {
      const result = await gateway.refund({ amountCents: toCents(refund.amount), reference: `REFUND-${refund.orderNumber}-${refund.reason}` });
      if (result?.approved === true && typeof result.gatewayRef === "string" && result.gatewayRef.length > 0) {
        approved = true;
        gatewayRef = result.gatewayRef.slice(0, 100);
      } else {
        logger.warn({ event: "refund.not_approved", orderNumber: refund.orderNumber }, "Refund not approved; it stays pending");
      }
    }
  } catch (err) {
    logger.error({ event: "refund.gateway_error", orderNumber: refund.orderNumber, err: err?.message }, "Refund gateway error");
  }
  if (!approved) return refund;

  await withTransaction(async (db) => {
    const done = await db.query(
      "UPDATE refunds SET status = 'COMPLETED', gateway_ref = $2, updated_at = now() WHERE id = $1 AND status = 'PENDING' RETURNING id",
      [refund.id, gatewayRef],
    );
    if (done.rowCount === 0) return;
    const payment = await db.query("SELECT amount::float8 AS amount FROM payments WHERE id = $1", [refund.paymentId]);
    const refunded = await db.query("SELECT COALESCE(sum(amount), 0)::float8 AS total FROM refunds WHERE payment_id = $1 AND status = 'COMPLETED'", [refund.paymentId]);
    const full = toCents(refunded.rows[0].total) >= toCents(payment.rows[0].amount);
    await db.query("UPDATE payments SET status = $2, updated_at = now() WHERE id = $1", [refund.paymentId, full ? "REFUNDED" : "PARTIALLY_REFUNDED"]);
  });
  logger.info({ event: "refund.completed", orderNumber: refund.orderNumber, reason: refund.reason }, "Refund completed");
  return { ...refund, status: "COMPLETED" };
}

/** Refunds the gateway did not confirm yet, so the background sweep can try them again. */
export async function retryPendingRefunds(limit = 50) {
  const { rows } = await query("SELECT id::int AS id FROM refunds WHERE status = 'PENDING' ORDER BY id LIMIT $1", [limit]);
  for (const r of rows) await settleRefund(r.id);
  return rows.length;
}

/** What the member sees for an order (FR-077). */
export async function listRefunds(orderId, db = { query }) {
  const { rows } = await db.query(
    "SELECT reason, amount::float8 AS amount, status, created_at AS \"createdAt\" FROM refunds WHERE order_id = $1 ORDER BY id",
    [orderId],
  );
  return rows;
}
