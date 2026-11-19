-- 001_core: Core catalogue and member tables (Phase 2, T021).
-- Plain SQL for the `pg` driver. Items that depend on pending Admin decisions are
-- NOT here; they live in 002_pending_admin_placeholders.sql so they stay reversible.

CREATE TABLE members (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           TEXT        NOT NULL CHECK (length(btrim(name)) > 0),
  email          TEXT        NOT NULL UNIQUE CHECK (email = lower(email)),
  mobile         TEXT        NOT NULL UNIQUE CHECK (mobile ~ '^[0-9]{10}$'),
  password_hash  TEXT        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE,
  slug        TEXT    NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL UNIQUE
);

CREATE TABLE authors (
  id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

-- Naming layer for Brand (diagram) vs Publisher (spec). The final name is a pending
-- Admin decision; see 002 for the `brands` view.
CREATE TABLE publishers (
  id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE books (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  isbn               TEXT          NOT NULL UNIQUE,
  title              TEXT          NOT NULL,
  short_description  TEXT          NOT NULL,
  description        TEXT          NOT NULL,
  cover_url          TEXT          NOT NULL,
  price              NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  format             TEXT          NOT NULL CHECK (format IN ('Paperback', 'Hardcover', 'eBook')),
  language           TEXT          NOT NULL,
  publication_date   DATE          NOT NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  is_active          BOOLEAN       NOT NULL DEFAULT TRUE,
  popularity_score   INTEGER       NOT NULL DEFAULT 0 CHECK (popularity_score >= 0),
  publisher_id       BIGINT        REFERENCES publishers (id)
);

-- Join table: works for single or multiple categories per book (pending Admin decision;
-- no constraint forbids or requires a second category).
CREATE TABLE book_categories (
  book_id      BIGINT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  category_id  BIGINT NOT NULL REFERENCES categories (id),
  PRIMARY KEY (book_id, category_id)
);

CREATE TABLE book_authors (
  book_id    BIGINT NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  author_id  BIGINT NOT NULL REFERENCES authors (id),
  PRIMARY KEY (book_id, author_id)
);

-- Read-side order tables so recommendations can be tested before checkout exists.
-- Later phases extend these.
CREATE TABLE orders (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number  TEXT          NOT NULL UNIQUE,
  member_id     BIGINT        NOT NULL REFERENCES members (id),
  status        TEXT          NOT NULL,
  total         NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE order_lines (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    BIGINT        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  book_id     BIGINT        NOT NULL REFERENCES books (id),
  quantity    INTEGER       NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0)
);

-- Configurable rules (cancel window, return window, shipping thresholds, timers).
CREATE TABLE app_config (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE INDEX idx_books_publisher ON books (publisher_id);
CREATE INDEX idx_books_popularity ON books (popularity_score DESC);
CREATE INDEX idx_book_categories_category ON book_categories (category_id);
CREATE INDEX idx_book_authors_author ON book_authors (author_id);
CREATE INDEX idx_orders_member ON orders (member_id);
CREATE INDEX idx_order_lines_book ON order_lines (book_id);
