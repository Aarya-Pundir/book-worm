# Feature Specification: Book Worm - Member Authentication, Catalogue Browsing, Cart, Delivery, Order and Payment

**Feature Branch**: `001-member-auth-catalogue`

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "Book Worm Feature 1 - Member Authentication + Home Page + Catalogue Browsing. Registered login, registration, guest access, role-based access, dark-themed home page with 20 genre sidebar, search/filter/sort bar, Recommended for You / Bestsellers This Month / New Launches sections, book cards, genre/author/publisher browsing, book details page, combined server-side filtering. Extended to include Cart, Delivery/Shipping, Order and Payment. Store administration, wishlist and writers remain out of scope."

**Amendment 2026-11-17 (Phase 7.5)**: the wishlist and writers statement above is **superseded** for My Wishlist and My Writers only (User Stories 13 and 14, FR-081..FR-091, SC-022..SC-025). Store administration and Admin features remain out of scope. The original wording is kept for history.

## Clarifications

### Session 2026-11-16

- Q: How does a shipment move from Preparing to Dispatched, In Transit and Delivered? → A: Automatically on configurable timers, plus an Admin-only override action for demos and testing (FR-059a).
- Q: Which payment methods does the simulated gateway offer? → A: Card, UPI, Net Banking and Cash on Delivery (FR-072).
- Q: When is a Cash on Delivery order Confirmed? → A: On acceptance of the COD terms, with payment shown as Pay on Delivery - Pending until delivery (FR-072a, SC-015a).

### Session 2026-11-17 (Phase 7.5)

- Q: Can an active book that is out of stock be added to a wishlist? → A: Yes. It is labelled unavailable and cannot be added to the cart until stock is available. Unknown or already inactive books are rejected when adding (FR-082).
- Q: What does a wishlist show for a book that became inactive after it was added? → A: Only its identifier, title, cover image and an unavailable reason. No other catalogue information is exposed (FR-084).
- Q: Does adding a wishlist book to the cart remove it from the wishlist? → A: No (FR-086).
- Q: Can a writer with no active books be followed? → A: Yes, any existing writer can be followed; the writer is shown with a "no books available right now" message (FR-087, FR-088).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the catalogue by genre as a guest (Priority: P1)

A visitor opens Book Worm and chooses "Continue as Guest". They land on the home page, see the 20 genres in a left sidebar with "All" selected, and see three sections of books: Recommended for You, Bestsellers This Month and New Launches. They pick a genre such as "Mystery" and the page shows only books in that genre without reloading. They can go back to "All".

**Why this priority**: This is the core storefront. Without browsing there is nothing to sign in for, and it is the smallest slice that delivers customer value.

**Independent Test**: Open the app, choose Continue as Guest, select several genres, and confirm the displayed books match each genre and that "All" restores the full list.

**Acceptance Scenarios**:

1. **Given** a visitor on the login screen, **When** they choose Continue as Guest, **Then** the home page opens with "All" highlighted and books displayed.
2. **Given** the home page is showing, **When** the visitor selects a genre, **Then** that genre is highlighted and only books belonging to it are shown, with no full page reload.
3. **Given** a genre with no books, **When** the visitor selects it, **Then** a clear empty-state message is shown instead of a blank area.
4. **Given** a book that belongs to several genres, **When** the visitor selects any one of those genres, **Then** the book appears in the results.
5. **Given** a genre is selected, **When** the visitor selects "All", **Then** all active, available books are shown again.

---

### User Story 2 - Search, filter, sort and paginate books (Priority: P1)

A visitor (guest or member) narrows the catalogue using a search box (title or author, partial matches), and filters for language, format, price range, author and publisher, and chooses a sort order (Relevance, Price low to high, Price high to low, Newest Arrivals, Popularity). All of these can be combined with the selected genre and with each other. Results are paged.

**Why this priority**: Finding a book quickly is the main reason to use a bookstore; the filters are explicitly required to work together.

**Independent Test**: Apply a genre, a language, a price range and a search term together, change the sort order, move between pages, and verify every result satisfies all active criteria and is ordered correctly.

**Acceptance Scenarios**:

1. **Given** the catalogue, **When** the visitor types part of a title or an author name, **Then** books whose title or author partially match are shown.
2. **Given** a genre, language, format and price range are selected, **When** results load, **Then** every book shown satisfies all of them.
3. **Given** filters are active, **When** the visitor changes the sort order, **Then** the same filtered set is shown in the new order.
4. **Given** more matching books than fit on one page, **When** the visitor moves to another page, **Then** the next set of matching books is shown and filters remain applied.
5. **Given** the filters match no books, **When** results load, **Then** an empty-state message is shown with a way to clear filters.

---

### User Story 3 - Register and sign in as a member (Priority: P1)

A new customer registers with name, email, mobile number, password and confirmation. A returning customer signs in using either email or mobile number plus password, can show or hide the password, and sees clear validation and error messages. A signed-in member can sign out. The login screen also offers Forgot password, Sign Up and Continue as Guest.

**Why this priority**: Member identity is the foundation for every later personalised feature (orders, wishlist, recommendations).

**Independent Test**: Register a new account, sign out, sign in with email, sign out, sign in with mobile number, and confirm wrong credentials and duplicate registrations are rejected with clear messages.

**Acceptance Scenarios**:

1. **Given** the registration form, **When** the visitor submits valid, unique details, **Then** the account is created and a success message is shown.
2. **Given** an email or mobile number that is already registered, **When** the visitor registers, **Then** registration is rejected with a clear message and no duplicate account is created.
3. **Given** invalid email format, invalid mobile number, missing mandatory fields, weak password or mismatched confirmation, **When** the form is submitted, **Then** field-level validation messages are shown.
4. **Given** a registered member, **When** they sign in with correct email or mobile number and password, **Then** they are signed in and see their profile access in the header.
5. **Given** wrong credentials, **When** the member signs in, **Then** a generic "invalid credentials" message is shown that does not reveal which part was wrong.
6. **Given** a signed-in member, **When** they sign out, **Then** their session ends and member-only information is no longer accessible.
7. **Given** the login screen, **When** the visitor activates the password visibility control, **Then** the password is toggled between hidden and visible.

---

### User Story 4 - Personalised and curated home page sections (Priority: P2)

The home page shows three sections. "Recommended for You" shows recommendations based on the member's order history when it exists, and otherwise popular books. "Bestsellers This Month" shows the top-selling or most popular books. "New Launches" shows the most recently published or added books.

**Why this priority**: These sections drive discovery and match the reference design, but the catalogue is usable without them.

**Independent Test**: View the home page as a guest, as a member without orders and as a member with orders, and confirm each section's content and labelling.

**Acceptance Scenarios**:

1. **Given** a guest, **When** the home page loads, **Then** Recommended for You shows popular or trending books and is not presented as personalised.
2. **Given** a member with no order history, **When** the home page loads, **Then** Recommended for You shows popular books and is not presented as personalised.
3. **Given** a member with order history, **When** the home page loads, **Then** Recommended for You shows books related to their past purchases (for example same genres or authors) and excludes information about any other customer.
4. **Given** the catalogue, **When** the home page loads, **Then** Bestsellers This Month lists the most popular books and New Launches lists the most recently published or added books, newest first.

---

### User Story 5 - Book cards and book details (Priority: P2)

Each book appears as a card with cover image, title, author, short description, format, price, relevant categories and estimated delivery information when available. Selecting a card opens a details page with title, cover, author, full description, publisher, genre(s), language, format, price and availability.

**Why this priority**: Details are what a customer needs to decide on a book; they build on the browse and search stories.

**Independent Test**: Open the home page, select a card, and confirm all required details are shown and a book that does not exist shows a friendly not-found message.

**Acceptance Scenarios**:

1. **Given** any list of books, **When** it renders, **Then** each card shows cover, title, author, short description, format, price and categories, and no card shows a broken image.
2. **Given** a book card, **When** the visitor selects it, **Then** the details page shows title, cover, author, description, publisher, genre(s), language, format, price and availability.
3. **Given** an estimated delivery date is available, **When** it is shown, **Then** it is labelled as an estimate (tentative), not as a confirmed date.
4. **Given** an unknown or unavailable book address, **When** it is opened, **Then** a clear not-found message with a way back to the catalogue is shown.

---

### User Story 6 - Browse by author and by publisher (Priority: P3)

A visitor can see the list of available authors and publishers, choose one, and see only that author's or publisher's books. Genre, author and publisher remain separate and can be combined.

**Why this priority**: Valuable discovery paths, but secondary to genre browsing and search.

**Independent Test**: Choose an author, then a publisher, then combine either with a genre, and confirm results match all selected criteria.

**Acceptance Scenarios**:

1. **Given** the catalogue, **When** the visitor selects an author, **Then** only books by that author are shown.
2. **Given** the catalogue, **When** the visitor selects a publisher, **Then** only books from that publisher are shown.
3. **Given** an author and a genre are both selected, **When** results load, **Then** only books matching both are shown.
4. **Given** an author link on a card or details page, **When** it is selected, **Then** the catalogue shows that author's books.

---

### User Story 7 - Role-based access and header navigation (Priority: P3)

The header shows the Book Worm name, My Orders, My Wishlist, My Writers, a shopping cart icon with item count and a login/profile control. Guests may use the public catalogue and cart; members additionally have authenticated access to checkout, orders, addresses and gift points. Admin duties are kept separate from customer functions. My Wishlist and My Writers belong to later features and are visible placeholders that do not pretend to work. **Superseded 2026-11-17**: from Phase 7.5 these two entries are working features (User Stories 13 and 14); the placeholder wording is kept for history.

**Why this priority**: Establishes access boundaries and navigation consistency across the customer journey.

**Independent Test**: As a guest, try to reach member-only information directly; confirm it is denied. As a member, confirm access. Select the placeholder header items and confirm they clearly indicate they are not yet available.

**Acceptance Scenarios**:

1. **Given** a guest, **When** they request member-only information, **Then** access is denied and they are directed to sign in.
2. **Given** a member, **When** they request their own member information, **Then** it is returned.
3. **Given** a member, **When** they attempt an administrative action, **Then** it is denied.
4. **Given** the header, **When** a visitor selects My Wishlist or My Writers, **Then** a clear "coming soon" style message is shown and no fabricated data appears. *(Superseded 2026-11-17 by User Stories 13 and 14: a guest is asked to sign in, a member opens the working page. No fabricated data appears in either case.)*
5. **Given** a guest, **When** they select My Orders, **Then** they are asked to sign in.

---

### User Story 8 - Add books to the cart (Priority: P1)

A visitor adds books to the cart from a book card or the details page, views the cart, changes quantities, removes items and sees totals. The header cart icon shows the item count.

**Why this priority**: The cart is the path from browsing to purchase and is needed for every later order step.

**Independent Test**: Add several books as a guest, change quantities, remove one, confirm totals, then sign in and confirm the cart is kept.

**Acceptance Scenarios**:

1. **Given** a book details page, **When** the visitor adds the book, **Then** the cart count increases and a success message is shown.
2. **Given** a cart with items, **When** the visitor changes a quantity or removes an item, **Then** the line and total update immediately.
3. **Given** a book has limited availability, **When** the visitor asks for more than are available, **Then** the quantity is limited and a message explains why.
4. **Given** a guest with a cart, **When** they sign in, **Then** their cart items are kept and merged into their member cart.
5. **Given** a book's price changed after it was added, **When** the cart is viewed, **Then** the new price is shown with a notice.

---

### User Story 9 - Checkout with delivery address and shipping (Priority: P1)

A signed-in member starts checkout, chooses or adds a delivery address, sees an estimated delivery date and shipping charge, applies a coupon or gift points, and reviews the order summary before paying.

**Why this priority**: Customers need correct delivery information and totals before they can pay.

**Independent Test**: Check out with a physical book, an eBook and a mix of both; confirm addresses, estimates, shipping charges and discounts are correct and that eBooks do not need an address.

**Acceptance Scenarios**:

1. **Given** a guest with items in the cart, **When** they start checkout, **Then** they are asked to sign in or register and then return to checkout.
2. **Given** a member at checkout, **When** they add a valid address, **Then** it is saved and selectable, and an invalid address shows field messages.
3. **Given** a selected address, **When** the order summary loads, **Then** each physical book shows an estimated delivery date labelled as estimated, and the shipping charge is shown.
4. **Given** the order total is above the free-shipping threshold, **When** the summary loads, **Then** the shipping charge is zero.
5. **Given** a valid coupon or available gift points, **When** the member applies them, **Then** the discount is shown and the total updates; an invalid coupon shows a clear reason.
6. **Given** a cart containing only eBooks, **When** the member checks out, **Then** no address or shipping charge is requested.

---

### User Story 10 - Pay and confirm the order (Priority: P1)

A member pays through the payment gateway. On success the order is confirmed and a confirmation page shows the order number, payment reference and estimated delivery. On failure the member sees a clear message and can retry without losing the cart.

**Why this priority**: Payment turns a cart into a purchase and is the highest-risk step for money and trust.

**Independent Test**: Pay successfully, pay with a failing method, double-submit, and retry after failure; confirm that exactly one order is confirmed only for a successful payment.

**Acceptance Scenarios**:

1. **Given** a reviewed order, **When** payment is authorized, **Then** the order becomes Confirmed, a confirmation with the order number and payment reference is shown, and the cart is emptied.
2. **Given** a payment fails or is declined, **When** the result returns, **Then** no confirmation is shown, the order stays unconfirmed, stock is released, and the member can retry.
3. **Given** the member submits payment twice, **When** both submissions reach the system, **Then** only one charge and one order result.
4. **Given** a successful payment, **When** records are checked, **Then** no full card details are stored.
5. **Given** the last copy of a book was bought by someone else during checkout, **When** the member pays, **Then** the order is not confirmed and the member is told the item is unavailable.

---

### User Story 11 - View orders, track shipment, cancel or return (Priority: P2)

A member opens My Orders to see past orders (completed, cancelled and returned), opens an order to see its items, payment, shipment status and delivery date, and can cancel within 48 hours before dispatch or return a delivered book within the return window.

**Why this priority**: Order management builds customer trust and also supplies the history used for recommendations.

**Independent Test**: Place orders, cancel one inside the window, try to cancel one outside the window, advance a shipment to delivered, request a return, and confirm statuses, refunds and balances.

**Acceptance Scenarios**:

1. **Given** a member with orders, **When** they open My Orders, **Then** they see only their own orders, newest first, with accurate statuses.
2. **Given** an order within 48 hours of confirmation and not dispatched, **When** the member cancels, **Then** the order is Cancelled, a refund is started, stock is released and any redeemed points are restored.
3. **Given** an order older than 48 hours or already dispatched, **When** the member tries to cancel, **Then** cancellation is declined with a clear reason.
4. **Given** an order is shipped, **When** the member opens it, **Then** they see the shipment status, tracking reference and a confirmed delivery date once dispatched.
5. **Given** a delivered physical book within the return window, **When** the member requests a return, **Then** a return shipment is created, and the refund completes after the returned book is received.
6. **Given** another member's order number, **When** a member tries to open it, **Then** access is denied.

---

### User Story 12 - Buy Again and gift points (Priority: P3)

A member reorders books from a past order with one action and sees their gift point balance and history. Points are earned on delivered orders and can be redeemed at checkout.

**Why this priority**: Improves repeat purchasing but depends on orders and payments working first.

**Independent Test**: Use Buy Again on a past order that includes an unavailable book, redeem points on a new order, cancel it, and confirm the balance and ledger.

**Acceptance Scenarios**:

1. **Given** a past order, **When** the member selects Buy Again, **Then** its available books are added to the cart at current prices and unavailable ones are listed in a message.
2. **Given** a member with points, **When** they redeem points at checkout, **Then** the balance decreases by the redeemed amount, never below zero, and a ledger entry is recorded.
3. **Given** an order with redeemed points is cancelled, **When** the cancellation completes, **Then** the points are restored with a ledger entry.
4. **Given** an order is delivered, **When** delivery is recorded, **Then** earned points are added with a ledger entry.

---

### User Story 13 - My Wishlist (Priority: P2)

A signed-in member keeps a personal list of books they may want later. They can add a book from a book card or the details page, see the list, remove books, and add books from the list to the cart. A book that is not available right now stays on the list but is clearly labelled and cannot be put in the cart.

**Why this priority**: Supports repeat visits and purchases, but depends on the catalogue, accounts and the cart already working.

**Independent Test**: Sign in, add two books, sign out and in again and confirm the list is the same. Make one book out of stock and another inactive, then confirm both are labelled unavailable and refused by the cart while the third goes to the cart. Remove a book. Try everything as a guest and as another member.

**Acceptance Scenarios**:

1. **Given** a signed-in member viewing an active book, **When** they add it to their wishlist, **Then** it appears in My Wishlist, and adding it again does not create a second entry.
2. **Given** an active book that is out of stock, **When** the member adds it, **Then** it is accepted and shown as unavailable with the reason.
3. **Given** an unknown book or a book that is already inactive, **When** the member tries to add it, **Then** it is rejected with a clear message and nothing is stored.
4. **Given** a wishlist, **When** it is opened, **Then** books are shown newest first with current price, format, authors and cover; loading, error with retry and empty states exist; no fabricated data appears.
5. **Given** a wishlisted book that later becomes inactive, **When** the wishlist is opened, **Then** it stays on the list showing only its title, cover and the reason it is unavailable, and it can be removed.
6. **Given** a wishlist with available and unavailable books, **When** the member adds one book or all available books to the cart, **Then** available books are added at current prices within stock, unavailable ones are listed with the reason, and the books stay on the wishlist.
7. **Given** a member, **When** they remove a book, **Then** it disappears from the list; removing it again causes no error.
8. **Given** a guest, **When** they use any wishlist action, **Then** they are asked to sign in and nothing is stored.
9. **Given** two members, **When** one adds or removes books, **Then** the other's wishlist never changes and cannot be read.

---

### User Story 14 - My Writers (Priority: P3)

A signed-in member follows writers they like, sees the list of followed writers, and opens a writer's page to see that writer's books. Writers and their books are the existing catalogue data; nothing about writers is created or edited by members.

**Why this priority**: A discovery convenience that builds on author browsing (User Story 6) and accounts.

**Independent Test**: Sign in, follow a writer, sign out and in again and confirm the follow is kept, open the writer page and check the books match the catalogue filtered by that writer, then unfollow. Repeat as a guest and as another member. Open a writer who has no active books.

**Acceptance Scenarios**:

1. **Given** a signed-in member viewing a book by a writer, **When** they follow the writer, **Then** the writer appears in My Writers; following again does not create a second entry.
2. **Given** My Writers, **When** it is opened, **Then** followed writers are shown newest first with the number of books currently available; loading, error with retry and empty states exist.
3. **Given** a followed writer, **When** the member unfollows, **Then** the writer disappears from the list; unfollowing again causes no error.
4. **Given** a writer page, **When** it is opened by a guest or a member, **Then** it shows the writer's name and only active books, matching the catalogue filtered by that writer; a member also sees whether they follow the writer.
5. **Given** a writer with no active books, **When** the writer page or My Writers is opened, **Then** a clear "no books available right now" message is shown instead of an error.
6. **Given** an unknown writer, **When** it is requested, **Then** a clear not-found message is shown and nothing can be followed.
7. **Given** a guest, **When** they try to follow, unfollow or open My Writers, **Then** they are asked to sign in and nothing is stored.
8. **Given** two members, **When** one follows or unfollows writers, **Then** the other's list never changes and cannot be read.

---

### Edge Cases

- A visitor signs in or registers with an email differing only by letter case from an existing one: treated as the same account.
- A mobile number is entered with spaces, dashes or a country code: it is normalised before validation and duplicate checks.
- Repeated failed sign-in attempts: the system limits further attempts temporarily and shows a generic message.
- A session expires while a member is browsing: public pages keep working and member-only areas ask the member to sign in again.
- A price range where minimum is greater than maximum: the visitor sees a validation message.
- A search term containing special characters or very long text: handled safely, returning results or an empty state, never an error page.
- A page number beyond the last page: the last available page, or an empty state, is shown.
- A book has no cover image: a consistent placeholder is shown, not a broken image.
- A book is inactive or unavailable: it is excluded from "All" and from search results.
- A genre selected while a search is active: both apply together.
- Network or server failure while loading books: an error state with a retry option is shown.
- A member with order history whose related books are all already purchased: recommendations fall back to popular books.
- A book's price or availability changes while it is in a cart or during checkout: the customer is warned and sees the updated amounts before paying.
- The last copy of a book is in two customers' carts and both check out: only one order is confirmed; the other is told the item is no longer available.
- The customer double-clicks Pay, refreshes, or retries after a timeout: only one charge and one order result.
- The gateway times out or returns an unclear result: the order stays unconfirmed, the customer is told the result is being verified, and the system never confirms without successful authorization.
- The customer leaves the payment page and returns: the pending order can be resumed or expires and releases its reserved stock after a configurable time.
- A cancellation request arrives just after the 48-hour limit, or after dispatch: it is declined with a clear reason and a return option if eligible.
- An order mixes eBooks and physical books: only the physical books carry shipping charges and a delivery estimate.
- A coupon expires, hits its usage limit or the order falls below its minimum value between cart and payment: it is removed with a message and the total is recalculated.
- Gift points are redeemed on an order that is then cancelled: the points are returned and the balance entry is recorded.
- The delivery address has an unserviceable postal code: checkout explains that delivery is not available and lets the customer change the address.
- A guest with items in the cart signs in to an account that already has a cart: items are merged, with quantities combined and capped by availability.
- A wishlisted book goes out of stock or becomes inactive: it stays on the wishlist, is labelled unavailable, cannot be added to the cart, and can be removed. Only an inactive book's identifier, title, cover and reason are shown.
- A book is added to the wishlist twice, or two requests arrive at once: exactly one entry exists.
- The wishlist reaches its configurable maximum size: a clear message is shown and nothing is dropped.
- "Add all to cart" includes a book with limited stock: the quantity is limited to stock and the member is told; an unavailable book never causes the whole request to fail.
- A writer is followed twice, or unfollowed when not followed: no duplicate and no error.
- A followed writer later has no active books: the writer stays in My Writers with a "no books available right now" message.
- A member's session expires on the Wishlist or My Writers page: the page asks the member to sign in again and shows no stale data.

## Requirements *(mandatory)*

### Functional Requirements

**Member authentication**

- **FR-001**: The system MUST let a visitor register with name, email, mobile number, password and password confirmation.
- **FR-002**: The system MUST validate all mandatory fields, email format, mobile number format, password strength and confirmation match, and display field-level messages.
- **FR-003**: The system MUST prevent duplicate accounts by email or mobile number.
- **FR-004**: The system MUST store passwords only in protected (salted, one-way hashed) form and MUST NOT store them in readable form.
- **FR-005**: The system MUST let a registered member sign in with either email or mobile number plus password.
- **FR-006**: The system MUST reject invalid credentials with a generic message that does not reveal whether the identifier or the password was wrong.
- **FR-007**: The system MUST temporarily limit repeated failed sign-in attempts.
- **FR-008**: The system MUST maintain a secure member session, let the member sign out, and end the session on sign-out and on expiry.
- **FR-009**: The login screen MUST provide a password visibility toggle, a Forgot password entry point, a Sign Up option and a Continue as Guest option.
- **FR-010**: The system MUST let a visitor continue as a guest and use the public catalogue without an account.

**Authorization**

- **FR-011**: The system MUST support the roles Guest, Member and Admin and MUST keep customer and administrative responsibilities separate.
- **FR-012**: The system MUST enforce authorization on every protected server-side operation, not only in the user interface.
- **FR-013**: Guests MUST be denied access to member-only information and operations; members MUST only access their own information.
- **FR-014**: Catalogue viewing (categories, books, authors, publishers, book details) MUST be available to guests and members.

**Home page and navigation**

- **FR-015**: The home page MUST present a dark-themed layout with a header, a left genre sidebar, a search/filter/sort bar and the book sections, following the supplied reference screens.
- **FR-016**: The header MUST show the Book Worm name, My Orders, My Wishlist, My Writers, a cart icon with item count and login/profile access. My Orders and the cart MUST be functional. My Wishlist and My Writers belong to later features and MUST be non-functional placeholders that indicate they are not yet available and MUST NOT show fabricated data. *(Superseded 2026-11-17 for My Wishlist and My Writers by FR-091. The rule against fabricated data still applies.)*
- **FR-017**: The home page MUST show the sections Recommended for You, Bestsellers This Month and New Launches using real catalogue data.
- **FR-018**: Recommended for You MUST use the member's order history when it exists; otherwise it MUST show popular books and MUST NOT be described as personalised.
- **FR-019**: Recommendations MUST NOT reveal any other customer's purchase information.
- **FR-020**: Bestsellers This Month MUST list the most popular books, and New Launches MUST list the most recently published or added books, newest first.

**Genres**

- **FR-021**: The sidebar MUST list exactly these 20 genres with these exact names and in this order: All, Romance, Mystery, Science Fiction, Fantasy, Historical, Biography, Self-help, Memoir, Travel, Cooking, Children's, Young Adult, Comics & Graphic Novels, Poetry, Drama, Science, Philosophy, Religion, Language Learning.
- **FR-022**: The genre list MUST come from stored catalogue data, not be fixed in the user interface.
- **FR-023**: "All" MUST be selected by default and MUST show all active, available books.
- **FR-024**: Selecting a genre MUST show only books belonging to it, highlight the selection, and update results without a full page reload; selecting All MUST restore the full list.
- **FR-025**: A book MAY belong to multiple genres and MUST appear under each of them.
- **FR-026**: A genre with no books MUST show an empty-state message.
- **FR-027**: A single reusable catalogue view MUST serve every genre; there MUST NOT be separate hand-built pages per genre.

**Search, filter, sort, pagination**

- **FR-028**: The system MUST support searching by title and author with partial matching.
- **FR-029**: The system MUST support filtering by genre, author, publisher, language, format and price range.
- **FR-030**: The system MUST support sorting by Relevance, Price low to high, Price high to low, Newest Arrivals and Popularity.
- **FR-031**: Search, every filter and sorting MUST work together on the same result set.
- **FR-032**: Filtering, sorting and paging MUST be performed on the server; the full catalogue MUST NOT be loaded to the browser to be filtered there.
- **FR-033**: Results MUST be paginated, and filters MUST persist across pages.
- **FR-034**: Invalid filter values (for example minimum price above maximum) MUST produce a clear validation message rather than an error page.

**Authors and publishers**

- **FR-035**: The system MUST provide lists of authors and publishers from stored data and let visitors browse books by either.
- **FR-036**: Genre, author and publisher MUST remain separate concepts that can be combined.

**Book cards and details**

- **FR-037**: Each book card MUST show cover image, title, author, short description, format, price, relevant categories and estimated delivery information when available.
- **FR-038**: Book cards MUST have a consistent layout, be selectable to open book details, and use real cover images with a consistent fallback when a cover is missing.
- **FR-039**: The book details page MUST show title, cover, author, description, publisher, genre(s), language, format, price and availability.
- **FR-040**: Delivery dates shown MUST be labelled as estimated and MUST be distinguished from confirmed dates.
- **FR-041**: Requests for a nonexistent book MUST show a clear not-found message.

**Data and quality**

- **FR-042**: The system MUST provide repeatable seed data containing all 20 genres and enough realistic synthetic books, authors and publishers across genres (including books in multiple genres) to exercise search, filtering, sorting, pagination and the three home sections. Re-running seeding MUST NOT create duplicates or overwrite existing records unnecessarily.
- **FR-043**: Every data-loading screen MUST show loading, error (with retry) and empty states.
- **FR-044**: The interface MUST be responsive, keyboard accessible and follow accessibility best practices, with labelled form fields and text alternatives for images.
- **FR-045**: The system MUST validate all inputs on the server, return consistent, non-revealing error messages, and log security-relevant events without recording passwords or other secrets.
- **FR-046**: The Forgot password entry point MUST be present; the full reset flow is deferred (see Assumptions).

**Cart**

- **FR-047**: Visitors (guests and members) MUST be able to add a book to the cart from a book card and the book details page, choosing a quantity.
- **FR-048**: The system MUST let visitors view the cart, change quantities, remove items, and see item prices, discounts and the running total; the cart icon in the header MUST show the item count.
- **FR-049**: The system MUST recompute prices and availability from the catalogue on the server whenever the cart is viewed or checked out, and MUST warn the customer when a price or availability has changed.
- **FR-050**: The system MUST prevent adding more copies than are available and MUST not allow unavailable or inactive books in the cart.
- **FR-051**: A guest's cart MUST persist during the visit and MUST be merged into the member's cart on sign-in or registration without losing items.
- **FR-052**: Checkout MUST require sign-in; guests who start checkout MUST be asked to sign in or register and then returned to checkout.

**Delivery and shipping**

- **FR-053**: The system MUST let a member save, edit, delete and select delivery addresses, and MUST validate address fields (including postal code format).
- **FR-054**: The system MUST show an estimated delivery date for each physical book on the book details page and in the cart and checkout, based on the delivery address and configurable delivery rules, and MUST label it as estimated.
- **FR-055**: The system MUST calculate the shipping charge from configurable rules (delivery location, order value, item type), support a configurable free-shipping threshold, and show the charge before payment.
- **FR-056**: eBooks MUST NOT require a delivery address or shipping charge.
- **FR-057**: After an order is confirmed, the system MUST create a shipment, show a confirmed delivery date once dispatched, and let the member see shipment status (Preparing, Dispatched, In Transit, Delivered) and a tracking reference.
- **FR-058**: The system MUST support return shipments for eligible delivered orders and show their status.
- **FR-059**: Shipment status changes MUST be recorded with timestamps and visible in the order details.
- **FR-059a**: Shipment status MUST advance automatically (Preparing, Dispatched, In Transit, Delivered) on configurable timers after order confirmation, and an Admin-only action MUST be able to override the status for demonstration and testing. The override MUST be denied to Guests and Members, MUST follow the same status rules (no skipping backwards from Delivered, no dispatch of a cancelled order) and MUST be recorded in the status history.

**Orders**

- **FR-060**: A member MUST be able to review their order (items, address, delivery estimate, shipping charge, discounts, total) before paying, and go back to modify the cart or address.
- **FR-061**: The system MUST create an order in Pending Payment status on checkout and MUST change it to Confirmed only after payment is successfully authorized (online methods) or the Cash on Delivery terms are accepted (see FR-072a).
- **FR-062**: The system MUST show an order confirmation with an order number, items, totals, payment method and estimated delivery date, and MUST empty the purchased items from the cart.
- **FR-063**: The My Orders page MUST show only the signed-in member's orders, newest first, with status, date, items and total, and MUST reflect completed, cancelled and returned orders accurately.
- **FR-064**: The order details view MUST show items, address, payment summary, shipment status, estimated or confirmed delivery date, and available actions.
- **FR-065**: A member MUST be able to cancel an order within 48 hours of confirmation and before dispatch; outside this window or after dispatch the system MUST decline cancellation with a clear reason. The window MUST be configurable.
- **FR-066**: A cancelled order MUST trigger a refund through the payment module, release held stock, and restore any redeemed gift points and coupon use.
- **FR-067**: A member MUST be able to request a return for a delivered physical book within the configurable return window; the refund completes after the returned books are received.
- **FR-068**: A Buy Again option on past orders MUST add the previously purchased books to the cart, subject to current price and availability, and MUST tell the member about any unavailable items.
- **FR-069**: Stock MUST be reserved when an order is placed, finalized on confirmation, and released if payment fails or the order is cancelled; two customers MUST NOT both purchase the last copy.
- **FR-070**: Orders MUST keep the book prices, discounts and shipping charges that applied at purchase, unaffected by later catalogue changes.
- **FR-071**: Members MUST only be able to view and act on their own orders, addresses, payments and gift points; this MUST be enforced on the server.

**Payment**

- **FR-072**: The system MUST let a member pay through the payment gateway using Card, UPI or Net Banking, or choose Cash on Delivery, with gift points and coupons applied as part of the total.
- **FR-072a**: For Cash on Delivery, the order MUST be Confirmed once the member accepts the Cash on Delivery terms and passes order checks, with payment shown as Pay on Delivery - Pending; payment MUST become Paid when the shipment is recorded as Delivered. If the customer refuses or fails to pay at delivery, the order MUST be marked Cancelled, stock released and any redeemed gift points restored. Cash on Delivery MUST be available only for physical books and MAY be limited by a configurable maximum order value.
- **FR-073**: The system MUST NOT store or log full card numbers, security codes or other full payment credentials; only gateway references and masked indicators (such as the last four digits) MAY be kept.
- **FR-074**: Payment submissions MUST be idempotent: repeated submits or retries for the same order MUST result in at most one successful charge.
- **FR-075**: A failed or declined payment MUST leave the order unconfirmed, show a clear failure message, release reserved stock, and let the member retry or choose another method without re-entering the cart.
- **FR-076**: A successful payment MUST produce a payment confirmation (reference, amount, method, time) shown to the member and stored with the order.
- **FR-077**: The system MUST process refunds for cancelled and returned orders through the gateway, record each refund against the original payment, and show refund status to the member. For a Cash on Delivery order, a refund MUST only be issued if cash was already collected.
- **FR-078**: Gift points MUST be redeemable at checkout up to the configured limit and never beyond the member's balance; points MUST be earned on delivery and refunded on cancellation or return; every change MUST create an auditable ledger entry, and the balance MUST never be negative.
- **FR-079**: Coupons MUST be validated for existence, validity dates, minimum order value and usage limits at checkout, with clear messages when rejected, and the discount MUST be shown before payment.
- **FR-080**: Payment, order, refund and shipment events MUST be logged without secrets, and unexpected gateway responses MUST be handled safely, never leaving an order confirmed without a successful payment.

**My Wishlist and My Writers** *(added 2026-11-17, Phase 7.5)*

- **FR-081**: The system MUST keep a wishlist for each signed-in member, stored on the server and kept across sessions and devices. Guests MUST NOT have a wishlist; every wishlist operation MUST be denied to guests on the server.
- **FR-082**: A member MUST be able to add a book to their wishlist from a book card and from the book details page. An unknown book or a book that is already inactive MUST be rejected with a clear message and nothing stored. An active book that is out of stock MUST be accepted. Adding the same book again MUST NOT create a second entry. The number of books in a wishlist MUST be limited to a configurable maximum, with a clear message when it is reached.
- **FR-083**: A member MUST be able to view their wishlist, newest first, showing for each book the cover, title, authors, format, current price, availability and, when unavailable, the reason (out of stock or no longer available). The screen MUST have loading, error (with retry) and empty states and MUST NOT show fabricated data.
- **FR-084**: A book that was wishlisted and later became inactive MUST remain on the wishlist so the member can remove it, and MUST expose only its identifier, title, cover image and an unavailable reason. No other information about the inactive book (description, price, publisher, authors, categories, stock) MUST be returned.
- **FR-085**: A member MUST be able to remove a book from their own wishlist. Removing a book that is not on the list MUST NOT cause an error.
- **FR-086**: A member MUST be able to add one wishlist book, or all available wishlist books, to the cart. The normal cart rules MUST apply (current price, stock limits). Unavailable books MUST NOT be added and MUST be reported with the reason, without failing the rest. The books MUST stay on the wishlist after being added.
- **FR-087**: A signed-in member MUST be able to follow and unfollow any existing writer (author). Repeating either action MUST NOT create a duplicate or an error. An unknown writer MUST be rejected with a clear message. Members MUST NOT be able to create, edit or delete writers.
- **FR-088**: A member MUST be able to view the writers they follow, newest first, with the number of books currently available. A followed writer who has no active books MUST remain listed with a clear "no books available right now" message. The screen MUST have loading, error (with retry) and empty states.
- **FR-089**: Any visitor MUST be able to open a writer page showing the writer's name and that writer's active books, using the same server-side data as the catalogue filtered by that writer. A signed-in member MUST also see whether they follow the writer. A writer with no active books MUST show a clear message, and an unknown writer MUST show a not-found message. The existing author links on book cards and details MUST keep opening the filtered catalogue.
- **FR-090**: A member MUST only be able to read or change their own wishlist and their own followed writers. Guests MUST be denied. These checks MUST be enforced on the server for every operation, not only in the interface, and errors MUST be generic and MUST NOT reveal another member's data.
- **FR-091**: The header entries My Wishlist and My Writers MUST open the working pages. A guest who selects them MUST be asked to sign in. Wishlist and writer events MUST be logged without secrets or personal data. This replaces the placeholder behaviour in FR-016 for these two entries.

### Key Entities

- **Member**: A registered customer with name, email, mobile number, protected password, status and role. Related to a session, addresses, orders, payments and gift points.
- **Role / Entitlement**: Defines whether a user is Guest, Member or Admin and which operations they may perform.
- **Session**: A period of authenticated access for a member, with an expiry and the ability to be ended by sign-out.
- **Book**: A catalogue item with title, short and full description, cover image, price, format, language, publication date, date added to the catalogue, active/availability status and popularity indicators.
- **Genre (Category)**: One of the 20 named groupings. A book can belong to many genres and a genre to many books.
- **Author**: A writer who can be associated with one or more books; a book has at least one author.
- **Publisher**: The brand that publishes a book; a publisher has many books.
- **Cart**: A collection of cart items belonging to a member or guest, with quantity per book and calculated totals. A guest cart merges into the member cart on sign-in.
- **Address**: A delivery address belonging to a member, with recipient, contact number, address lines, city, state and postal code.
- **Order**: A member's purchase with a status (Pending Payment, Confirmed, Dispatched, Delivered, Cancelled, Return Requested, Returned), order lines, delivery address, totals, discounts, shipping charge, placed and confirmed timestamps, and links to its payment and shipment.
- **Order Line**: A book, quantity and the unit price at the time of purchase.
- **Payment**: A payment attempt for an order with method (Card, UPI, Net Banking, Cash on Delivery), amount, status (Initiated, Authorized, Pay on Delivery - Pending, Paid, Failed, Refunded, Partially Refunded), gateway reference and unique idempotency key. It never holds full card details.
- **Refund**: A record of money or points returned for a cancelled or returned order, linked to its payment.
- **Shipment**: Delivery of an order with status (Preparing, Dispatched, In Transit, Delivered), shipping charge, estimated delivery date, confirmed delivery date and tracking reference.
- **Return Shipment**: Pickup and receipt of books being returned for an order, with its own status.
- **Gift Point Ledger Entry**: An auditable record of points earned, redeemed or refunded for a member, with the balance after each entry.
- **Coupon**: A discount code with value or percentage, validity dates, minimum order value and usage limits.
- **Delivery Rule / Shipping Rate Rule**: Configurable rules that determine shipping charge and estimated delivery time.
- **Order history**: A member's previous orders (completed, cancelled and returned), used for the My Orders view, Buy Again and recommendations.
- **Wishlist Item**: A book a member saved for later, with the time it was added. A member has at most one entry per book. It belongs to exactly one member and is never visible to others.
- **Followed Writer**: A link between a member and an existing Author, with the time it was followed. A member has at most one link per writer. It belongs to exactly one member and is never visible to others.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new visitor can reach a populated home page as a guest in 2 actions or fewer from the login screen.
- **SC-002**: A new customer can register and be signed in in under 2 minutes.
- **SC-003**: Selecting a genre updates the displayed books within 2 seconds for 95% of selections, without a full page reload.
- **SC-004**: Search, filter and sort changes show updated results within 2 seconds for 95% of interactions on a catalogue of at least 200 books.
- **SC-005**: 100% of the 20 specified genres appear with exact names and each contains at least one book.
- **SC-006**: In testing, 100% of results returned for any combination of genre, author, publisher, language, format, price range and search term satisfy every selected criterion.
- **SC-007**: 100% of attempts by guests to reach member-only information are denied, and 0 members can read another member's information.
- **SC-008**: 0 stored passwords are readable, and 0 secrets appear in logs.
- **SC-009**: 100% of book cards in the seeded catalogue display a cover image (real or the standard fallback) with no broken images.
- **SC-010**: 90% of first-time test users can find a specific book by search or genre and open its details page on their first attempt.
- **SC-011**: The home page and login screen remain usable (no clipped or overlapping content) at common phone, tablet and desktop widths, and can be operated entirely by keyboard.
- **SC-012**: Running seeding twice produces the same catalogue record counts as running it once.
- **SC-013**: A signed-in member can go from a book details page to a confirmed order in under 3 minutes and no more than 5 steps (cart, address, delivery, payment, confirmation).
- **SC-014**: 100% of orders are confirmed only after successful payment authorization, and 0 failed payments produce a confirmation.
- **SC-015**: Submitting or retrying the same payment multiple times results in exactly one charge and one order in 100% of tests.
- **SC-015a**: 100% of Cash on Delivery orders are Confirmed with payment shown as Pay on Delivery - Pending, and become Paid only when the shipment is recorded as Delivered.
- **SC-016**: 100% of cancellation requests inside the 48-hour window (and before dispatch) succeed with a refund, and 100% outside the window are declined with a clear reason.
- **SC-017**: Cart totals, shipping charges, discounts and order totals shown at checkout equal the amounts recorded on the order in 100% of tests.
- **SC-018**: 100% of delivery dates before order confirmation are labelled as estimated, and confirmed dates appear only after the order is confirmed.
- **SC-019**: Gift point balances equal the sum of their recorded earn, redeem and refund entries in 100% of tests, and never fall below zero.
- **SC-020**: 0 members can view another member's orders, addresses, payments or gift points.
- **SC-021**: 0 card numbers, card security codes or other full payment credentials are stored or logged by the system.
- **SC-022**: 100% of guest attempts to read or change a wishlist or followed writers are denied, and 0 members can read or change another member's wishlist or followed writers.
- **SC-023**: 100% of wishlist entries and followed writers are still present after the member signs out and in again, and adding or following the same item twice leaves exactly one entry.
- **SC-024**: 100% of unavailable wishlist books (out of stock or inactive) are labelled with a reason and refused by the cart, and 0 responses for an inactive wishlisted book contain more than its identifier, title, cover and reason.
- **SC-025**: 100% of writer pages and My Writers entries list only active books, and the book counts shown equal the number of books the catalogue returns for that writer, including writers with none.

## Assumptions

- The repository currently contains no application code, specs or existing database. The user description refers to existing work (backend catalogue, seed data, earlier plan and tasks); none was found in the workspace. This feature is therefore specified as a complete first feature, and any existing work provided later MUST be reused rather than duplicated.
- The established technology approach described by the user (React with Vite, Node.js with Express, PostgreSQL, OpenAPI, modular monolith with routes, controllers, services and repositories) is recorded here for the planning phase; it is not part of the feature requirements.
- Roles are Guest, Member and Admin. Admin capabilities (store, catalogue and policy management) are out of scope; the Admin role exists only so that customer and admin access stay separate.
- Sign-in uses email or mobile number with a password; no social sign-in or multi-factor authentication in this feature.
- The Forgot password entry point is shown and leads to a "coming soon" notice; the actual password reset flow is deferred to a later feature.
- Mobile numbers follow Indian formats by default, matching the rupee prices in the reference screens; prices are shown in Indian rupees.
- Popularity and bestseller status are derived from stored popularity data (for example sales or view counts held with each book) and are refreshed monthly for the "this month" label.
- "New Launches" uses publication date, falling back to the date added to the catalogue.
- Scope was extended after the first draft to include the Cart, Order, Payment and Shipping modules (delivery, order, payment and shipping specifics). Store management and catalogue administration, My Wishlist and My Writers remain out of scope; their header entries are placeholders. *(Superseded 2026-11-17: My Wishlist and My Writers are in scope from Phase 7.5. Store management and catalogue administration remain out of scope.)*
- Guests may add books to a cart, but must sign in or register before checkout. A guest's cart is merged into the member's cart on sign-in.
- The payment gateway is a sandbox or simulated gateway behind a replaceable interface (per the constitution). No real money moves. Card, UPI and Net Banking are offered as online methods, plus Cash on Delivery, in addition to redeeming gift points and coupons.
- The shipping carrier is simulated: shipment status progresses through defined stages without a real carrier integration. Shipping rates are based on delivery location, order value and item type, using configurable rules. A free-shipping threshold is configurable.
- eBooks need no shipping address or shipment; they are treated as delivered once payment is confirmed. The reading or download experience for eBooks is out of scope.
- Cancellation is allowed within 48 hours of order confirmation and before the order is dispatched, whichever comes first. The window is configurable. Returns are allowed for delivered physical books within 7 days of delivery (configurable) and require the return shipment to be received before the refund completes.
- Refunds go back to the original payment method (or gift points where they were used) through the payment module. A Cash on Delivery order that was not yet paid needs no money refund when cancelled.
- Gift points: a member earns points when an order is delivered, at a configurable rate, and may redeem them at checkout up to a configurable share of the order total. One point has a configurable rupee value.
- Coupons are seeded sample codes; coupon creation and management by administrators is out of scope.
- A single currency (Indian rupees) and a single store are assumed. Delivery is India only, with 6-digit PIN code validation and simple zone-based delivery time and shipping charge (configurable); unserviceable PIN codes are rejected. International delivery is out of scope.
- Order history may be empty for new members; personalised recommendations are verified using seeded sample orders and real orders placed through this feature.
- The supplied dark-themed reference screens (home page and login modal with illustration) define the visual direction.
- Phase 7.5 (2026-11-17): the wishlist and followed writers belong to the Member domain and use existing book and author data. They add no Admin features and do not change any of the six items that are pending Admin approval. Whether a book counts as "out of stock" uses the same provisional stock rule as the cart (inventory rules remain pending Admin approval).
- A wishlist has a configurable maximum size (default 200). There is no sharing, no price alerts, no notifications for followed writers and no recommendations based on wishlists or follows in this feature.
- Members start with an empty wishlist and no followed writers; no sample data is seeded for them.
- Security, data privacy and accessibility follow the project constitution (`.specify/memory/constitution.md`).
