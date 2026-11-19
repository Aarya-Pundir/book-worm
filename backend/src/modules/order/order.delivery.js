import { getConfigNumber } from "../../lib/config.js";
import { toCents } from "../../lib/money.js";
import { markCodPaid } from "../payment/payment.refunds.js";
import * as shipments from "../shipping/shipment.service.js";
import * as repo from "./order.repository.js";
import { pointsEarned } from "./order.rules.js";

/**
 * What happens to an order when its shipment moves (FR-057, FR-072a, FR-078). Every function runs inside the
 * caller's transaction, with the member and order already locked. Kept apart from order.service.js so that file can
 * call it without a circular import.
 */

/** Points are earned once per order, on delivery, at a configurable rate of what was paid for the goods (FR-078). */
async function earnPoints(db, order) {
  if (await repo.hasEarnEntry(db, order.id)) return 0;
  const percent = await getConfigNumber("gift_point_earn_rate_percent", 5, db);
  const pointValue = await getConfigNumber("gift_point_rupee_value", 1, db);
  const points = pointsEarned({
    totalCents: toCents(order.total),
    shippingCents: toCents(order.shippingCharge),
    earnPercent: percent,
    pointValueCents: Math.round(pointValue * 100),
  });
  if (points <= 0) return 0;
  await repo.addLedgerEntry(db, { memberId: order.memberId, type: "EARN", points, orderId: order.id, note: "Earned on delivery" });
  return points;
}

/** Delivered: Cash on Delivery becomes Paid, and the member earns points. */
export async function onDelivered(db, order, at = new Date()) {
  await repo.setDelivered(db, order.id, at);
  await markCodPaid(db, order.id);
  await earnPoints(db, order);
}

/**
 * Order just confirmed. Physical books get a shipment. An order of only eBooks has nothing to ship, so it counts as
 * delivered once payment is confirmed (spec assumption).
 */
export async function onConfirmed(db, order, lines) {
  if (lines.some((l) => l.format !== "eBook")) await shipments.createShipment(db, order.id, order.estimatedDelivery);
  else await onDelivered(db, order);
}

/** Brings the order status in line with the steps its shipment just reached. */
export async function applyShipmentSteps(db, order, reached) {
  if (reached.includes("Delivered")) await onDelivered(db, order);
  else if (reached.length > 0 && order.status === "Confirmed") await repo.setStatus(db, order.id, "Dispatched");
}
