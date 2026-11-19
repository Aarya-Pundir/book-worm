-- 002_pending_admin_placeholders: PROVISIONAL PLACEHOLDERS ONLY (Gate G2).
-- Every item below is PENDING ADMIN APPROVAL. None of it is a requirement or a final
-- decision. It is isolated here so it can be changed or rolled back
-- (002_pending_admin_placeholders.down.sql) without touching 001_core.sql.
--
-- Not created here (still entirely undecided, nothing implemented):
--   * Payment gateway/provider and lifecycle: no payment tables in Phase 2.

-- PENDING ADMIN APPROVAL: admin roles and permissions.
-- Placeholder: MEMBER / ADMIN as in the diagram ("Role & Entitlement").
ALTER TABLE members
  ADD COLUMN role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('MEMBER', 'ADMIN'));

-- PENDING ADMIN APPROVAL: inventory rules.
-- Placeholder: a plain quantity for availability display only; no reservation or thresholds.
ALTER TABLE books
  ADD COLUMN stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0);

-- PENDING ADMIN APPROVAL: store responsibilities.
-- Placeholder: structure only (id, name); no store behaviour is implemented.
CREATE TABLE stores (
  id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

-- PENDING ADMIN APPROVAL: Brand (diagram) vs Publisher (spec).
-- Placeholder: `publishers` is the table; `brands` is an alias view so either name works.
CREATE VIEW brands AS SELECT id, name FROM publishers;
