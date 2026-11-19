import { query, withTransaction } from "../../lib/db.js";

// Member-owned wishlist rows (Phase 7.5). Every query is scoped by member id.
// Book details are never read here: the Catalog service supplies them.

export async function listIds(memberId) {
  const { rows } = await query(
    "SELECT book_id::int AS id FROM wishlist_items WHERE member_id = $1 ORDER BY added_at DESC, book_id DESC",
    [memberId],
  );
  return rows.map((r) => r.id);
}

export async function count(memberId) {
  const { rows } = await query("SELECT count(*)::int AS n FROM wishlist_items WHERE member_id = $1", [memberId]);
  return rows[0].n;
}

/**
 * Adds one book. The member row is locked first (same lock order as the rest of the app), so two requests at the
 * same time cannot both pass the size limit. Returns { added, full }.
 */
export async function addIfRoom(memberId, bookId, maxItems) {
  return withTransaction(async (db) => {
    await db.query("SELECT id FROM members WHERE id = $1 FOR UPDATE", [memberId]);
    const existing = await db.query("SELECT 1 FROM wishlist_items WHERE member_id = $1 AND book_id = $2", [memberId, bookId]);
    if (existing.rowCount > 0) return { added: false, full: false };
    const { rows } = await db.query("SELECT count(*)::int AS n FROM wishlist_items WHERE member_id = $1", [memberId]);
    if (rows[0].n >= maxItems) return { added: false, full: true };
    await db.query("INSERT INTO wishlist_items (member_id, book_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [memberId, bookId]);
    return { added: true, full: false };
  });
}

/** Removes only the signed-in member's own row. Returns true if a row existed. */
export async function remove(memberId, bookId) {
  const { rowCount } = await query("DELETE FROM wishlist_items WHERE member_id = $1 AND book_id = $2", [memberId, bookId]);
  return rowCount > 0;
}
