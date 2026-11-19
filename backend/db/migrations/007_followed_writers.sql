-- 007_followed_writers: the writers (authors) a member follows (Phase 7.5, T084). Owned by the Member module (D1).
-- Isolated so it can be rolled back on its own (007_followed_writers.down.sql).
--
-- Reuses the existing `authors` and `book_authors` tables. No author column is added and members cannot
-- create, edit or delete authors. Any existing author can be followed, including one with no active books.
-- The number of active books is computed when the list is read (same rule as GET /api/authors).
-- A followed row belongs to exactly one member. Deleting the member removes the rows.

CREATE TABLE followed_authors (
  member_id    BIGINT      NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  author_id    BIGINT      NOT NULL REFERENCES authors (id) ON DELETE CASCADE,
  followed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, author_id)
);

-- Newest first listing for one member, and "who follows this writer" lookups.
CREATE INDEX idx_followed_authors_member_followed ON followed_authors (member_id, followed_at DESC);
CREATE INDEX idx_followed_authors_author ON followed_authors (author_id);
