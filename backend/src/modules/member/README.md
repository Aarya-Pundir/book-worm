# member module

Diagram responsibilities (documents/architecture-diagram.png):

Guest/registered users; login and logout; role and entitlement.

PENDING ADMIN APPROVAL: Admin roles and permissions.

## Phase 7.5: My Wishlist and My Writers

Implemented here (D1); the diagram has no separate box for them.

- `wishlist.*`: `/api/wishlist` (members only). Add (active books only; out of stock is allowed and labelled unavailable), view newest first, idempotent remove, and add to cart through `order/cart.service`. Maximum size from config key `wishlist_max_items`.
- `writers.*`: `/api/writers` (members only) to follow, unfollow and list. `GET /api/authors/{id}` (public, `following` only for a signed-in member) is mounted here; the writer list `GET /api/authors` stays in Catalog.
- Tables `wishlist_items` and `followed_authors` (migrations 006 and 007). Every query is scoped by the session member. Book and writer data is read only through the Catalog service.
- A wishlisted book that became inactive is returned with only `bookId`, `title`, `coverUrl`, `available:false` and `unavailableReason`.
- "Out of stock" uses the provisional stock rule. PENDING ADMIN APPROVAL: inventory rules.
