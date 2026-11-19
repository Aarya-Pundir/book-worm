-- 003_cart: shopping cart for guests and members (Phase 5, T056). Belongs to the Order module.
-- Isolated from 001/002 so it can be rolled back on its own (003_cart.down.sql).
--
-- A cart belongs to exactly one owner: a member (member_id) OR a guest (guest_token_hash).
-- The guest token itself lives only in the visitor's httpOnly cookie; only its SHA-256 hash is stored.
-- Prices are NEVER trusted from the client: price_at_add is the catalogue price the visitor last saw,
-- kept only so a later price change can be reported (FR-049).

CREATE TABLE carts (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id         BIGINT      UNIQUE REFERENCES members (id) ON DELETE CASCADE,
  guest_token_hash  TEXT        UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT carts_one_owner CHECK ((member_id IS NOT NULL) <> (guest_token_hash IS NOT NULL))
);

CREATE TABLE cart_items (
  cart_id       BIGINT        NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
  book_id       BIGINT        NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  quantity      INTEGER       NOT NULL CHECK (quantity > 0),
  price_at_add  NUMERIC(10,2) NOT NULL CHECK (price_at_add >= 0),
  added_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (cart_id, book_id)
);

CREATE INDEX idx_cart_items_book ON cart_items (book_id);
