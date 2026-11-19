import { query } from "../../lib/db.js";

// Member-owned follow rows (Phase 7.5). Every query is scoped by member id. Writer names and book counts come
// from the Catalog service; the `authors` table is not read here.

export async function listFollowed(memberId) {
  const { rows } = await query(
    `SELECT author_id::int AS id, followed_at AS "followedAt" FROM followed_authors
      WHERE member_id = $1 ORDER BY followed_at DESC, author_id DESC`,
    [memberId],
  );
  return rows;
}

export async function isFollowing(memberId, authorId) {
  const { rowCount } = await query("SELECT 1 FROM followed_authors WHERE member_id = $1 AND author_id = $2", [memberId, authorId]);
  return rowCount > 0;
}

/** Returns true if a new follow was created, false if it already existed. */
export async function follow(memberId, authorId) {
  const { rowCount } = await query(
    "INSERT INTO followed_authors (member_id, author_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [memberId, authorId],
  );
  return rowCount > 0;
}

export async function unfollow(memberId, authorId) {
  const { rowCount } = await query("DELETE FROM followed_authors WHERE member_id = $1 AND author_id = $2", [memberId, authorId]);
  return rowCount > 0;
}
