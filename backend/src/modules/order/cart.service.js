import { z } from "zod";
import { AppError, notFound, validationError } from "../../lib/errors.js";
import { fieldErrors } from "../../lib/validation.js";
import { withTransaction } from "../../lib/db.js";
import * as repo from "./cart.repository.js";
import { hashCartToken, validCartToken } from "./cart.token.js";

/** Largest quantity of one title in a cart. Stock may limit it further. */
export const MAX_LINE_QUANTITY = 99;
const DEFAULT_DELIVERY_DAYS = 5;

const bookIdSchema = z.coerce
  .number({ error: "Book id must be a number" })
  .int("Book id must be a whole number")
  .positive("Book id must be positive");
const quantitySchema = z.coerce
  .number({ error: "Quantity must be a number" })
  .int("Quantity must be a whole number")
  .min(1, "Quantity must be at least 1")
  .max(MAX_LINE_QUANTITY, `Quantity must be at most ${MAX_LINE_QUANTITY}`);

const addSchema = z.object({ bookId: bookIdSchema, quantity: quantitySchema.default(1) });
const updateSchema = z.object({ quantity: quantitySchema });

function parse(schema, input) {
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  return parsed.data;
}

const rupees = (n) => `₹${n.toFixed(2)}`;
const toMoney = (cents) => cents / 100;
const toCents = (amount) => Math.round(amount * 100);

/**
 * PENDING ADMIN APPROVAL (inventory rules): copies that may be bought, from the placeholder
 * books.stock_quantity column. An inactive book has none. Change only this function if the rule changes.
 */
export const availableCopies = (row) => (row.isActive ? row.stock : 0);

/** Who owns the cart: the signed-in member, else the guest token from the cookie, else nobody yet. */
export function resolveOwner({ member, cartToken }) {
  if (member) return { memberId: member.id };
  const token = validCartToken(cartToken);
  return token ? { tokenHash: hashCartToken(token) } : null;
}

async function estimatedDeliveryDate() {
  const configured = Number(await repo.getConfig("estimated_delivery_days"));
  const days = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_DELIVERY_DAYS;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const EMPTY_CART = Object.freeze({ items: [], itemCount: 0, subtotal: 0, estimatedDelivery: null, hasWarnings: false });

/**
 * Recomputes everything from live catalogue data (FR-049, FR-050).
 * Nothing the client sent earlier is trusted: price, stock and availability come from the books table.
 */
function buildSummary(lines, estimate) {
  let subtotalCents = 0;
  let itemCount = 0;
  let anyPhysical = false;

  const items = lines.map((line) => {
    const maxQuantity = availableCopies(line);
    const available = maxQuantity > 0;
    const quantity = available ? Math.min(line.quantity, maxQuantity) : 0;
    const warnings = [];

    if (!line.isActive) warnings.push("This book is no longer available. Remove it to continue.");
    else if (!available) warnings.push("This book is out of stock. Remove it to continue.");
    else if (quantity < line.quantity) {
      warnings.push(`Only ${maxQuantity} ${maxQuantity === 1 ? "copy is" : "copies are"} available, so the quantity was reduced from ${line.quantity}.`);
    }
    const priceChanged = toCents(line.price) !== toCents(line.priceAtAdd);
    if (priceChanged) warnings.push(`The price changed from ${rupees(line.priceAtAdd)} to ${rupees(line.price)} since you added this book.`);

    const lineCents = toCents(line.price) * quantity;
    subtotalCents += lineCents;
    itemCount += quantity;
    if (available && line.format !== "eBook") anyPhysical = true;

    return {
      bookId: line.bookId,
      title: line.title,
      coverUrl: line.coverUrl,
      format: line.format,
      authors: line.authors,
      unitPrice: line.price,
      previousPrice: priceChanged ? line.priceAtAdd : null,
      priceChanged,
      quantity,
      maxQuantity,
      available,
      lineTotal: toMoney(lineCents),
      warnings,
    };
  });

  return {
    items,
    itemCount,
    subtotal: toMoney(subtotalCents),
    // An estimate, not a promise (FR-054). eBooks are digital and need no delivery.
    estimatedDelivery: anyPhysical ? estimate : null,
    hasWarnings: items.some((i) => i.warnings.length > 0),
  };
}

async function summaryFor(cartId) {
  if (!cartId) return EMPTY_CART;
  const lines = await repo.listLines(cartId);
  if (lines.length === 0) return EMPTY_CART;
  return buildSummary(lines, await estimatedDeliveryDate());
}

export async function getCart(owner) {
  return summaryFor(owner ? await repo.findCartId(owner) : null);
}

/** Adds copies of a book. `owner` must already exist (the route creates a guest token first). */
export async function addItem(owner, input) {
  const { bookId, quantity } = parse(addSchema, input);
  const book = await repo.findBook(bookId);
  // Inactive books are hidden from the catalogue, so they look missing here too (FR-050).
  if (!book || !book.isActive) throw notFound("This book is not available");
  const copies = availableCopies(book);
  if (copies === 0) throw new AppError(409, "OUT_OF_STOCK", "This book is out of stock");

  const cartId = await repo.getOrCreateCartId(owner);
  const existing = await repo.getItem(cartId, bookId);
  const wanted = (existing?.quantity ?? 0) + quantity;
  const allowed = Math.min(wanted, copies, MAX_LINE_QUANTITY);
  await repo.upsertItem(cartId, bookId, allowed, book.price);

  const message =
    allowed < wanted
      ? `Only ${allowed} ${allowed === 1 ? "copy is" : "copies are"} available, so the quantity was limited to ${allowed}.`
      : undefined;
  return { cart: await summaryFor(cartId), message };
}

export async function updateItem(owner, rawBookId, input) {
  const bookId = parse(z.object({ bookId: bookIdSchema }), { bookId: rawBookId }).bookId;
  const { quantity } = parse(updateSchema, input);
  const cartId = owner ? await repo.findCartId(owner) : null;
  if (!cartId || !(await repo.getItem(cartId, bookId))) throw notFound("This book is not in your cart");

  const book = await repo.findBook(bookId);
  // Same rule as adding: an inactive or missing book looks "not found" (T078). Removing it stays allowed.
  if (!book || !book.isActive) throw notFound("This book is not available. Remove it from your cart.");
  const copies = availableCopies(book);
  if (copies === 0) throw new AppError(409, "OUT_OF_STOCK", "This book is out of stock. Remove it from your cart.");

  const allowed = Math.min(quantity, copies, MAX_LINE_QUANTITY);
  await repo.upsertItem(cartId, bookId, allowed, book.price);
  const message =
    allowed < quantity
      ? `Only ${allowed} ${allowed === 1 ? "copy is" : "copies are"} available, so the quantity was limited to ${allowed}.`
      : undefined;
  return { cart: await summaryFor(cartId), message };
}

/** Removing a line that is already gone is not an error. */
export async function removeItem(owner, rawBookId) {
  const bookId = parse(z.object({ bookId: bookIdSchema }), { bookId: rawBookId }).bookId;
  const cartId = owner ? await repo.findCartId(owner) : null;
  if (cartId) await repo.removeItem(cartId, bookId);
  return { cart: await summaryFor(cartId) };
}

/**
 * Moves a guest cart into the member's cart on sign-in (FR-051). All or nothing.
 * Quantities of the same book are added together and limited to stock. Books that are no longer
 * available are dropped. A line that is new to the member keeps the price the guest last saw,
 * so a price change is still reported.
 */
export async function mergeGuestCart(rawToken, memberId) {
  const token = validCartToken(rawToken);
  if (!token) return;
  await withTransaction(async (db) => {
    const guestCartId = await repo.findCartId({ tokenHash: hashCartToken(token) }, db);
    if (!guestCartId) return;
    const memberCartId = await repo.getOrCreateCartId({ memberId }, db);

    for (const line of await repo.listLines(guestCartId, db)) {
      const book = await repo.findBook(line.bookId, db);
      const copies = book ? availableCopies(book) : 0;
      if (copies === 0) continue;
      const existing = await repo.getItem(memberCartId, line.bookId, db);
      const quantity = Math.min(line.quantity + (existing?.quantity ?? 0), copies, MAX_LINE_QUANTITY);
      await repo.upsertItem(memberCartId, line.bookId, quantity, existing?.priceAtAdd ?? line.priceAtAdd, db);
    }
    await repo.deleteCart(guestCartId, db);
  });
}

/** After a confirmed purchase the bought books leave the member's cart (FR-062). Runs inside the caller's transaction. */
export async function removePurchased(memberId, bookIds, db) {
  const cartId = await repo.findCartId({ memberId }, db);
  if (!cartId) return;
  for (const bookId of bookIds) await repo.removeItem(cartId, bookId, db);
}