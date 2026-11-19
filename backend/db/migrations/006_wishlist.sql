-- 006_wishlist: a member's saved books (Phase 7.5, T083). Owned by the Member module (decision D1).
-- Isolated from earlier migrations so it can be rolled back on its own (006_wishlist.down.sql).
--
-- A wishlist row belongs to exactly one member. Deleting the member removes the rows.
-- Deleting a book removes it from every wishlist (books are only deactivated in normal use, so a wishlisted
-- book that becomes inactive keeps its row and is shown as unavailable, FR-084).
--
-- Availability is NOT stored. It is derived when the list is read from books.is_active and
-- books.stock_quantity.
-- PENDING ADMIN APPROVAL (inventory rules): "out of stock" uses the same provisional stock_quantity
-- rule as the cart. Nothing in this table depends on that decision.
--
-- The maximum wishlist size is the config key `wishlist_max_items`, added by the idempotent seed
-- (seed-data.js), not by this migration, so rolling back leaves no data behind.

CREATE TABLE wishlist_items (
  member_id  BIGINT      NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  book_id    BIGINT      NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, book_id)
);

-- Newest first listing for one member.
CREATE INDEX idx_wishlist_items_member_added ON wishlist_items (member_id, added_at DESC);
CREATE INDEX idx_wishlist_items_book ON wishlist_items (book_id);
