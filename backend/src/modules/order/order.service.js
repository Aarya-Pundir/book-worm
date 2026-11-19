import crypto from "node:crypto";
import { z } from "zod";
import { AppError, notFound, validationError } from "../../lib/errors.js";
import { fieldErrors } from "../../lib/validation.js";
import { withTransaction } from "../../lib/db.js";
import { getConfigNumber } from "../../lib/config.js";
import { toCents, toMoney } from "../../lib/money.js";
import * as shipping from "../shipping/shipping.service.js";
import * as cart from "./cart.service.js";
import * as repo from "./order.repository.js";
import { onConfirmed } from "./order.delivery.js";
import { couponDiscountCents, couponProblem, maxRedeemablePoints, pointsToCents, totalCents } from "./pricing.js";

const reviewSchema = z.object({
  addressId: z.number({ error: "Address must be a number" }).int().positive().nullish(),
  couponCode: z.string({ error: "Coupon code must be text" }).trim().max(40, "Coupon code is too long").nullish(),
  redeemPoints: z.number({ error: "Points must be a number" }).int("Points must be a whole number").min(0, "Points cannot be negative").max(1_000_000).nullish(),
});

const blocker = (status, code, message) => ({ status, code, message });

/**
 * PENDING ADMIN APPROVAL (payment lifecycle): which methods are offered is configuration of the mock gateway.
 * Cash on Delivery is only for physical books and may have a maximum order value (FR-072a).
 */
export async function paymentMethodsFor({ hasPhysical, hasDigital, totalAmountCents }) {
  const codMax = await getConfigNumber("cod_max_order_value", 5000);
  let cod = { method: "COD", available: true };
  if (!hasPhysical || hasDigital) cod = { method: "COD", available: false, reason: "Cash on Delivery is only for orders of physical books." };
  else if (totalAmountCents > toCents(codMax)) cod = { method: "COD", available: false, reason: `Cash on Delivery is available up to ₹${codMax}.` };
  return [{ method: "CARD", available: true }, { method: "UPI", available: true }, { method: "NET_BANKING", available: true }, cod];
}

/**
 * Builds the order summary from LIVE data: cart lines, catalogue prices, stock, zone rates, coupon and gift
 * points. Nothing here is taken from the client except the address id, coupon code and points wanted (FR-049, SC-017).
 */
async function computeCheckout(memberId, rawInput) {
  const parsed = reviewSchema.safeParse(rawInput ?? {});
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  const input = parsed.data;

  const { items: cartItems } = await cart.getCart({ memberId });
  const blockers = [];
  const notices = [];
  if (cartItems.length === 0) blockers.push(blocker(409, "EMPTY_CART", "Your cart is empty."));
  if (cartItems.some((i) => !i.available)) {
    blockers.push(blocker(409, "UNAVAILABLE_ITEMS", "Some items are unavailable. Remove them from your cart to continue."));
  }
  for (const i of cartItems) for (const w of i.warnings) notices.push(`${i.title}: ${w}`);

  const buying = cartItems.filter((i) => i.available);
  const subtotalCents = buying.reduce((s, i) => s + toCents(i.unitPrice) * i.quantity, 0);
  const physical = buying.filter((i) => i.format !== "eBook");
  const hasPhysical = physical.length > 0;
  const hasDigital = buying.some((i) => i.format === "eBook");
  const physicalCents = physical.reduce((s, i) => s + toCents(i.unitPrice) * i.quantity, 0);

  // Address and delivery. eBooks need neither an address nor a shipping charge (FR-056).
  let address = null;
  let delivery = null;
  if (hasPhysical) {
    address = input.addressId ? await shipping.getOwnAddress(memberId, input.addressId) : null;
    if (!address) blockers.push(blocker(422, "ADDRESS_REQUIRED", "Choose a delivery address."));
    else {
      delivery = await shipping.quoteDelivery(address.pinCode, toMoney(physicalCents));
      if (!delivery) {
        blockers.push(blocker(422, "UNSERVICEABLE_PIN", "Delivery is not available to this PIN code. Please choose another address."));
      }
    }
  }
  const shippingCents = delivery ? toCents(delivery.charge) : 0;

  // Coupon (FR-079). An invalid code is dropped with a clear message and the total is recalculated.
  let couponRow = null;
  let couponInfo = null;
  let couponCents = 0;
  const code = input.couponCode?.toUpperCase() || null;
  if (code) {
    couponRow = await repo.findCouponByCode(code);
    const problem = couponProblem(couponRow, subtotalCents);
    if (problem) {
      couponInfo = { code, applied: false, discount: 0, message: problem };
      couponRow = null;
    } else {
      couponCents = couponDiscountCents(couponRow, subtotalCents);
      couponInfo = { code, applied: true, discount: toMoney(couponCents), message: `Coupon ${code} applied.` };
    }
  }

  // Gift points (FR-078): never beyond the balance or the configured share of the total.
  const pointValue = await getConfigNumber("gift_point_rupee_value", 1);
  const maxPercent = await getConfigNumber("gift_point_max_redeem_percent", 20);
  const balance = await repo.pointsBalance(memberId);
  const maxPoints = maxRedeemablePoints({ baseCents: Math.max(0, subtotalCents - couponCents), balance, maxPercent, pointValue });
  const wanted = input.redeemPoints ?? 0;
  const redeemed = Math.min(wanted, maxPoints);
  if (wanted > redeemed) notices.push(`You can redeem at most ${maxPoints} points on this order.`);
  const pointsCents = pointsToCents(redeemed, pointValue);

  const total = totalCents({ subtotalCents, couponCents, pointsCents, shippingCents });
  const view = {
    items: buying.map((i) => ({
      bookId: i.bookId, title: i.title, coverUrl: i.coverUrl, format: i.format, authors: i.authors,
      unitPrice: i.unitPrice, quantity: i.quantity, lineTotal: i.lineTotal,
      estimatedDelivery: i.format !== "eBook" && delivery ? delivery.estimatedDelivery : null,
    })),
    notices,
    blockers: blockers.map(({ code: c, message }) => ({ code: c, message })),
    hasPhysical,
    address,
    delivery,
    subtotal: toMoney(subtotalCents),
    shipping: toMoney(shippingCents),
    coupon: couponInfo,
    points: { balance, maxRedeemable: maxPoints, redeemed, discount: toMoney(pointsCents), pointValue },
    total: toMoney(total),
    paymentMethods: await paymentMethodsFor({ hasPhysical, hasDigital, totalAmountCents: total }),
  };
  const plan = {
    blockers, couponRow,
    lines: buying.map((i) => ({ bookId: i.bookId, quantity: i.quantity, unitPrice: i.unitPrice })),
    data: {
      addressId: address?.id ?? null,
      address: address ? { recipient: address.recipient, phone: address.phone, line1: address.line1, line2: address.line2, city: address.city, state: address.state, pinCode: address.pinCode } : null,
      subtotal: toMoney(subtotalCents),
      shippingCharge: toMoney(shippingCents),
      couponId: couponRow?.id ?? null,
      couponCode: couponRow?.code ?? null,
      couponDiscount: toMoney(couponCents),
      pointsRedeemed: redeemed,
      pointsDiscount: toMoney(pointsCents),
      total: toMoney(total),
      estimatedDelivery: delivery?.estimatedDelivery ?? null,
    },
  };
  return { view, plan };
}

/** Read-only review of what checkout would charge. Creates nothing (FR-060). */
export async function review(memberId, input) {
  return (await computeCheckout(memberId, input)).view;
}

const newOrderNumber = () => `BW-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

/**
 * Creates the member's order in Pending Payment, or refreshes the one they already have (FR-061, FR-075).
 * No stock is held yet; that happens when payment starts.
 */
export async function placeOrder(memberId, input) {
  const { view, plan } = await computeCheckout(memberId, input);
  if (plan.blockers.length > 0) {
    const first = plan.blockers[0];
    throw new AppError(first.status, first.code, first.message);
  }
  const orderNumber = await withTransaction(async (db) => {
    await repo.lockMember(memberId, db);
    const existing = await repo.findPendingForUpdate(memberId, db);
    if (existing?.stockHeld) throw new AppError(409, "PAYMENT_IN_PROGRESS", "A payment for this order is in progress. Please wait a moment.");
    let id;
    let number;
    if (existing) {
      id = existing.id;
      number = existing.orderNumber;
      await repo.updatePendingOrder(db, id, plan.data);
    } else {
      number = newOrderNumber();
      id = await repo.insertOrder(db, memberId, number, plan.data);
    }
    await repo.replaceLines(db, id, plan.lines);
    return number;
  });
  return { order: await getOrder(memberId, orderNumber), notices: view.notices };
}

/** The member's own order with its lines. Another member's order number is "not found" (FR-071, SC-020). */
export async function getOrder(memberId, orderNumber) {
  const order = await repo.findOwnOrder(memberId, String(orderNumber ?? "").slice(0, 40));
  if (!order) throw notFound("Order not found");
  return { ...order, items: await repo.getLines(order.id) };
}

export const giftPoints = async (memberId) => ({ balance: await repo.pointsBalance(memberId), history: await repo.listLedger(memberId) });

// ---- Hooks used by the payment module (it never touches order tables itself) -------------------------------

/** Locks the member first (same order as placeOrder, so the two can never deadlock), then their order. */
export async function lockOrderForPayment(db, memberId, orderNumber) {
  await repo.lockMember(memberId, db);
  return repo.findOrderForUpdate(memberId, String(orderNumber ?? "").slice(0, 40), db);
}

/**
 * Takes stock, the coupon use and gift points for an order, all inside the caller's transaction (FR-069, FR-078).
 * Anything that no longer holds is refused, so a payment can never start for an order that cannot be fulfilled.
 */
export async function reserveOrder(db, order) {
  const lines = await repo.getLines(order.id, db);
  const books = new Map((await repo.lockBooks(db, lines.map((l) => l.bookId))).map((b) => [b.id, b]));
  for (const line of lines) {
    const book = books.get(line.bookId);
    if (!book || !cart.availableCopies(book) || book.stock < line.quantity) {
      throw new AppError(409, "ITEM_UNAVAILABLE", `"${line.title}" is no longer available in the quantity you chose. Please review your cart.`);
    }
    if (toCents(book.price) !== toCents(line.unitPrice)) {
      throw new AppError(409, "PRICE_CHANGED", `The price of "${line.title}" changed. Please review your order again.`);
    }
  }
  if (order.couponId) {
    const coupon = await repo.lockCoupon(db, order.couponId);
    const problem = couponProblem(coupon, toCents(order.subtotal));
    if (problem || !(await repo.takeCouponUse(db, order.couponId))) {
      throw new AppError(409, "COUPON_INVALID", `${problem ?? "This coupon has reached its usage limit."} Please review your order again.`);
    }
  }
  if (order.pointsRedeemed > 0) {
    await repo.lockMember(order.memberId, db);
    if ((await repo.pointsBalance(order.memberId, db)) < order.pointsRedeemed) {
      throw new AppError(409, "INSUFFICIENT_POINTS", "You no longer have enough gift points. Please review your order again.");
    }
    await repo.addLedgerEntry(db, { memberId: order.memberId, type: "REDEEM", points: -order.pointsRedeemed, orderId: order.id, note: "Redeemed at checkout" });
  }
  for (const line of lines) await repo.adjustStock(db, line.bookId, -line.quantity);
  await repo.setStockHeld(db, order.id, true);
}

/** Gives back whatever reserveOrder took. Safe to call twice: it only acts while stock is held (FR-066, FR-075). */
export async function releaseOrder(db, order, reason) {
  if (!order.stockHeld) return;
  for (const line of await repo.getLines(order.id, db)) await repo.adjustStock(db, line.bookId, line.quantity);
  if (order.couponId) await repo.returnCouponUse(db, order.couponId);
  if (order.pointsRedeemed > 0) {
    await repo.lockMember(order.memberId, db);
    await repo.addLedgerEntry(db, { memberId: order.memberId, type: "REFUND", points: order.pointsRedeemed, orderId: order.id, note: reason });
  }
  await repo.setStockHeld(db, order.id, false);
}

/** Pending Payment -> Confirmed, the purchased books leave the cart, and the shipment starts (FR-057, FR-061, FR-062). */
export async function confirmOrder(db, order) {
  await repo.markConfirmed(db, order.id);
  const lines = await repo.getLines(order.id, db);
  await cart.removePurchased(order.memberId, lines.map((l) => l.bookId), db);
  await onConfirmed(db, order, lines);
}

/** Which payment methods an existing order may use. Cash on Delivery needs physical books only (FR-072a). */
export async function paymentMethodsForOrder(db, order) {
  const lines = await repo.getLines(order.id, db);
  return paymentMethodsFor({
    hasPhysical: lines.some((l) => l.format !== "eBook"),
    hasDigital: lines.some((l) => l.format === "eBook"),
    totalAmountCents: toCents(order.total),
  });
}

/** Re-reads an order inside the caller's transaction after it changed. */
export const refreshOrder = (db, id) => repo.findOrderById(db, id);