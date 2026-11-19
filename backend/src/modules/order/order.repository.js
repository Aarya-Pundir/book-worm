import { query } from "../../lib/db.js";

// All functions take an optional `db` (a transaction client) so callers can group them atomically.

const ORDER_COLUMNS = `
  o.id::int AS id, o.order_number AS "orderNumber", o.member_id::int AS "memberId", o.status,
  o.subtotal::float8 AS subtotal, o.shipping_charge::float8 AS "shippingCharge",
  o.coupon_id::int AS "couponId", o.coupon_code AS "couponCode", o.coupon_discount::float8 AS "couponDiscount",
  o.points_redeemed AS "pointsRedeemed", o.points_discount::float8 AS "pointsDiscount",
  o.total::float8 AS total, o.estimated_delivery::text AS "estimatedDelivery",
  o.address_snapshot AS address, o.stock_held AS "stockHeld",
  o.confirmed_at AS "confirmedAt", o.created_at AS "createdAt", o.delivered_at AS "deliveredAt",
  o.cancelled_at AS "cancelledAt", o.cancel_reason AS "cancelReason"`;

// ---- Gift points (ledger) --------------------------------------------------------------------------------

/** Callers that change the ledger lock the member first, so two checkouts cannot overspend points. */
export async function lockMember(memberId, db) {
  await db.query("SELECT id FROM members WHERE id = $1 FOR UPDATE", [memberId]);
}

export async function pointsBalance(memberId, db = { query }) {
  const { rows } = await db.query(
    "SELECT balance_after FROM gift_point_ledger WHERE member_id = $1 ORDER BY id DESC LIMIT 1",
    [memberId],
  );
  return rows[0]?.balance_after ?? 0;
}

/** Appends an entry and returns the new balance. The CHECK constraints refuse a negative balance. */
export async function addLedgerEntry(db, { memberId, type, points, orderId = null, note = null }) {
  const balanceAfter = (await pointsBalance(memberId, db)) + points;
  await db.query(
    `INSERT INTO gift_point_ledger (member_id, type, points, balance_after, order_id, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [memberId, type, points, balanceAfter, orderId, note],
  );
  return balanceAfter;
}

export async function listLedger(memberId, limit = 50) {
  const { rows } = await query(
    `SELECT l.type, l.points, l.balance_after AS "balanceAfter", l.note, l.created_at AS "createdAt",
            o.order_number AS "orderNumber"
       FROM gift_point_ledger l LEFT JOIN orders o ON o.id = l.order_id
      WHERE l.member_id = $1 ORDER BY l.id DESC LIMIT $2`,
    [memberId, limit],
  );
  return rows;
}

// ---- Coupons ---------------------------------------------------------------------------------------------

export async function findCouponByCode(code, db = { query }) {
  const { rows } = await db.query("SELECT * FROM coupons WHERE code = $1", [code]);
  return rows[0] ?? null;
}

export async function lockCoupon(db, id) {
  const { rows } = await db.query("SELECT * FROM coupons WHERE id = $1 FOR UPDATE", [id]);
  return rows[0] ?? null;
}

/** Takes one use, only if the limit still allows it. */
export async function takeCouponUse(db, id) {
  const { rowCount } = await db.query(
    "UPDATE coupons SET used_count = used_count + 1 WHERE id = $1 AND (usage_limit IS NULL OR used_count < usage_limit)",
    [id],
  );
  return rowCount === 1;
}

export async function returnCouponUse(db, id) {
  await db.query("UPDATE coupons SET used_count = used_count - 1 WHERE id = $1 AND used_count > 0", [id]);
}

// ---- Books and stock (PENDING ADMIN APPROVAL: inventory rules) -------------------------------------------

/** Locks the rows in id order so two checkouts of overlapping carts cannot deadlock. */
export async function lockBooks(db, bookIds) {
  const { rows } = await db.query(
    `SELECT id::int AS id, price::float8 AS price, stock_quantity AS stock, is_active AS "isActive"
       FROM books WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
    [bookIds],
  );
  return rows;
}

export async function adjustStock(db, bookId, delta) {
  await db.query("UPDATE books SET stock_quantity = stock_quantity + $2 WHERE id = $1", [bookId, delta]);
}

// ---- Orders ----------------------------------------------------------------------------------------------

export async function findOrderForUpdate(memberId, orderNumber, db) {
  const { rows } = await db.query(
    `SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.order_number = $1 AND o.member_id = $2 FOR UPDATE`,
    [orderNumber, memberId],
  );
  return rows[0] ?? null;
}

export async function findOrderById(db, id, { lock = false } = {}) {
  const { rows } = await db.query(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id = $1${lock ? " FOR UPDATE" : ""}`, [id]);
  return rows[0] ?? null;
}

/** Scoped by member id: another member's order number is simply "not found" (FR-071). */
export async function findOwnOrder(memberId, orderNumber, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.order_number = $1 AND o.member_id = $2`,
    [orderNumber, memberId],
  );
  return rows[0] ?? null;
}

export async function findPendingForUpdate(memberId, db) {
  const { rows } = await db.query(
    `SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.member_id = $1 AND o.status = 'Pending Payment' FOR UPDATE`,
    [memberId],
  );
  return rows[0] ?? null;
}

const values = (o) => [
  o.addressId, JSON.stringify(o.address ?? null), o.subtotal, o.shippingCharge, o.couponId, o.couponCode,
  o.couponDiscount, o.pointsRedeemed, o.pointsDiscount, o.total, o.estimatedDelivery,
];

export async function insertOrder(db, memberId, orderNumber, o) {
  const { rows } = await db.query(
    `INSERT INTO orders (member_id, order_number, status, address_id, address_snapshot, subtotal, shipping_charge,
                         coupon_id, coupon_code, coupon_discount, points_redeemed, points_discount, total, estimated_delivery)
     VALUES ($1, $2, 'Pending Payment', $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id::int AS id`,
    [memberId, orderNumber, ...values(o)],
  );
  return rows[0].id;
}

export async function updatePendingOrder(db, id, o) {
  await db.query(
    `UPDATE orders SET address_id = $2, address_snapshot = $3::jsonb, subtotal = $4, shipping_charge = $5, coupon_id = $6,
            coupon_code = $7, coupon_discount = $8, points_redeemed = $9, points_discount = $10, total = $11,
            estimated_delivery = $12
      WHERE id = $1 AND status = 'Pending Payment'`,
    [id, ...values(o)],
  );
}

export async function replaceLines(db, orderId, lines) {
  await db.query("DELETE FROM order_lines WHERE order_id = $1", [orderId]);
  for (const l of lines) {
    await db.query("INSERT INTO order_lines (order_id, book_id, quantity, unit_price) VALUES ($1, $2, $3, $4)", [
      orderId, l.bookId, l.quantity, l.unitPrice,
    ]);
  }
}

export async function getLines(orderId, db = { query }) {
  const { rows } = await db.query(
    `SELECT ol.book_id::int AS "bookId", b.title, b.cover_url AS "coverUrl", b.format, ol.quantity,
            ol.unit_price::float8 AS "unitPrice"
       FROM order_lines ol JOIN books b ON b.id = ol.book_id WHERE ol.order_id = $1 ORDER BY ol.id`,
    [orderId],
  );
  return rows;
}

export async function setStockHeld(db, orderId, held) {
  await db.query("UPDATE orders SET stock_held = $2 WHERE id = $1", [orderId, held]);
}

export async function markConfirmed(db, orderId) {
  await db.query("UPDATE orders SET status = 'Confirmed', confirmed_at = now() WHERE id = $1 AND status = 'Pending Payment'", [
    orderId,
  ]);
}

// ---- Lifecycle (Phase 7) ---------------------------------------------------------------------------------

/**
 * Locks an order by id for the background sweep and admin actions. The member is locked first, the same order every
 * other flow uses (member, then order), so two flows can never deadlock.
 */
export async function lockOrderById(db, orderId) {
  const owner = await db.query("SELECT member_id::int AS id FROM orders WHERE id = $1", [orderId]);
  if (!owner.rows[0]) return null;
  await lockMember(owner.rows[0].id, db);
  return findOrderById(db, orderId, { lock: true });
}

export async function findOrderByNumber(orderNumber, db = { query }) {
  const { rows } = await db.query(`SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.order_number = $1`, [orderNumber]);
  return rows[0] ?? null;
}

export async function setStatus(db, orderId, status) {
  await db.query("UPDATE orders SET status = $2 WHERE id = $1", [orderId, status]);
}

export async function setCancelled(db, orderId, reason) {
  await db.query("UPDATE orders SET status = 'Cancelled', cancelled_at = now(), cancel_reason = $2 WHERE id = $1", [orderId, reason]);
}

export async function setDelivered(db, orderId, at) {
  await db.query("UPDATE orders SET status = 'Delivered', delivered_at = $2 WHERE id = $1", [orderId, at]);
}

export async function hasEarnEntry(db, orderId) {
  const { rows } = await db.query("SELECT 1 FROM gift_point_ledger WHERE order_id = $1 AND type = 'EARN'", [orderId]);
  return rows.length > 0;
}

/** Orders the member can see: everything except an unpaid Pending Payment order, newest first (FR-063). */
export async function listMemberOrders(memberId, limit = 100) {
  const { rows } = await query(
    `SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.member_id = $1 AND o.status <> 'Pending Payment'
      ORDER BY o.created_at DESC, o.id DESC LIMIT $2`,
    [memberId, limit],
  );
  return rows;
}

/** Orders whose shipment or return timers may still change them (all members, for the background sweep). */
export async function listActiveOrderIds(limit = 200) {
  const { rows } = await query(
    "SELECT id::int AS id FROM orders WHERE status IN ('Confirmed', 'Dispatched', 'Return Requested') ORDER BY id LIMIT $1",
    [limit],
  );
  return rows.map((r) => r.id);
}

/** One member's orders that may still change (shipment or return timers). */
export async function listMemberActiveOrderIds(memberId) {
  const { rows } = await query(
    "SELECT id::int AS id FROM orders WHERE member_id = $1 AND status IN ('Confirmed', 'Dispatched', 'Return Requested')",
    [memberId],
  );
  return rows.map((r) => r.id);
}

export async function getLinesForOrders(orderIds) {
  const { rows } = await query(
    `SELECT ol.order_id::int AS "orderId", ol.book_id::int AS "bookId", b.title, b.cover_url AS "coverUrl", b.format,
            ol.quantity, ol.unit_price::float8 AS "unitPrice"
       FROM order_lines ol JOIN books b ON b.id = ol.book_id WHERE ol.order_id = ANY($1::bigint[]) ORDER BY ol.id`,
    [orderIds],
  );
  return rows;
}