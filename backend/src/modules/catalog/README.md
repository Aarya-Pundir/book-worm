# catalog module

Diagram responsibilities (documents/architecture-diagram.png):

Browse catalog by entitlement; browse products by category and brand; recommendations based on order history; up-sell and cross-sell.

PENDING ADMIN APPROVAL: Brand vs Publisher; single vs multiple categories per book.

## Phase 7.5 support

Catalog gives the Member module read-only helpers (service functions `isActiveBook`, `booksForWishlist`, `findAuthor`, `getAuthor`, `authorsByIds`). `booksForWishlist` selects only id, title and cover for an inactive book, so nothing else can leak. Catalog never reads wishlist or follow tables. `GET /api/books?author={id}` is unchanged and powers the writer page.
