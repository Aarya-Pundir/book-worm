-- 005_fulfilment: shipments, return shipments, refunds, cancellation and delivery columns (Phase 7).
-- Isolated so it can be rolled back on its own (005_fulfilment.down.sql).
--
-- PENDING ADMIN APPROVAL items touched here (all provisional, none final):
--   * Payment gateway/provider and lifecycle: `refunds` is shaped for the temporary mock gateway only.
--   * Inventory rules: cancellation gives stock back; a returned book does NOT change stock automatically.
--   * Admin roles and permissions: the shipment override is limited to the placeholder ADMIN role.
--   * Store responsibilities: the simulated carrier is not tied to a store.

ALTER TABLE orders
  ADD COLUMN cancelled_at  TIMESTAMPTZ,
  ADD COLUMN cancel_reason TEXT,
  ADD COLUMN delivered_at  TIMESTAMPTZ;

-- The order statuses named in the spec (Key Entities). Existing rows already use only these values.
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('Pending Payment', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled', 'Return Requested', 'Returned')
);

-- Sample orders (seeded as Delivered) get delivery times so the return window can be worked out.
UPDATE orders SET confirmed_at = COALESCE(confirmed_at, created_at), delivered_at = created_at
 WHERE status = 'Delivered' AND delivered_at IS NULL;

-- A Cash on Delivery payment that never collected cash (order cancelled or refused at the door) is CANCELLED.
ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (
  status IN ('INITIATED', 'AUTHORIZED', 'PAY_ON_DELIVERY_PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED')
);
-- One shipment per order with physical books (FR-057). eBooks need none.
CREATE TABLE shipments (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id        BIGINT      NOT NULL UNIQUE REFERENCES orders (id),
  status          TEXT        NOT NULL CHECK (status IN ('Preparing', 'Dispatched', 'In Transit', 'Delivered', 'Cancelled')),
  tracking_ref    TEXT,
  estimated_date  DATE,
  -- Set only when the shipment is dispatched (SC-018).
  confirmed_date  DATE,
  dispatched_at   TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every status change with its time and who made it (FR-059, FR-059a).
CREATE TABLE shipment_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipment_id  BIGINT      NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
  status       TEXT        NOT NULL,
  actor        TEXT        NOT NULL CHECK (actor IN ('SYSTEM', 'ADMIN')),
  occurred_at  TIMESTAMPTZ NOT NULL,
  note         TEXT
);
CREATE INDEX idx_shipment_events_shipment ON shipment_events (shipment_id, id);

-- Pickup and receipt of books being returned (FR-058). One return per order.
CREATE TABLE return_shipments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id      BIGINT      NOT NULL UNIQUE REFERENCES orders (id),
  status        TEXT        NOT NULL CHECK (status IN ('Requested', 'Picked Up', 'Received')),
  tracking_ref  TEXT        NOT NULL,
  picked_up_at  TIMESTAMPTZ,
  received_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Money returned for a cancelled or returned order, recorded against the original payment (FR-077).
-- NOT_REQUIRED: nothing was collected (for example Cash on Delivery cancelled before delivery).
-- PENDING: started but not yet completed by the gateway (a return waits until the books are received).
CREATE TABLE refunds (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    BIGINT        NOT NULL REFERENCES orders (id),
  -- NULL only for sample orders that have no payment record; such a refund is always NOT_REQUIRED.
  payment_id  BIGINT        REFERENCES payments (id),
  reason      TEXT          NOT NULL CHECK (reason IN ('CANCELLATION', 'RETURN')),
  amount      NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  status      TEXT          NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'NOT_REQUIRED')),
  gateway_ref TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
-- An order is refunded at most once per reason, so a repeated request can never refund twice.
CREATE UNIQUE INDEX refunds_one_per_reason ON refunds (order_id, reason);
CREATE INDEX idx_refunds_status ON refunds (status) WHERE status = 'PENDING';

-- Points are earned at most once per order (FR-078).
CREATE UNIQUE INDEX gift_points_one_earn_per_order ON gift_point_ledger (order_id)
  WHERE type = 'EARN' AND order_id IS NOT NULL;

-- Orders confirmed before this migration (Phase 6) get a shipment so they move forward like new ones.
-- Digital-only orders are treated as delivered once payment is confirmed (spec assumption).
INSERT INTO shipments (order_id, status, estimated_date)
SELECT o.id, 'Preparing', o.estimated_delivery
  FROM orders o
 WHERE o.status = 'Confirmed'
   AND EXISTS (SELECT 1 FROM order_lines ol JOIN books b ON b.id = ol.book_id WHERE ol.order_id = o.id AND b.format <> 'eBook');
INSERT INTO shipment_events (shipment_id, status, actor, occurred_at)
SELECT s.id, 'Preparing', 'SYSTEM', COALESCE(o.confirmed_at, now()) FROM shipments s JOIN orders o ON o.id = s.order_id;
UPDATE orders o SET status = 'Delivered', delivered_at = COALESCE(o.confirmed_at, now())
 WHERE o.status = 'Confirmed'
   AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id);
