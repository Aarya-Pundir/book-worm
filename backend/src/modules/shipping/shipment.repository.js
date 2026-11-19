import { query } from "../../lib/db.js";

// Shipments are created and changed only inside the caller's transaction (`db`), never on their own.

const SHIPMENT = `s.id::int AS id, s.order_id::int AS "orderId", s.status, s.tracking_ref AS "trackingRef",
  s.estimated_date::text AS "estimatedDate", s.confirmed_date::text AS "confirmedDate",
  s.dispatched_at AS "dispatchedAt", s.delivered_at AS "deliveredAt", s.created_at AS "createdAt"`;

export async function findShipment(orderId, db = { query }) {
  const { rows } = await db.query(`SELECT ${SHIPMENT} FROM shipments s WHERE s.order_id = $1`, [orderId]);
  return rows[0] ?? null;
}

export async function insertShipment(db, orderId, estimatedDate) {
  const { rows } = await db.query(
    "INSERT INTO shipments (order_id, status, estimated_date) VALUES ($1, 'Preparing', $2) RETURNING id::int AS id",
    [orderId, estimatedDate],
  );
  return rows[0].id;
}

export async function updateShipment(db, id, { status, trackingRef, confirmedDate, dispatchedAt, deliveredAt }) {
  await db.query(
    `UPDATE shipments SET status = $2, tracking_ref = COALESCE($3, tracking_ref), confirmed_date = COALESCE($4, confirmed_date),
            dispatched_at = COALESCE($5, dispatched_at), delivered_at = COALESCE($6, delivered_at), updated_at = now()
      WHERE id = $1`,
    [id, status, trackingRef ?? null, confirmedDate ?? null, dispatchedAt ?? null, deliveredAt ?? null],
  );
}

export async function addEvent(db, shipmentId, status, actor, occurredAt, note = null) {
  await db.query(
    "INSERT INTO shipment_events (shipment_id, status, actor, occurred_at, note) VALUES ($1, $2, $3, $4, $5)",
    [shipmentId, status, actor, occurredAt, note],
  );
}

export async function listEvents(shipmentId, db = { query }) {
  const { rows } = await db.query(
    "SELECT status, actor, occurred_at AS \"at\", note FROM shipment_events WHERE shipment_id = $1 ORDER BY id",
    [shipmentId],
  );
  return rows;
}

export async function statusesFor(orderIds, db = { query }) {
  const { rows } = await db.query(
    "SELECT order_id::int AS \"orderId\", status FROM shipments WHERE order_id = ANY($1::bigint[])",
    [orderIds],
  );
  return rows;
}

// ---- Return shipments ------------------------------------------------------------------------------------

const RETURN = `r.id::int AS id, r.order_id::int AS "orderId", r.status, r.tracking_ref AS "trackingRef",
  r.picked_up_at AS "pickedUpAt", r.received_at AS "receivedAt", r.created_at AS "createdAt"`;

export async function findReturn(orderId, db = { query }) {
  const { rows } = await db.query(`SELECT ${RETURN} FROM return_shipments r WHERE r.order_id = $1`, [orderId]);
  return rows[0] ?? null;
}

export async function insertReturn(db, orderId, trackingRef) {
  await db.query("INSERT INTO return_shipments (order_id, status, tracking_ref) VALUES ($1, 'Requested', $2)", [orderId, trackingRef]);
}

export async function updateReturn(db, id, { status, pickedUpAt, receivedAt }) {
  await db.query(
    `UPDATE return_shipments SET status = $2, picked_up_at = COALESCE($3, picked_up_at), received_at = COALESCE($4, received_at),
            updated_at = now() WHERE id = $1`,
    [id, status, pickedUpAt ?? null, receivedAt ?? null],
  );
}
