/** Pure order lifecycle rules (FR-065, FR-067, FR-078). No database access, so they are easy to test. */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Why a member cannot cancel, or { allowed: true, until }. A cancelled order is final. */
export function cancelCheck({ order, shipment, now = new Date(), windowHours }) {
  const no = (reason) => ({ allowed: false, reason });
  switch (order.status) {
    case "Confirmed":
      break;
    case "Pending Payment":
      return no("This order has not been paid for yet.");
    case "Cancelled":
      return no("This order is already cancelled.");
    case "Dispatched":
      return no("This order has already been dispatched, so it can no longer be cancelled.");
    default:
      return no("This order has been delivered, so it can no longer be cancelled. Delivered books may be returned.");
  }
  if (shipment && shipment.status !== "Preparing") {
    return no("This order has already been dispatched, so it can no longer be cancelled.");
  }
  const until = new Date(new Date(order.confirmedAt).getTime() + windowHours * HOUR);
  if (now > until) return no(`The ${windowHours}-hour cancellation window has passed.`);
  return { allowed: true, until: until.toISOString() };
}

/** Why a member cannot return, or { allowed: true, until }. Only delivered physical books can be returned. */
export function returnCheck({ order, hasPhysical, hasReturn, now = new Date(), windowDays }) {
  const no = (reason) => ({ allowed: false, reason });
  if (hasReturn || order.status === "Return Requested") return no("A return has already been requested for this order.");
  if (order.status === "Returned") return no("This order has already been returned.");
  if (order.status !== "Delivered") return no("Only delivered orders can be returned.");
  if (!hasPhysical) return no("eBooks cannot be returned.");
  const until = new Date(new Date(order.deliveredAt).getTime() + windowDays * DAY);
  if (now > until) return no(`The ${windowDays}-day return window has passed.`);
  return { allowed: true, until: until.toISOString() };
}

/**
 * Money and points given back for a return of the physical books in an order. Discounts and points are shared
 * in proportion to the value of the books returned; shipping is refunded only when everything is returned.
 */
export function returnShare({ subtotalCents, physicalCents, totalCents, shippingCents, pointsRedeemed }) {
  if (subtotalCents <= 0 || physicalCents >= subtotalCents) {
    return { refundCents: totalCents, points: pointsRedeemed };
  }
  const goodsCents = Math.max(0, totalCents - shippingCents);
  return {
    refundCents: Math.min(totalCents, Math.floor((goodsCents * physicalCents) / subtotalCents)),
    points: Math.floor((pointsRedeemed * physicalCents) / subtotalCents),
  };
}

/** Points earned for a delivered order: a configured percentage of what was paid for the goods (never shipping). */
export function pointsEarned({ totalCents, shippingCents, earnPercent, pointValueCents }) {
  if (pointValueCents <= 0) return 0;
  const goodsCents = Math.max(0, totalCents - shippingCents);
  return Math.floor((goodsCents * earnPercent) / 100 / pointValueCents);
}
