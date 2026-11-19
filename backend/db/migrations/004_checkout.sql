-- 004_checkout: addresses, shipping zones, coupons, gift point ledger, order checkout columns, payments (Phase 6).
-- Isolated so it can be rolled back on its own (004_checkout.down.sql).
--
-- PENDING ADMIN APPROVAL items touched here (all provisional, none final):
--   * Inventory rules: stock is reserved (stock_quantity decremented, orders.stock_held = TRUE) when payment starts,
--     finalised on confirmation and released if payment fails (FR-069, FR-075). The reservation timing and any
--     expiry of abandoned reservations are part of the pending rules.
--   * Payment gateway/provider and lifecycle: `payments` is shaped for a temporary mock gateway only.
--   * Ownership of the gift point ledger across Order and Payment: it lives with Order for now.
-- Payment tables never hold card numbers or security codes (FR-073), only a gateway reference and a masked indicator.

-- Delivery addresses (FR-053). Postal code is a 6-digit Indian PIN.
CREATE TABLE addresses (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id   BIGINT      NOT NULL REFERENCES members (id) ON DELETE CASCADE,
  recipient   TEXT        NOT NULL,
  phone       TEXT        NOT NULL CHECK (phone ~ '^[6-9][0-9]{9}$'),
  line1       TEXT        NOT NULL,
  line2       TEXT,
  city        TEXT        NOT NULL,
  state       TEXT        NOT NULL,
  pin_code    TEXT        NOT NULL CHECK (pin_code ~ '^[1-9][0-9]{5}$'),
  is_default  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_addresses_member ON addresses (member_id);

-- Zone rules: the longest matching PIN prefix wins (FR-054, FR-055). Configurable data, not code.
CREATE TABLE shipping_zones (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pin_prefix     TEXT          NOT NULL UNIQUE CHECK (pin_prefix ~ '^[1-9][0-9]{0,5}$'),
  zone           TEXT          NOT NULL,
  delivery_days  INTEGER       NOT NULL CHECK (delivery_days > 0),
  charge         NUMERIC(10,2) NOT NULL CHECK (charge >= 0)
);

-- Seeded sample coupons only; no coupon management (spec assumption).
CREATE TABLE coupons (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code         TEXT          NOT NULL UNIQUE CHECK (code = upper(code)),
  type         TEXT          NOT NULL CHECK (type IN ('PERCENT', 'FLAT')),
  value        NUMERIC(10,2) NOT NULL CHECK (value > 0),
  valid_from   TIMESTAMPTZ   NOT NULL,
  valid_to     TIMESTAMPTZ   NOT NULL,
  min_order    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (min_order >= 0),
  usage_limit  INTEGER       CHECK (usage_limit IS NULL OR usage_limit > 0),
  used_count   INTEGER       NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  CHECK (valid_to > valid_from),
  CHECK (type <> 'PERCENT' OR value <= 100)
);

-- Orders grow from the read-side table of Phase 2. Existing seed rows keep working: new columns have defaults.
ALTER TABLE orders
  ADD COLUMN confirmed_at       TIMESTAMPTZ,
  ADD COLUMN address_id         BIGINT REFERENCES addresses (id) ON DELETE SET NULL,
  -- Address as it was at purchase, so editing or deleting the saved address never changes the order.
  ADD COLUMN address_snapshot   JSONB,
  ADD COLUMN subtotal           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  ADD COLUMN shipping_charge    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (shipping_charge >= 0),
  ADD COLUMN coupon_id          BIGINT REFERENCES coupons (id),
  ADD COLUMN coupon_code        TEXT,
  ADD COLUMN coupon_discount    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (coupon_discount >= 0),
  ADD COLUMN points_redeemed    INTEGER       NOT NULL DEFAULT 0 CHECK (points_redeemed >= 0),
  ADD COLUMN points_discount    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (points_discount >= 0),
  ADD COLUMN estimated_delivery DATE,
  -- TRUE while this order holds (reserved or finalised) stock; cleared when the stock is released.
  ADD COLUMN stock_held         BOOLEAN       NOT NULL DEFAULT FALSE;

CREATE INDEX idx_orders_member_created ON orders (member_id, created_at DESC);
-- One open Pending Payment order per member: checkout edits it, and a payment retry reuses it (FR-075).
CREATE UNIQUE INDEX orders_one_pending_per_member ON orders (member_id) WHERE status = 'Pending Payment';

-- Auditable gift point ledger (FR-078). Balance is derived from, and checked against, these entries.
CREATE TABLE gift_point_ledger (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id      BIGINT      NOT NULL REFERENCES members (id),
  type           TEXT        NOT NULL CHECK (type IN ('EARN', 'REDEEM', 'REFUND')),
  points         INTEGER     NOT NULL CHECK (points <> 0),
  balance_after  INTEGER     NOT NULL CHECK (balance_after >= 0),
  order_id       BIGINT      REFERENCES orders (id),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((type = 'REDEEM' AND points < 0) OR (type <> 'REDEEM' AND points > 0))
);
CREATE INDEX idx_gift_points_member ON gift_point_ledger (member_id, id);

-- Payment attempts. PENDING ADMIN APPROVAL: provider and lifecycle. The mock gateway fills gateway_ref.
CREATE TABLE payments (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         BIGINT        NOT NULL REFERENCES orders (id),
  method           TEXT          NOT NULL CHECK (method IN ('CARD', 'UPI', 'NET_BANKING', 'COD')),
  amount           NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  status           TEXT          NOT NULL
                   CHECK (status IN ('INITIATED', 'AUTHORIZED', 'PAY_ON_DELIVERY_PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  gateway_ref      TEXT,
  masked_indicator TEXT,
  failure_reason   TEXT,
  idempotency_key  TEXT          NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- One key can never create two payments (FR-074).
  CONSTRAINT payments_idempotency_unique UNIQUE (idempotency_key)
);
-- At most one payment that succeeded or is pending delivery per order: a second charge is impossible.
CREATE UNIQUE INDEX payments_one_success_per_order
  ON payments (order_id) WHERE status IN ('AUTHORIZED', 'PAY_ON_DELIVERY_PENDING', 'PAID');
CREATE INDEX idx_payments_order ON payments (order_id);
