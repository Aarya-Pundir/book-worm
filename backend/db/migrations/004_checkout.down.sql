-- Reverses 004_checkout. Drops checkout data (addresses, ledger, payments). Existing seeded orders are kept.
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS gift_point_ledger;
DROP INDEX IF EXISTS orders_one_pending_per_member;
DROP INDEX IF EXISTS idx_orders_member_created;
ALTER TABLE orders
  DROP COLUMN IF EXISTS stock_held,
  DROP COLUMN IF EXISTS estimated_delivery,
  DROP COLUMN IF EXISTS points_discount,
  DROP COLUMN IF EXISTS points_redeemed,
  DROP COLUMN IF EXISTS coupon_discount,
  DROP COLUMN IF EXISTS coupon_code,
  DROP COLUMN IF EXISTS coupon_id,
  DROP COLUMN IF EXISTS shipping_charge,
  DROP COLUMN IF EXISTS subtotal,
  DROP COLUMN IF EXISTS address_snapshot,
  DROP COLUMN IF EXISTS address_id,
  DROP COLUMN IF EXISTS confirmed_at;
DROP TABLE IF EXISTS coupons;
DROP TABLE IF EXISTS shipping_zones;
DROP TABLE IF EXISTS addresses;
