import { z } from "zod";
import { AppError, notFound, validationError } from "../../lib/errors.js";
import { fieldErrors } from "../../lib/validation.js";
import { getConfigNumber } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import * as catalog from "../catalog/catalog.service.js";
import { addItem, getCart } from "../order/cart.service.js";
import * as repo from "./wishlist.repository.js";

// My Wishlist (Phase 7.5, FR-081..FR-086, FR-090). Owned by the Member module (D1). Books come from the Catalog
// service and the cart is reached through the Order cart service; no other module's tables are read here.

export const DEFAULT_MAX_ITEMS = 200;
const MAX_DB_ID = 2_147_483_647;

const bookIdSchema = z.coerce
  .number({ error: "Book id must be a number" })
  .int("Book id must be a whole number")
  .positive("Book id must be positive")
  .max(MAX_DB_ID, "Book id is too large");

const addSchema = z.object({ bookId: bookIdSchema }).strict();
const toCartSchema = z
  .object({ bookIds: z.array(bookIdSchema).max(200, "Too many books at once").optional() })
  .strict();

function parse(schema, input) {
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  return parsed.data;
}

const maxItems = () => getConfigNumber("wishlist_max_items", DEFAULT_MAX_ITEMS);

/**
 * What the member sees for one book (FR-083, FR-084).
 * Inactive: ONLY bookId, title, coverUrl, available=false, unavailableReason.
 * Out of stock: the full view, available=false with the reason.
 */
function toItem(book) {
  if (!book.active) {
    return { bookId: book.bookId, title: book.title, coverUrl: book.coverUrl, available: false, unavailableReason: "No longer available" };
  }
  return {
    bookId: book.bookId,
    title: book.title,
    coverUrl: book.coverUrl,
    format: book.format,
    price: book.price,
    authors: book.authors,
    available: book.inStock,
    unavailableReason: book.inStock ? null : "Out of stock",
  };
}

async function itemsFor(ids) {
  const books = await catalog.booksForWishlist(ids);
  const byId = new Map(books.map((b) => [b.bookId, b]));
  // Keep the newest-first order from the wishlist table, skipping anything the catalogue no longer has.
  return ids.filter((id) => byId.has(id)).map((id) => toItem(byId.get(id)));
}

export async function getWishlist(memberId) {
  const ids = await repo.listIds(memberId);
  return { items: await itemsFor(ids), count: ids.length, maxItems: await maxItems() };
}

/** Adds an ACTIVE book. Out of stock is fine; unknown and inactive look the same and are refused (FR-082). */
export async function addToWishlist(memberId, input) {
  const { bookId } = parse(addSchema, input);
  if (!(await catalog.isActiveBook(bookId))) throw notFound("This book is not available");
  const limit = await maxItems();
  const { added, full } = await repo.addIfRoom(memberId, bookId, limit);
  if (full) throw new AppError(409, "WISHLIST_FULL", `Your wishlist can hold up to ${limit} books. Remove one to add another.`);
  if (added) logger.info({ event: "wishlist.added", bookId }, "Book added to a wishlist");
  const [item] = await itemsFor([bookId]);
  return { created: added, item, count: await repo.count(memberId) };
}

/** Idempotent: removing a book that is not on the list is fine (FR-085). */
export async function removeFromWishlist(memberId, rawBookId) {
  const { bookId } = parse(z.object({ bookId: bookIdSchema }), { bookId: rawBookId });
  const removed = await repo.remove(memberId, bookId);
  if (removed) logger.info({ event: "wishlist.removed", bookId }, "Book removed from a wishlist");
}

/**
 * Adds available wishlist books to the cart with the normal cart rules (FR-086). An unavailable book is skipped
 * with a reason and never fails the request. Books stay on the wishlist.
 */
export async function addWishlistToCart(memberId, input) {
  const { bookIds } = parse(toCartSchema, input);
  const onList = await repo.listIds(memberId);
  const owned = new Set(onList);
  const wanted = bookIds ? [...new Set(bookIds)] : onList;
  const added = [];
  const skipped = [];
  const items = await itemsFor(onList);
  const byId = new Map(items.map((i) => [i.bookId, i]));

  for (const bookId of wanted) {
    // Only the member's own wishlist books can be moved to the cart.
    if (!owned.has(bookId)) {
      skipped.push({ bookId, title: null, reason: "This book is not on your wishlist" });
      continue;
    }
    const item = byId.get(bookId);
    if (!item?.available) {
      skipped.push({ bookId, title: item?.title ?? null, reason: item?.unavailableReason ?? "No longer available" });
      continue;
    }
    try {
      const result = await addItem({ memberId }, { bookId, quantity: 1 });
      added.push({ bookId, title: item.title, quantity: 1, ...(result.message ? { note: result.message } : {}) });
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      // Stock or availability changed since the list was read: report it instead of failing everything.
      skipped.push({ bookId, title: item.title, reason: err.code === "OUT_OF_STOCK" ? "Out of stock" : "No longer available" });
    }
  }

  const message =
    skipped.length > 0
      ? `Not added: ${skipped.map((s) => `${s.title ?? "A book"} (${s.reason})`).join(", ")}.`
      : added.length === 0
        ? "Your wishlist has no books to add."
        : null;
  return { added, skipped, cart: await getCart({ memberId }), message };
}
