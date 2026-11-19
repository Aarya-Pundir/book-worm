-- Reverses 005_fulfilment. Drops shipments, returns and refunds. Orders keep their other data.
DROP INDEX IF EXISTS gift_points_one_earn_per_order;
DROP TABLE IF EXISTS refunds;
DROP TABLE IF EXISTS return_shipments;
DROP TABLE IF EXISTS shipment_events;
DROP TABLE IF EXISTS shipments;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
UPDATE payments SET status = 'PAY_ON_DELIVERY_PENDING' WHERE status = 'CANCELLED';
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (
  status IN ('INITIATED', 'AUTHORIZED', 'PAY_ON_DELIVERY_PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED')
);
ALTER TABLE orders
  DROP COLUMN IF EXISTS delivered_at,
  DROP COLUMN IF EXISTS cancel_reason,
  DROP COLUMN IF EXISTS cancelled_at;
