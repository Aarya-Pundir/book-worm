import { z } from "zod";
import { AppError, notFound, validationError } from "../../lib/errors.js";
import { fieldErrors } from "../../lib/validation.js";
import { getConfigNumber } from "../../lib/config.js";
import { query, withTransaction } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { toCents } from "../../lib/money.js";
import { listRefunds, settleRefund, startRefund } from "../payment/payment.refunds.js";
import * as payments from "../payment/payment.repository.js";
import * as shipments from "../shipping/shipment.service.js";
import * as cart from "./cart.service.js";
import { applyShipmentSteps } from "./order.delivery.js";
import * as repo from "./order.repository.js";
import { cancelCheck, returnCheck, returnShare } from "./order.rules.js";
import { releaseOrder } from "./order.service.js";

/**
 * Order history, details, cancellation, returns, Buy Again and the shipment timers' effect on orders
 * (FR-063..FR-068, FR-078). Every member-facing function is scoped by member id, so another member's order is
 * simply "not found" (FR-071, SC-020). Money is returned through the payment module only (FR-066, FR-077).
 */

const DEFAULT_CANCEL_HOURS = 48;
const DEFAULT_RETURN_DAYS = 7;

const cancelSchema = z.object({
  reason: z.string({ error: "Reason must be text" }).trim().max(200, "Reason must be at most 200 characters").optional(),
});

const PAYMENT_LABELS = {
  AUTHORIZED: "Paid",
  PAID: "Paid",
  PAY_ON_DELIVERY_PENDING: "Pay on Delivery - Pending",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
  CANCELLED: "Cancelled (no payment collected)",
  FAILED: "Failed",
  INITIATED: "In progress",
};

// ---- Background effects of the timers ---------------------------------------------------------------------

/** Return received: refund the share of the books that came back, restore their points, close the order (FR-067). */
async function completeReturn(db, order) {
  const lines = await repo.getLines(order.id, db);
  const physicalCents = lines.filter((l) => l.format !== "eBook").reduce((s, l) => s + toCents(l.unitPrice) * l.quantity, 0);
  const share = returnShare({
    subtotalCents: toCents(order.subtotal),
    physicalCents,
    totalCents: toCents(order.total),
    shippingCents: toCents(order.shippingCharge),
    pointsRedeemed: order.pointsRedeemed,
  });
  if (share.points > 0) {
    await repo.addLedgerEntry(db, { memberId: order.memberId, type: "REFUND", points: share.points, orderId: order.id, note: "Points returned for a returned order" });
  }
  const refund = await startRefund(db, { orderId: order.id, reason: "RETURN", amountCents: share.refundCents });
  await repo.setStatus(db, order.id, "Returned");
  return refund;
}

/**
 * Applies whatever timers have passed for one order. Returns the id of a refund that now needs the gateway, if any.
 * The caller settles it AFTER the transaction, because the gateway is never called inside one.
 */
async function syncLocked(db, order, now) {
  let refund = null;
  if (order.status === "Confirmed" || order.status === "Dispatched") {
    const { reached } = await shipments.progressShipment(db, order.id, now);
    if (reached.length > 0) await applyShipmentSteps(db, order, reached);
  } else if (order.status === "Return Requested") {
    const { received } = await shipments.progressReturn(db, order.id, now);
    if (received) refund = await completeReturn(db, order);
  }
  return refund?.status === "PENDING" ? refund.id : null;
}

/** Moves one order forward by its timers. Safe to call as often as you like. */
export async function syncOrder(orderId, now = new Date()) {
  const refundId = await withTransaction(async (db) => {
    const order = await repo.lockOrderById(db, orderId);
    return order ? syncLocked(db, order, now) : null;
  });
  if (refundId) await settleRefund(refundId);
}

/** One failing order never stops the rest. */
export async function syncOrders(orderIds) {
  for (const id of orderIds) {
    try {
      await syncOrder(id);
    } catch (err) {
      logger.error({ event: "order.sync_failed", orderId: id, err: err?.message }, "Could not update an order's shipment");
    }
  }
}

/** Called on a timer by the server: moves every active order forward and retries refunds the gateway did not confirm. */
export async function runBackgroundSweep() {
  await syncOrders(await repo.listActiveOrderIds());
}

// ---- Reading orders ---------------------------------------------------------------------------------------

async function windows() {
  return {
    windowHours: await getConfigNumber("cancel_window_hours", DEFAULT_CANCEL_HOURS),
    windowDays: await getConfigNumber("return_window_days", DEFAULT_RETURN_DAYS),
  };
}

function actionsFor(order, shipment, ret, lines, cfg) {
  const hasPhysical = lines.some((l) => l.format !== "eBook");
  const cancel = cancelCheck({ order, shipment, windowHours: cfg.windowHours });
  const returning = returnCheck({ order, hasPhysical, hasReturn: Boolean(ret), windowDays: cfg.windowDays });
  return { cancel, return: returning, buyAgain: { allowed: lines.length > 0 } };
}

/** The member's own order with everything the details page needs (FR-064). */
export async function getOrderDetail(memberId, orderNumber) {
  const found = await repo.findOwnOrder(memberId, String(orderNumber ?? "").slice(0, 40));
  if (!found) throw notFound("Order not found");
  await syncOrder(found.id); // timers are applied the moment the member looks
  const order = await repo.findOrderById({ query }, found.id);
  const lines = await repo.getLines(order.id);
  const shipment = await shipments.shipmentView(order.id);
  const ret = await shipments.returnView(order.id);
  const payment = await payments.latestForOrder(order.id);
  const refunds = await listRefunds(order.id);
  const cfg = await windows();
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    placedAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
    items: lines.map((l) => ({ ...l, lineTotal: Math.round(l.unitPrice * l.quantity * 100) / 100 })),
    address: order.address,
    subtotal: order.subtotal,
    shippingCharge: order.shippingCharge,
    couponCode: order.couponCode,
    couponDiscount: order.couponDiscount,
    pointsRedeemed: order.pointsRedeemed,
    pointsDiscount: order.pointsDiscount,
    total: order.total,
    estimatedDelivery: shipment?.confirmedDate ? null : order.estimatedDelivery,
    confirmedDelivery: shipment?.confirmedDate ?? null,
    payment: payment && { method: payment.method, amount: payment.amount, status: payment.status, statusLabel: PAYMENT_LABELS[payment.status] ?? payment.status, reference: payment.reference },
    shipment,
    returnShipment: ret,
    refunds,
    actions: actionsFor(order, shipment ? { status: shipment.status } : null, ret, lines, cfg),
  };
}

/** The member's orders, newest first, with status, date, items and total (FR-063). */
export async function listOrders(memberId) {
  await syncOrders(await repo.listMemberActiveOrderIds(memberId));
  const orders = await repo.listMemberOrders(memberId);
  if (orders.length === 0) return [];
  const lines = await repo.getLinesForOrders(orders.map((o) => o.id));
  return orders.map((o) => ({
    orderNumber: o.orderNumber,
    status: o.status,
    placedAt: o.createdAt,
    total: o.total,
    items: lines.filter((l) => l.orderId === o.id).map((l) => ({ bookId: l.bookId, title: l.title, quantity: l.quantity, coverUrl: l.coverUrl })),
  }));
}

// ---- Cancel, return, Buy Again ----------------------------------------------------------------------------

/** Cancels within the window and before dispatch: stock, coupon and points come back and a refund starts (FR-065, FR-066). */
export async function cancelOrder(memberId, orderNumber, input) {
  const parsed = cancelSchema.safeParse(input ?? {});
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  const cfg = await windows();

  const refundId = await withTransaction(async (db) => {
    const found = await repo.findOwnOrder(memberId, String(orderNumber ?? "").slice(0, 40), db);
    if (!found) throw notFound("Order not found");
    const order = await repo.lockOrderById(db, found.id);
    // Bring the shipment up to date first, so an order that the timers already dispatched is refused honestly.
    await syncLocked(db, order, new Date());
    const current = await repo.findOrderById(db, order.id);
    const shipment = await shipments.shipmentView(order.id, db);
    const verdict = cancelCheck({ order: current, shipment: shipment && { status: shipment.status }, windowHours: cfg.windowHours });
    if (!verdict.allowed) throw new AppError(409, "CANCEL_NOT_ALLOWED", verdict.reason);

    await releaseOrder(db, current, "Order cancelled - points returned");
    await shipments.cancelShipment(db, current.id);
    await repo.setCancelled(db, current.id, parsed.data.reason ?? "Cancelled by the member");
    const refund = await startRefund(db, { orderId: current.id, reason: "CANCELLATION", amountCents: toCents(current.total) });
    return refund.status === "PENDING" ? refund.id : null;
  });
  // The gateway is called after the order is safely cancelled. If it fails, the refund stays PENDING and is retried.
  if (refundId) await settleRefund(refundId);
  logger.info({ event: "order.cancelled", orderNumber }, "Order cancelled");
  return getOrderDetail(memberId, orderNumber);
}

/** Returns for delivered physical books inside the return window (FR-067). The refund waits for the books to arrive. */
export async function requestReturn(memberId, orderNumber) {
  const cfg = await windows();
  await withTransaction(async (db) => {
    const found = await repo.findOwnOrder(memberId, String(orderNumber ?? "").slice(0, 40), db);
    if (!found) throw notFound("Order not found");
    const order = await repo.lockOrderById(db, found.id);
    await syncLocked(db, order, new Date());
    const current = await repo.findOrderById(db, order.id);
    const lines = await repo.getLines(current.id, db);
    const verdict = returnCheck({
      order: current,
      hasPhysical: lines.some((l) => l.format !== "eBook"),
      hasReturn: Boolean(await shipments.returnView(current.id, db)),
      windowDays: cfg.windowDays,
    });
    if (!verdict.allowed) throw new AppError(409, "RETURN_NOT_ALLOWED", verdict.reason);
    await shipments.createReturn(db, current.id);
    await repo.setStatus(db, current.id, "Return Requested");
  });
  logger.info({ event: "order.return_requested", orderNumber }, "Return requested");
  return getOrderDetail(memberId, orderNumber);
}

/**
 * Adds a past order's books to the cart at today's price and availability (FR-068). Books that cannot be added are
 * listed so the member knows. Nothing is charged or reserved here.
 */
export async function buyAgain(memberId, orderNumber) {
  const order = await repo.findOwnOrder(memberId, String(orderNumber ?? "").slice(0, 40));
  if (!order) throw notFound("Order not found");
  const added = [];
  const unavailable = [];
  const notes = [];
  for (const line of await repo.getLines(order.id)) {
    try {
      const result = await cart.addItem({ memberId }, { bookId: line.bookId, quantity: line.quantity });
      added.push(line.title);
      if (result.message) notes.push(`${line.title}: ${result.message}`);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      unavailable.push(line.title);
    }
  }
  const message =
    unavailable.length > 0
      ? `Not available right now: ${unavailable.join(", ")}.${added.length > 0 ? ` The other ${added.length === 1 ? "book was" : "books were"} added to your cart.` : ""}`
      : undefined;
  return { cart: await cart.getCart({ memberId }), added, unavailable, notes, message };
}

// ---- Admin override (FR-059a) -----------------------------------------------------------------------------

const overrideSchema = z.object({
  status: z.string({ error: "Choose a status" }).trim().min(1, "Choose a status").max(30),
  note: z.string().trim().max(200).optional(),
});

async function adminLock(db, orderNumber) {
  const found = await repo.findOrderByNumber(String(orderNumber ?? "").slice(0, 40), db);
  if (!found) throw notFound("Order not found");
  return repo.lockOrderById(db, found.id);
}

/** Admin only (enforced by the route). Moves the shipment forward for demos, following the same rules as the timers. */
export async function overrideShipmentStatus(orderNumber, input) {
  const parsed = overrideSchema.safeParse(input ?? {});
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  await withTransaction(async (db) => {
    const order = await adminLock(db, orderNumber);
    if (order.status === "Cancelled") throw new AppError(409, "SHIPMENT_CLOSED", "A cancelled order cannot be dispatched.");
    if (!["Confirmed", "Dispatched"].includes(order.status)) throw new AppError(409, "INVALID_TRANSITION", "This order is not being shipped.");
    const result = await shipments.overrideShipment(db, order.id, parsed.data.status, parsed.data.note ?? "Admin override");
    if (!result) throw new AppError(409, "NO_SHIPMENT", "This order has no shipment.");
    await applyShipmentSteps(db, order, result.reached);
  });
  logger.info({ event: "shipment.override", orderNumber }, "Shipment status overridden by an admin");
  return { orderNumber, shipment: await shipments.shipmentView((await repo.findOrderByNumber(orderNumber)).id) };
}

export async function overrideReturnStatus(orderNumber, input) {
  const parsed = overrideSchema.safeParse(input ?? {});
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  const refundId = await withTransaction(async (db) => {
    const order = await adminLock(db, orderNumber);
    if (order.status !== "Return Requested") throw new AppError(409, "INVALID_TRANSITION", "This order has no open return.");
    const result = await shipments.overrideReturn(db, order.id, parsed.data.status);
    if (!result) throw new AppError(409, "NO_RETURN", "This order has no return.");
    if (!result.received) return null;
    const refund = await completeReturn(db, order);
    return refund.status === "PENDING" ? refund.id : null;
  });
  if (refundId) await settleRefund(refundId);
  logger.info({ event: "return.override", orderNumber }, "Return status overridden by an admin");
  return { orderNumber, returnShipment: await shipments.returnView((await repo.findOrderByNumber(orderNumber)).id) };
}
