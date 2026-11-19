# Data Model: Book Worm

Phases 1-4 create the "Core" tables. Phases 5-7 add the "Later" tables, and Phase 7.5 adds the member wishlist and followed writers. Anything marked PENDING ADMIN APPROVAL is a **provisional placeholder, not a final decision**. Migrations touching those items are kept isolated and reversible, and the Admin is informed before the Phase 2 migration is applied (Gate G2 in plan.md). Entity names follow the authoritative diagram in `documents/architecture-diagram.png` (Member, Store, Catalog, Order, Payment, Shipping).

## Core (Phases 2-4)

| Entity | Key fields | Relationships / rules |
|--------|------------|-----------------------|
| Member | id, name, email (unique, lowercase), mobile (unique, normalized), passwordHash, role (MEMBER/ADMIN), status, createdAt | Guests have no row. PENDING ADMIN APPROVAL: admin roles/permissions |
| Store | id, name | One seeded row. PENDING ADMIN APPROVAL: store responsibilities |
| Category | id, name (unique), slug, sortOrder | The 19 stored genres (everything except `All`). `All` is a UI-only option, not a row, so the spec's 20-option list (FR-021) is 19 rows plus `All`. Many-to-many with Book |
| Author | id, name (unique per name) | Many-to-many with Book |
| Publisher / Brand | id, name (unique) | One-to-many with Book. PENDING ADMIN APPROVAL: Brand (diagram) vs Publisher (spec); the final name is not decided |
| Book | id, isbn (unique), title, shortDescription, description, coverUrl, price, format, language, publicationDate, createdAt, stockQuantity, isActive, popularityScore, publisherId | `stockQuantity` is a PENDING ADMIN APPROVAL placeholder (inventory rules), added in the isolated migration 002 |
| BookCategory | bookId, categoryId | Composite unique. PENDING ADMIN APPROVAL: single vs multiple categories (join table works for both) |
| BookAuthor | bookId, authorId | Composite unique |
| Order / OrderLine (read side for now) | memberId, status, lines (bookId, quantity, unitPrice) | Seeded sample orders let recommendations be tested before checkout exists |
| AppConfig | key, value | Configurable rules (cancel window, return window, shipping thresholds, timers) |

Validation rules: email format and lowercase uniqueness; mobile normalized to a 10-digit Indian number; password minimum length and complexity; price >= 0; format in (Paperback, Hardcover, eBook); inactive books never returned by catalogue endpoints.

Seed rules: use `upsert` on unique names/slugs/emails so repeated runs create no duplicates (SC-012).

## Later (Phases 5-7.5)

| Entity | Key fields | Notes |
|--------|------------|-------|
| Cart, CartItem | **Implemented in migration 003 (Phase 5).** `carts` has exactly one owner: `member_id` or `guest_token_hash` (SHA-256 of the cookie token; CHECK constraint). `cart_items`: cart, book, quantity > 0, `price_at_add` (only to detect price changes) | Guest cart merged into the member cart on login, quantities summed and limited to stock. Prices and availability are always recomputed from `books` |
| Address | **Implemented in migration 004 (Phase 6).** memberId, recipient, phone, line1, line2, city, state, pinCode, isDefault | 6-digit PIN validation (not starting with 0). Every query is scoped by member id. Orders keep their own copy (orders.address_snapshot) |
| Order / OrderLine | **Extended in migration 004 (Phase 6).** orderNumber (unique), status, subtotal, shippingCharge, coupon (id, code, discount), pointsRedeemed, pointsDiscount, total, estimatedDelivery, confirmedAt, addressId, addressSnapshot, `stock_held` | Lines keep the purchase price (FR-070). One Pending Payment order per member (unique index). A Pending Payment order holds no stock; stock is reserved when payment starts (PENDING ADMIN APPROVAL: inventory rules) **Phase 7 (migration 005)** adds `delivered_at`, `cancelled_at`, `cancel_reason` and the statuses Delivered, Cancelled, Return Requested and Returned. Payment status adds CANCELLED |
| Payment | **Implemented in migration 004 (Phase 6).** orderId, method, amount, status, gatewayRef, failureReason, idempotencyKey (unique, stored as `memberId:clientKey`) | At most one successful payment per order (partial unique index). No card data. Temporary mock gateway behind a swappable interface. PENDING ADMIN APPROVAL: provider and lifecycle; payment requirements stay PARTIAL |
| Refund | **Implemented in migration 005 (Phase 7).** orderId, paymentId, reason (CANCELLATION/RETURN), amount, status (PENDING/COMPLETED/NOT_REQUIRED), gatewayRef | One refund per order and reason (unique index), so a repeat never refunds twice. A gateway failure leaves it PENDING and it is retried. COD that was never collected is NOT_REQUIRED. Mock gateway only; PENDING ADMIN APPROVAL: provider and lifecycle
| Shipment, ShipmentEvent, ReturnShipment | **Implemented in migration 005 (Phase 7).** `shipments` (one per order with physical books: status, estimatedDate, confirmedDate, trackingRef BWT..), `shipment_events` (status, time, actor SYSTEM/ADMIN), `return_shipments` (Requested, Picked Up, Received; trackingRef BWR..) | Status moves on configurable timers counted from creation (applied when an order is viewed and by a 30-second sweep) or by an Admin override. Forward only. The confirmed date and tracking reference appear only at dispatch. eBook-only orders have no shipment. Admin role details are PENDING ADMIN APPROVAL
| GiftPointLedger | **Implemented in migration 004 (Phase 6).** memberId, type (EARN/REDEEM/REFUND), points, balanceAfter, orderId, note | Balance never negative (CHECK). Welcome points are seeded once. **EARN on delivery added in Phase 7** (unique index: one EARN per order). REFUND entries restore points on cancellation and return |
| Coupon | **Implemented in migration 004 (Phase 6).** code, type (FLAT/PERCENT), value, validFrom/To, minOrder, usageLimit, usedCount | Seeded only. The use is taken when payment starts and returned if it fails |
| ShippingZone | **Implemented in migration 004 (Phase 6).** pinPrefix (longest match wins), zone, deliveryDays, charge | Seeded and configurable. Free-shipping threshold is in `app_config` |
| WishlistItem | **Implemented, Phase 7.5 (migration 006).** memberId, bookId, addedAt. Unique per (memberId, bookId). Both foreign keys; deleting a member removes their rows | Owned by the **Member** module (D1). A book is added only if it is active (unknown or inactive is rejected); an active out-of-stock book is accepted. A book that later becomes inactive keeps its row and is returned with only bookId, title, coverUrl and an unavailable reason (FR-084). Availability is derived at read time from `books.is_active` and `stock_quantity` (provisional inventory rule, PENDING ADMIN APPROVAL); nothing about availability is stored. Maximum size from config key `wishlist_max_items` (default 200). Every query is scoped by member id. No seed rows |
| FollowedAuthor | **Implemented, Phase 7.5 (migration 007).** Table ollowed_authors. memberId, authorId, followedAt. Primary key (memberId, authorId). Both foreign keys; deleting a member removes their rows | Owned by the **Member** module (D1). Reuses `authors` and `book_authors`; no author columns are added and members cannot create, edit or delete authors. Any existing author can be followed, including one with no active books (D5). The active book count is computed at read time from `book_authors` and `books.is_active`, the same rule as `GET /api/authors`. Every query is scoped by member id. No seed rows |

## State Transitions

- Order: Pending Payment -> Confirmed -> Dispatched -> Delivered; Confirmed -> Cancelled (within 48 h and before dispatch); Delivered -> Return Requested -> Returned. Failed payment leaves Pending Payment (stock released).
- Payment: Initiated -> Authorized | Failed; COD: Pay on Delivery - Pending -> Paid on delivery; Authorized/Paid -> Refunded / Partially Refunded.
- Shipment: Preparing -> Dispatched -> In Transit -> Delivered (timer or admin override; no moving backwards).
- Wishlist item (Phase 7.5): absent -> present (add, idempotent) -> absent (remove, idempotent). Availability is not a state of the row: Available <-> Unavailable (out of stock) follows stock, and Available/Unavailable -> Inactive follows `is_active`. An unavailable or inactive item stays listed and removable but is refused by the cart.
- Followed writer (Phase 7.5): not followed -> followed (follow, idempotent) -> not followed (unfollow, idempotent). A writer with no active books stays followed and is shown with a count of 0.

## Phase 7.5 Ownership and Privacy Rules

- Both new tables belong to exactly one member. Guests have no rows, and every route is behind authentication. A member can never read or change another member's rows (FR-090, SC-022).
- Other modules are reached through service interfaces only: books and authors through the Catalog service, adding to the cart through the Order cart service. The Member module never reads their tables directly for display data.
- No Admin behaviour is added. None of the six PENDING ADMIN APPROVAL items is changed.
- Rollback: `007_followed_writers.down.sql` and `006_wishlist.down.sql` drop only their own table (and `wishlist_max_items` is removed by the seed's own idempotent upsert rules, not by the migration).
