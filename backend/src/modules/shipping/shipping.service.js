import { notFound, validationError } from "../../lib/errors.js";
import { fieldErrors } from "../../lib/validation.js";
import { withTransaction } from "../../lib/db.js";
import { getConfigNumber } from "../../lib/config.js";
import { toCents } from "../../lib/money.js";
import * as repo from "./shipping.repository.js";
import { addressSchema, idSchema } from "./shipping.schemas.js";

const DEFAULT_FREE_SHIPPING_THRESHOLD = 499;

function parseAddress(input) {
  const parsed = addressSchema.safeParse(input ?? {});
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  return parsed.data;
}

function parseId(raw) {
  const parsed = idSchema("Address id").safeParse(raw);
  if (!parsed.success) throw notFound("Address not found");
  return parsed.data;
}

export const listAddresses = (memberId) => repo.listAddresses(memberId);

/** The first address a member saves becomes their default. */
export async function createAddress(memberId, input) {
  const data = parseAddress(input);
  return withTransaction(async (db) => {
    const isDefault = data.isDefault || (await repo.countAddresses(memberId, db)) === 0;
    const created = await repo.insertAddress(memberId, { ...data, isDefault }, db);
    if (isDefault) await repo.clearDefault(memberId, created.id, db);
    return created;
  });
}

export async function updateAddress(memberId, rawId, input) {
  const id = parseId(rawId);
  const data = parseAddress(input);
  return withTransaction(async (db) => {
    const updated = await repo.updateAddress(memberId, id, data, db);
    if (!updated) throw notFound("Address not found");
    if (updated.isDefault) await repo.clearDefault(memberId, id, db);
    return updated;
  });
}

export async function deleteAddress(memberId, rawId) {
  if (!(await repo.deleteAddress(memberId, parseId(rawId)))) throw notFound("Address not found");
}

/** Returns the member's own address, or null. Other members' addresses are never visible (FR-071). */
export async function getOwnAddress(memberId, rawId) {
  const parsed = idSchema("Address id").safeParse(rawId);
  return parsed.success ? repo.findAddress(memberId, parsed.data) : null;
}

const addDays = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Shipping rate and approximate delivery time for a PIN code (FR-054, FR-055).
 * Returns null when the PIN is not serviceable. The date is an ESTIMATE, never a promise.
 * The free-shipping threshold is compared with the subtotal of PHYSICAL books before discounts (eBooks never ship).
 */
export async function quoteDelivery(pinCode, physicalSubtotal) {
  const zone = await repo.findZone(pinCode);
  if (!zone) return null;
  const threshold = await getConfigNumber("free_shipping_threshold", DEFAULT_FREE_SHIPPING_THRESHOLD);
  const freeShipping = toCents(physicalSubtotal) >= toCents(threshold);
  return {
    zone: zone.zone,
    deliveryDays: zone.deliveryDays,
    estimatedDelivery: addDays(zone.deliveryDays),
    charge: freeShipping ? 0 : zone.charge,
    freeShipping,
    freeShippingThreshold: threshold,
  };
}
