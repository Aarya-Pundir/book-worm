import { query } from "../../lib/db.js";

const COLUMNS = `p.id::int AS id, p.order_id::int AS "orderId", p.method, p.amount::float8 AS amount, p.status,
  p.gateway_ref AS reference, p.masked_indicator AS "maskedIndicator", p.failure_reason AS "failureReason",
  p.idempotency_key AS "idempotencyKey", p.created_at AS "createdAt"`;

export async function findByKey(db, key) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM payments p WHERE p.idempotency_key = $1`, [key]);
  return rows[0] ?? null;
}

export async function insertPayment(db, { orderId, method, amount, status, gatewayRef, maskedIndicator, failureReason, idempotencyKey }) {
  await db.query(
    `INSERT INTO payments (order_id, method, amount, status, gateway_ref, masked_indicator, failure_reason, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [orderId, method, amount, status, gatewayRef ?? null, maskedIndicator ?? null, failureReason ?? null, idempotencyKey],
  );
  return findByKey(db, idempotencyKey);
}

/** The payment that counts for an order: the successful or pay-on-delivery one, else the latest attempt. */
export async function latestForOrder(orderId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM payments p WHERE p.order_id = $1
      ORDER BY (p.status IN ('AUTHORIZED','PAY_ON_DELIVERY_PENDING','PAID')) DESC, p.id DESC LIMIT 1`,
    [orderId],
  );
  return rows[0] ?? null;
}

export async function updateStatus(db, id, status, { gatewayRef, failureReason } = {}) {
  await db.query(
    `UPDATE payments SET status = $2, gateway_ref = COALESCE($3, gateway_ref), failure_reason = $4, updated_at = now()
      WHERE id = $1`,
    [id, status, gatewayRef ?? null, failureReason ?? null],
  );
}

export async function findById(db, id) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM payments p WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}