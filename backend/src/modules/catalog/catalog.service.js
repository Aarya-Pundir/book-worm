import { z } from "zod";
import { notFound, validationError } from "../../lib/errors.js";
import { fieldErrors } from "../../lib/validation.js";
import * as repo from "./catalog.repository.js";

const optionalText = (max = 100) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const id = (label) =>
  z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).positive(`${label} must be positive`);
const price = (label) =>
  z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(1_000_000, `${label} is too large`);

export const SORTS = ["relevance", "price_asc", "price_desc", "newest", "popularity"];

const booksQuerySchema = z
  .object({
    q: optionalText(100),
    category: z.string().trim().regex(/^[a-z0-9-]{1,60}$/, "Unknown category").optional(),
    author: id("Author").optional(),
    publisher: id("Publisher").optional(),
    language: optionalText(40),
    format: z.enum(["Paperback", "Hardcover", "eBook"], { error: "Format must be Paperback, Hardcover or eBook" }).optional(),
    minPrice: price("Minimum price").optional(),
    maxPrice: price("Maximum price").optional(),
    sort: z.enum(SORTS, { error: `Sort must be one of: ${SORTS.join(", ")}` }).default("relevance"),
    page: z.coerce.number({ error: "Page must be a number" }).int("Page must be a whole number").min(1, "Page must be at least 1").default(1),
    pageSize: z.coerce
      .number({ error: "Page size must be a number" })
      .int("Page size must be a whole number")
      .min(1, "Page size must be at least 1")
      .max(50, "Page size must be at most 50")
      .default(12),
  })
  .refine((d) => d.minPrice === undefined || d.maxPrice === undefined || d.minPrice <= d.maxPrice, {
    path: ["minPrice"],
    message: "Minimum price cannot be higher than maximum price",
  });

const DEFAULT_DELIVERY_DAYS = 5;

/** Estimated, not confirmed (FR-040). eBooks are digital, so they have no delivery estimate. */
async function withEstimate(books) {
  const configured = Number(await repo.getConfig("estimated_delivery_days"));
  const days = Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_DELIVERY_DAYS;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  const estimate = date.toISOString().slice(0, 10);
  return books.map((b) => ({ ...b, estimatedDelivery: b.format === "eBook" ? null : estimate }));
}

export async function searchBooks(rawQuery) {
  const parsed = booksQuerySchema.safeParse(rawQuery);
  if (!parsed.success) throw validationError(fieldErrors(parsed.error));
  const { page, pageSize, ...filters } = parsed.data;
  const { items, total } = await repo.findBooks(filters, { page, pageSize });
  return { items: await withEstimate(items), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getBook(rawId) {
  const parsed = id("Book id").safeParse(rawId);
  // A malformed id is the same as a missing book from the caller's point of view.
  if (!parsed.success) throw notFound("Book not found");
  const book = await repo.findById(parsed.data);
  if (!book) throw notFound("Book not found");
  const related = await repo.findRelated(book.id, 6);
  const [detail, ...rest] = await withEstimate([book, ...related]);
  return { ...detail, related: rest };
}

const limitSchema = z.coerce.number().int().min(1).max(24).default(6);

export async function featured(type, rawLimit) {
  if (!["bestsellers", "new"].includes(type)) {
    throw validationError({ type: "Type must be bestsellers or new" });
  }
  const limit = limitSchema.safeParse(rawLimit).data ?? 6;
  const books = type === "bestsellers" ? await repo.findBestsellers(limit) : await repo.findNewLaunches(limit);
  return { items: await withEstimate(books) };
}

/**
 * Recommended for You (FR-018, FR-019). Only the signed-in member's OWN orders are read.
 * Falls back to popular books and sets personalised=false, so the UI never claims personalisation.
 */
export async function recommended(member, rawLimit) {
  const limit = limitSchema.safeParse(rawLimit).data ?? 6;
  if (member) {
    const own = await repo.findRecommendedForMember(member.id, limit);
    if (own.length > 0) return { personalised: true, items: await withEstimate(own) };
  }
  return { personalised: false, items: await withEstimate(await repo.findBestsellers(limit)) };
}

export const categories = async () => ({ items: await repo.listCategories() });
export const authors = async (q) => ({ items: await repo.listAuthors(typeof q === "string" ? q.trim().slice(0, 100) : undefined) });
export const publishers = async () => ({ items: await repo.listPublishers() });
export const languages = async () => ({ items: await repo.listLanguages() });

// ---- Support for My Wishlist and My Writers (Phase 7.5). Other modules use these, never the tables. ----

const MAX_DB_ID = 2_147_483_647;

/** True only for an ACTIVE book. Unknown and inactive books look the same to the caller (FR-082). */
export async function isActiveBook(bookId) {
  const book = await repo.findById(bookId);
  return Boolean(book);
}

/**
 * Wishlist view of books by id. Active books carry title, cover, format, price and authors.
 * An inactive book carries ONLY bookId, title and coverUrl (FR-084, SC-024).
 */
export async function booksForWishlist(ids) {
  const rows = await repo.findBooksForWishlist(ids);
  return rows.map((r) =>
    r.isActive
      ? { bookId: r.id, active: true, inStock: r.inStock, title: r.title, coverUrl: r.coverUrl, format: r.format, price: r.price, authors: r.authors }
      : { bookId: r.id, active: false, title: r.title, coverUrl: r.coverUrl },
  );
}

/** A writer and the number of active books, or null if there is no such writer. A bad id is simply "no such writer". */
export async function findAuthor(rawId) {
  const parsed = id("Author id").max(MAX_DB_ID).safeParse(rawId);
  if (!parsed.success) return null;
  return repo.findAuthorById(parsed.data);
}

export async function getAuthor(rawId) {
  const author = await findAuthor(rawId);
  if (!author) throw notFound("Writer not found");
  return author;
}

export const authorsByIds = (ids) => repo.findAuthorsByIds(ids);