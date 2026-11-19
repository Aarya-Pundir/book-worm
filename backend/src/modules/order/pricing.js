import { rupees, toCents } from "../../lib/money.js";

/** Pure pricing rules. All amounts are integer paise so totals are exact (SC-017). */

/** PERCENT rounds down; a discount can never exceed what it applies to. */
export function couponDiscountCents(coupon, baseCents) {
  const raw = coupon.type === "PERCENT" ? Math.floor((baseCents * Number(coupon.value)) / 100) : toCents(coupon.value);
  return Math.max(0, Math.min(raw, baseCents));
}

/** Returns a clear reason the coupon cannot be used, or null if it can (FR-079). */
export function couponProblem(coupon, subtotalCents, now = new Date()) {
  if (!coupon) return "This coupon code is not valid.";
  if (now < new Date(coupon.valid_from)) return "This coupon is not active yet.";
  if (now > new Date(coupon.valid_to)) return "This coupon has expired.";
  if (subtotalCents < toCents(coupon.min_order)) return `This coupon needs an order of at least ${rupees(coupon.min_order)}.`;
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) return "This coupon has reached its usage limit.";
  return null;
}

/**
 * Most points that can be redeemed: never above the balance, and never above the configured share of the
 * amount they apply to (FR-078). `baseCents` is the merchandise total after any coupon.
 */
export function maxRedeemablePoints({ baseCents, balance, maxPercent, pointValue }) {
  const valueCents = Math.round(pointValue * 100);
  if (valueCents <= 0) return 0;
  const capCents = Math.floor((baseCents * maxPercent) / 100);
  return Math.max(0, Math.min(balance, Math.floor(capCents / valueCents)));
}

export const pointsToCents = (points, pointValue) => points * Math.round(pointValue * 100);

/** total = merchandise - coupon - points + shipping. Never negative. */
export function totalCents({ subtotalCents, couponCents, pointsCents, shippingCents }) {
  return Math.max(0, subtotalCents - couponCents - pointsCents) + shippingCents;
}
