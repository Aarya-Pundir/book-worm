import { query } from "../../lib/db.js";

// Escape LIKE wildcards so user text is matched literally (ILIKE default escape is backslash).
const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

const FROM = "FROM books b LEFT JOIN publishers p ON p.id = b.publisher_id";

// Shape shared by cards and details. Authors/categories/publisher carry ids so the UI can link to them.
// PENDING ADMIN APPROVAL (inventory rules): "inStock" is derived from the placeholder
// books.stock_quantity column from migration 002. Change only this expression if the rule changes.
const IN_STOCK = "b.stock_quantity > 0";

const CARD_COLUMNS = `
  b.id::int AS id, b.title, b.short_description AS "shortDescription", b.cover_url AS "coverUrl",
  b.price::float8 AS price, b.format, b.language, ${IN_STOCK} AS "inStock",
  CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('id', p.id::int, 'name', p.name) END AS publisher,
  COALESCE((SELECT json_agg(json_build_object('id', a.id::int, 'name', a.name) ORDER BY a.name)
            FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id), '[]'::json) AS authors,
  COALESCE((SELECT json_agg(json_build_object('id', c.id::int, 'name', c.name, 'slug', c.slug) ORDER BY c.sort_order)
            FROM book_categories bc JOIN categories c ON c.id = bc.category_id WHERE bc.book_id = b.id), '[]'::json) AS categories`;

const DETAIL_COLUMNS = `${CARD_COLUMNS}, b.description, b.publication_date::text AS "publicationDate"`;

/** Parameter collector so every user value goes through $n placeholders. */
function params() {
  const values = [];
  return { values, add: (v) => `$${values.push(v)}` };
}

function buildWhere(f, p) {
  const where = ["b.is_active"];
  if (f.q) {
    const like = p.add(`%${escapeLike(f.q)}%`);
    where.push(
      `(b.title ILIKE ${like} OR EXISTS (SELECT 1 FROM book_authors ba JOIN authors a ON a.id = ba.author_id
         WHERE ba.book_id = b.id AND a.name ILIKE ${like}))`,
    );
  }
  if (f.category) {
    where.push(
      `EXISTS (SELECT 1 FROM book_categories bc JOIN categories c ON c.id = bc.category_id
         WHERE bc.book_id = b.id AND c.slug = ${p.add(f.category)})`,
    );
  }
  if (f.author) where.push(`EXISTS (SELECT 1 FROM book_authors ba WHERE ba.book_id = b.id AND ba.author_id = ${p.add(f.author)})`);
  if (f.publisher) where.push(`b.publisher_id = ${p.add(f.publisher)}`);
  if (f.language) where.push(`lower(b.language) = lower(${p.add(f.language)})`);
  if (f.format) where.push(`b.format = ${p.add(f.format)}`);
  if (f.minPrice !== undefined) where.push(`b.price >= ${p.add(f.minPrice)}`);
  if (f.maxPrice !== undefined) where.push(`b.price <= ${p.add(f.maxPrice)}`);
  return where.join(" AND ");
}

function buildOrder(f, p) {
  const tie = "b.id ASC";
  switch (f.sort) {
    case "price_asc":
      return `b.price ASC, b.popularity_score DESC, ${tie}`;
    case "price_desc":
      return `b.price DESC, b.popularity_score DESC, ${tie}`;
    case "newest":
      return `b.publication_date DESC, b.created_at DESC, ${tie}`;
    case "popularity":
      return `b.popularity_score DESC, ${tie}`;
    default:
      if (!f.q) return `b.popularity_score DESC, ${tie}`;
      // Relevance with a search term: title starts with it, then title contains it, then author match.
      return `CASE WHEN b.title ILIKE ${p.add(`${escapeLike(f.q)}%`)} THEN 0
                   WHEN b.title ILIKE ${p.add(`%${escapeLike(f.q)}%`)} THEN 1 ELSE 2 END,
              b.popularity_score DESC, ${tie}`;
  }
}

/** Combined filter + sort + page, all in the database (FR-031, FR-032). */
export async function findBooks(filters, { page, pageSize }) {
  const countP = params();
  const countWhere = buildWhere(filters, countP);
  const p = params();
  const where = buildWhere(filters, p);
  const order = buildOrder(filters, p);
  const limit = p.add(pageSize);
  const offset = p.add((page - 1) * pageSize);

  const [rows, count] = await Promise.all([
    query(`SELECT ${CARD_COLUMNS} ${FROM} WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, p.values),
    query(`SELECT count(*)::int AS total ${FROM} WHERE ${countWhere}`, countP.values),
  ]);
  return { items: rows.rows, total: count.rows[0].total };
}

export async function findById(id) {
  const { rows } = await query(`SELECT ${DETAIL_COLUMNS} ${FROM} WHERE b.id = $1 AND b.is_active`, [id]);
  return rows[0] ?? null;
}

/** Other active books sharing the most categories with this one. */
export async function findRelated(bookId, limit) {
  const { rows } = await query(
    `SELECT ${CARD_COLUMNS} ${FROM}
     JOIN (SELECT bc2.book_id, count(*) AS shared
             FROM book_categories bc1
             JOIN book_categories bc2 ON bc2.category_id = bc1.category_id AND bc2.book_id <> bc1.book_id
            WHERE bc1.book_id = $1 GROUP BY bc2.book_id) s ON s.book_id = b.id
     WHERE b.is_active ORDER BY s.shared DESC, b.popularity_score DESC, b.id ASC LIMIT $2`,
    [bookId, limit],
  );
  return rows;
}

export async function findBestsellers(limit) {
  const { rows } = await query(
    `SELECT ${CARD_COLUMNS} ${FROM} WHERE b.is_active ORDER BY b.popularity_score DESC, b.id ASC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function findNewLaunches(limit) {
  const { rows } = await query(
    `SELECT ${CARD_COLUMNS} ${FROM} WHERE b.is_active
     ORDER BY b.publication_date DESC, b.created_at DESC, b.id ASC LIMIT $1`,
    [limit],
  );
  return rows;
}

/**
 * Books in the genres this member has bought from, excluding books already bought.
 * Scoped to ONE member id: no other customer's orders are ever read (FR-019).
 */
export async function findRecommendedForMember(memberId, limit) {
  const { rows } = await query(
    `WITH mine AS (
       SELECT DISTINCT ol.book_id
         FROM orders o JOIN order_lines ol ON ol.order_id = o.id
        WHERE o.member_id = $1 AND o.status NOT IN ('Cancelled', 'Pending Payment')
     ), prefs AS (
       SELECT bc.category_id, count(*) AS weight
         FROM mine JOIN book_categories bc ON bc.book_id = mine.book_id GROUP BY bc.category_id
     ), cand AS (
       SELECT bc.book_id, sum(prefs.weight) AS score
         FROM prefs JOIN book_categories bc ON bc.category_id = prefs.category_id
        WHERE bc.book_id NOT IN (SELECT book_id FROM mine) GROUP BY bc.book_id
     )
     SELECT ${CARD_COLUMNS} ${FROM} JOIN cand ON cand.book_id = b.id
      WHERE b.is_active ORDER BY cand.score DESC, b.popularity_score DESC, b.id ASC LIMIT $2`,
    [memberId, limit],
  );
  return rows;
}

export async function listCategories() {
  const { rows } = await query(
    `SELECT c.id::int AS id, c.name, c.slug, c.sort_order AS "sortOrder",
            (SELECT count(*)::int FROM book_categories bc JOIN books b ON b.id = bc.book_id
              WHERE bc.category_id = c.id AND b.is_active) AS "bookCount"
       FROM categories c ORDER BY c.sort_order`,
  );
  return rows;
}

export async function listAuthors(q) {
  const p = params();
  const filter = q ? `AND a.name ILIKE ${p.add(`%${escapeLike(q)}%`)}` : "";
  const { rows } = await query(
    `SELECT a.id::int AS id, a.name, count(b.id)::int AS "bookCount"
       FROM authors a JOIN book_authors ba ON ba.author_id = a.id JOIN books b ON b.id = ba.book_id AND b.is_active
      WHERE true ${filter} GROUP BY a.id ORDER BY a.name LIMIT 500`,
    p.values,
  );
  return rows;
}

// PENDING ADMIN APPROVAL: Brand vs Publisher naming. Table is `publishers`.
export async function listPublishers() {
  const { rows } = await query(
    `SELECT p.id::int AS id, p.name, count(b.id)::int AS "bookCount"
       FROM publishers p JOIN books b ON b.publisher_id = p.id AND b.is_active
      GROUP BY p.id ORDER BY p.name`,
  );
  return rows;
}

export async function listLanguages() {
  const { rows } = await query("SELECT DISTINCT language FROM books WHERE is_active ORDER BY language");
  return rows.map((r) => r.language);
}

export async function getConfig(key) {
  const { rows } = await query("SELECT value FROM app_config WHERE key = $1", [key]);
  return rows[0]?.value ?? null;
}

// ---- Support for My Wishlist and My Writers (Phase 7.5). The Member module calls these through the service. ----

/**
 * Books by id for a wishlist, active or not. An INACTIVE book is limited in SQL itself to id, title and cover
 * (FR-084): its format, price and authors are never selected, so they cannot leak by mistake.
 * PENDING ADMIN APPROVAL (inventory rules): inStock uses the same provisional rule as the cart.
 */
export async function findBooksForWishlist(ids) {
  if (ids.length === 0) return [];
  const { rows } = await query(
    `SELECT b.id::int AS id, b.is_active AS "isActive", b.title, b.cover_url AS "coverUrl",
            (b.is_active AND ${IN_STOCK}) AS "inStock",
            CASE WHEN b.is_active THEN b.format END AS format,
            CASE WHEN b.is_active THEN b.price::float8 END AS price,
            CASE WHEN b.is_active THEN COALESCE((SELECT json_agg(json_build_object('id', a.id::int, 'name', a.name) ORDER BY a.name)
              FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id), '[]'::json) END AS authors
       FROM books b WHERE b.id = ANY($1::bigint[])`,
    [ids],
  );
  return rows;
}

const AUTHOR_COLUMNS = `a.id::int AS id, a.name,
  (SELECT count(*)::int FROM book_authors ba JOIN books b ON b.id = ba.book_id AND b.is_active WHERE ba.author_id = a.id) AS "bookCount"`;

/** One writer with the number of ACTIVE books (0 is fine). */
export async function findAuthorById(id) {
  const { rows } = await query(`SELECT ${AUTHOR_COLUMNS} FROM authors a WHERE a.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findAuthorsByIds(ids) {
  if (ids.length === 0) return [];
  const { rows } = await query(`SELECT ${AUTHOR_COLUMNS} FROM authors a WHERE a.id = ANY($1::bigint[])`, [ids]);
  return rows;
}