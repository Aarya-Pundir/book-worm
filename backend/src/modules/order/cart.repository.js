import { query } from "../../lib/db.js";

// Owner is { memberId } or { tokenHash }. Exactly one is set (carts_one_owner constraint).
const ownerColumn = (owner) => (owner.memberId ? ["member_id", owner.memberId] : ["guest_token_hash", owner.tokenHash]);

export async function findCartId(owner, db = { query }) {
  const [column, value] = ownerColumn(owner);
  const { rows } = await db.query(`SELECT id FROM carts WHERE ${column} = $1`, [value]);
  return rows[0]?.id ?? null;
}

export async function getOrCreateCartId(owner, db = { query }) {
  const [column, value] = ownerColumn(owner);
  const { rows } = await db.query(
    `INSERT INTO carts (${column}) VALUES ($1)
     ON CONFLICT (${column}) DO UPDATE SET updated_at = now() RETURNING id`,
    [value],
  );
  return rows[0].id;
}

/** Cart lines joined with LIVE book data. Prices and stock always come from the books table. */
export async function listLines(cartId, db = { query }) {
  const { rows } = await db.query(
    `SELECT b.id::int AS "bookId", b.title, b.cover_url AS "coverUrl", b.format,
            b.price::float8 AS price, ci.price_at_add::float8 AS "priceAtAdd",
            b.stock_quantity AS stock, b.is_active AS "isActive", ci.quantity,
            COALESCE((SELECT json_agg(a.name ORDER BY a.name)
                      FROM book_authors ba JOIN authors a ON a.id = ba.author_id
                      WHERE ba.book_id = b.id), '[]'::json) AS authors
       FROM cart_items ci JOIN books b ON b.id = ci.book_id
      WHERE ci.cart_id = $1
      ORDER BY ci.added_at, b.id`,
    [cartId],
  );
  return rows;
}

/** The book as the cart sees it, or null if it does not exist. */
export async function findBook(bookId, db = { query }) {
  const { rows } = await db.query(
    `SELECT id::int AS id, price::float8 AS price, stock_quantity AS stock, is_active AS "isActive"
       FROM books WHERE id = $1`,
    [bookId],
  );
  return rows[0] ?? null;
}

export async function getItem(cartId, bookId, db = { query }) {
  const { rows } = await db.query(
    'SELECT quantity, price_at_add::float8 AS "priceAtAdd" FROM cart_items WHERE cart_id = $1 AND book_id = $2',
    [cartId, bookId],
  );
  return rows[0] ?? null;
}

/** Insert or replace a line. price_at_add is the live catalogue price the visitor is shown now. */
export async function upsertItem(cartId, bookId, quantity, price, db = { query }) {
  await db.query(
    `INSERT INTO cart_items (cart_id, book_id, quantity, price_at_add) VALUES ($1, $2, $3, $4)
     ON CONFLICT (cart_id, book_id) DO UPDATE SET quantity = $3, price_at_add = $4`,
    [cartId, bookId, quantity, price],
  );
  await db.query("UPDATE carts SET updated_at = now() WHERE id = $1", [cartId]);
}

/** Lower a stored quantity to what is in stock (FR-050). */
export async function setQuantity(cartId, bookId, quantity, db = { query }) {
  await db.query("UPDATE cart_items SET quantity = $3 WHERE cart_id = $1 AND book_id = $2", [cartId, bookId, quantity]);
}

export async function removeItem(cartId, bookId, db = { query }) {
  const { rowCount } = await db.query("DELETE FROM cart_items WHERE cart_id = $1 AND book_id = $2", [cartId, bookId]);
  return rowCount > 0;
}

export async function deleteCart(cartId, db = { query }) {
  await db.query("DELETE FROM carts WHERE id = $1", [cartId]);
}

/** Estimated delivery days from app_config (shared placeholder; see catalogue). */
export async function getConfig(key, db = { query }) {
  const { rows } = await db.query("SELECT value FROM app_config WHERE key = $1", [key]);
  return rows[0]?.value ?? null;
}
