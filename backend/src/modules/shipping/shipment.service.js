import crypto from "node:crypto";
import { getConfigNumber } from "../../lib/config.js";
import { query } from "../../lib/db.js";
import { RETURN_STEPS, SHIPMENT_STEPS, checkForwardMove, dueIndex, dueTime } from "./shipment.rules.js";
import * as repo from "./shipment.repository.js";

/**
 * SIMULATED CARRIER (spec assumption): there is no real carrier. A shipment moves Preparing -> Dispatched ->
 * In Transit -> Delivered on configurable timers after the order is confirmed, and an Admin-only override can move
 * it forward for demos (FR-059a). This module never imports the order module: it reports what happened and the
 * order module reacts (for example gift points on delivery).
 */

const trackingRef = (prefix) => `${prefix}${crypto.randomBytes(5).toString("hex").toUpperCase()}`;

async function shipmentMinutes(db) {
  return [
    await getConfigNumber("shipment_timer_dispatch_minutes", 2, db),
    await getConfigNumber("shipment_timer_in_transit_minutes", 5, db),
    await getConfigNumber("shipment_timer_delivered_minutes", 10, db),
  ];
}

async function returnMinutes(db) {
  return [await getConfigNumber("return_timer_pickup_minutes", 2, db), await getConfigNumber("return_timer_received_minutes", 5, db)];
}

/** Creates the shipment when an order is confirmed (FR-057). Inside the caller's transaction. */
export async function createShipment(db, orderId, estimatedDate) {
  const id = await repo.insertShipment(db, orderId, estimatedDate);
  await repo.addEvent(db, id, "Preparing", "SYSTEM", new Date());
  return id;
}

/** A cancelled order's shipment stops for good. Only a shipment that has not been dispatched can be cancelled. */
export async function cancelShipment(db, orderId, at = new Date()) {
  const shipment = await repo.findShipment(orderId, db);
  if (!shipment) return;
  await repo.updateShipment(db, shipment.id, { status: "Cancelled" });
  await repo.addEvent(db, shipment.id, "Cancelled", "SYSTEM", at, "Order cancelled");
}

/** Moves the shipment to one step and records it. The confirmed date and tracking reference appear at dispatch only. */
async function applyShipmentStep(db, shipment, step, actor, at, note) {
  const changes = { status: step };
  if (step === "Dispatched") {
    changes.trackingRef = shipment.trackingRef ?? trackingRef("BWT");
    changes.dispatchedAt = at;
    const today = at.toISOString().slice(0, 10);
    // SC-018: the date becomes confirmed now. It is never earlier than the day of dispatch.
    changes.confirmedDate = shipment.estimatedDate && shipment.estimatedDate >= today ? shipment.estimatedDate : today;
  }
  if (step === "Delivered") changes.deliveredAt = at;
  await repo.updateShipment(db, shipment.id, changes);
  await repo.addEvent(db, shipment.id, step, actor, at, note ?? null);
}

/**
 * Applies every step whose timer has passed. Events carry the time the step was due, so history stays truthful even
 * if nobody looked at the order for a while. Returns what changed.
 */
export async function progressShipment(db, orderId, now = new Date()) {
  let shipment = await repo.findShipment(orderId, db);
  if (!shipment || ["Delivered", "Cancelled"].includes(shipment.status)) return { shipment, reached: [] };
  const due = dueIndex(now - new Date(shipment.createdAt), await shipmentMinutes(db));
  const reached = [];
  for (let i = SHIPMENT_STEPS.indexOf(shipment.status) + 1; i <= due; i += 1) {
    const step = SHIPMENT_STEPS[i];
    await applyShipmentStep(db, shipment, step, "SYSTEM", dueTime(shipment.createdAt, await shipmentMinutes(db), i));
    shipment = await repo.findShipment(orderId, db);
    reached.push(step);
  }
  return { shipment, reached };
}

/** Admin override (FR-059a): forward only, recorded in the history. Returns the steps passed through. */
export async function overrideShipment(db, orderId, to, note) {
  const shipment = await repo.findShipment(orderId, db);
  if (!shipment) return null;
  const steps = checkForwardMove(SHIPMENT_STEPS, shipment.status, to, { closed: shipment.status === "Cancelled" });
  let current = shipment;
  const now = new Date();
  for (const step of steps) {
    await applyShipmentStep(db, current, step, "ADMIN", now, note);
    current = await repo.findShipment(orderId, db);
  }
  return { shipment: current, reached: steps };
}

export async function shipmentView(orderId, db = { query }) {
  const shipment = await repo.findShipment(orderId, db);
  if (!shipment) return null;
  const events = await repo.listEvents(shipment.id, db);
  return {
    status: shipment.status,
    trackingRef: shipment.trackingRef,
    // SC-018: an estimate until dispatch, a confirmed date afterwards.
    estimatedDate: shipment.confirmedDate ? null : shipment.estimatedDate,
    confirmedDate: shipment.confirmedDate,
    dispatchedAt: shipment.dispatchedAt,
    deliveredAt: shipment.deliveredAt,
    events: events.map((e) => ({ status: e.status, at: e.at, by: e.actor === "ADMIN" ? "Admin" : "System", note: e.note })),
  };
}

// ---- Returns -----------------------------------------------------------------------------------------------

export async function createReturn(db, orderId) {
  await repo.insertReturn(db, orderId, trackingRef("BWR"));
}

/** Pickup and receipt of the returned books on timers. `received` is true the moment the books arrive. */
export async function progressReturn(db, orderId, now = new Date()) {
  let ret = await repo.findReturn(orderId, db);
  if (!ret || ret.status === "Received") return { ret, received: false };
  const minutes = await returnMinutes(db);
  const due = dueIndex(now - new Date(ret.createdAt), minutes);
  let received = false;
  for (let i = RETURN_STEPS.indexOf(ret.status) + 1; i <= due; i += 1) {
    const at = dueTime(ret.createdAt, minutes, i);
    await repo.updateReturn(db, ret.id, { status: RETURN_STEPS[i], pickedUpAt: i === 1 ? at : undefined, receivedAt: i === 2 ? at : undefined });
    received = i === 2;
  }
  ret = await repo.findReturn(orderId, db);
  return { ret, received };
}

/** Admin override for a return, forward only (the books are marked received). */
export async function overrideReturn(db, orderId, to) {
  const ret = await repo.findReturn(orderId, db);
  if (!ret) return null;
  const steps = checkForwardMove(RETURN_STEPS, ret.status, to);
  const now = new Date();
  for (const step of steps) {
    await repo.updateReturn(db, ret.id, { status: step, pickedUpAt: step === "Picked Up" ? now : undefined, receivedAt: step === "Received" ? now : undefined });
  }
  return { ret: await repo.findReturn(orderId, db), received: steps.includes("Received") };
}

export async function returnView(orderId, db = { query }) {
  const ret = await repo.findReturn(orderId, db);
  return ret && { status: ret.status, trackingRef: ret.trackingRef, pickedUpAt: ret.pickedUpAt, receivedAt: ret.receivedAt, requestedAt: ret.createdAt };
}

export const shipmentStatuses = (orderIds) => repo.statusesFor(orderIds);
