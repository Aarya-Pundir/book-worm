# Tasks: Book Worm - Member, Catalogue, Cart, Order, Payment, Shipping

**Input**: Design documents from `/specs/001-member-auth-catalogue/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, `documents/architecture-diagram.png` (authoritative)

**Format**: `- [ ] T### [P?] [US?] Description with file path`. `[P]` means parallelizable. `[US#]` maps to spec.md user stories.

**Rules that apply to every task**
- The architecture diagram is authoritative. No redesign without Admin approval (G3).
- Six decisions stay **PENDING ADMIN APPROVAL** (Brand vs Publisher, categories per book, Admin roles, Store responsibilities, Inventory rules, Payment provider/lifecycle). Any placeholder is provisional, labelled with a `PENDING ADMIN APPROVAL` comment, isolated and reversible.
- Payment is a temporary mock behind a swappable interface. Payment requirements (FR-072..FR-080, SC-014, SC-015, SC-015a, SC-021) stay **PARTIAL** until a provider is approved.
- Never commit credentials. Use git-ignored `.env` files and committed `.env.example` templates only.
- Bind services to 127.0.0.1. JavaScript only (no TypeScript).

**Gates**: G1 = Phase 1 tested and verified before Phases 2-4 start. G2 = Admin informed of placeholders before the Phase 2 migration is applied. G3 = diagram changes need Admin approval.

**Current status**: Phases 1-8 (including 7.5) are COMPLETE (payment still PARTIAL, mock only). Phase 9 is PARTLY DONE: T075 and T076 are complete; T077 (GitHub pull request and demo video) waits for the owner.

---

## Phase 1: Setup and Environment Verification (CURRENT)

**Purpose**: Runnable backend and frontend skeletons, aligned to the diagram. No database schema, no seed data, no auth, no catalogue.

- [x] T001 Confirm `documents/architecture-diagram.png` module list matches plan.md section 0 and record the result in `specs/001-member-auth-catalogue/plan.md` (already inspected 2026-11-16; re-check if the diagram changes)
- [x] T002 Create `backend/package.json` (ES modules, scripts: dev, start, test, lint) and install latest stable runtime dependencies: express, helmet, cors, pino, zod, dotenv; dev: vitest, supertest
- [x] T003 [P] Create `frontend/` with Vite + React and Tailwind CSS via `npm create vite` (JavaScript template) and add scripts dev, build, test, lint in `frontend/package.json`
- [x] T004 [P] Create `backend/.env.example` with placeholder values only (PORT, HOST=127.0.0.1, DATABASE_URL with placeholder user/password, SESSION_SECRET placeholder) and confirm `backend/.env` is git-ignored
- [x] T005 [P] Create `frontend/.env.example` with placeholder values only (VITE_API_BASE_URL) and confirm `frontend/.env` is git-ignored
- [x] T006 Create backend module folders mirroring the diagram, each with a `README.md` stub noting its diagram responsibilities and any PENDING ADMIN APPROVAL items: `backend/src/modules/member/`, `store/`, `catalog/`, `order/`, `payment/`, `shipping/`
- [x] T007 Create `backend/src/config/env.js` that loads and validates environment variables with zod and never logs secret values
- [x] T008 [P] Create `backend/src/lib/logger.js` (pino JSON logs, redact password, token, authorization and card fields)
- [x] T009 [P] Create `backend/src/middleware/errorHandler.js` and `backend/src/lib/errors.js` returning a consistent generic error shape without stack traces
- [x] T010 Create `backend/src/app.js` (helmet, JSON body limit, CORS limited to the frontend origin, error handler) and `backend/src/server.js` binding to `127.0.0.1`
- [x] T011 Add `GET /api/health` in `backend/src/modules/system/health.routes.js` returning status and timestamp only, and mount it in `backend/src/app.js`
- [x] T012 [P] Write API test for `/api/health` and for the generic error shape in `backend/tests/api/health.test.js`
- [x] T013 Configure the Vite dev server to bind to `127.0.0.1` and proxy `/api` to the backend in `frontend/vite.config.js`
- [x] T014 Build a minimal shell page in `frontend/src/App.jsx` showing the app name and backend health status fetched through `frontend/src/services/apiClient.js` (no catalogue data)
- [x] T015 [P] Write a component test for the health status display in `frontend/tests/App.test.jsx` using React Testing Library
- [x] T016 Add the `pg` driver and a connectivity check script `backend/scripts/check-db.js` (`npm run db:check`) reading `DATABASE_URL` from the environment (no tables, no migrations). **BLOCKED until the user provides the database URL in `backend/.env`**
- [x] T017 Run `npm test` in `backend/` and `frontend/`, run lint, start both servers, and confirm the page shows a healthy backend (record results in this file under Phase 1 Report)
- [x] T018 Run `npm audit` in both apps and record any high/critical findings; do not ignore them
- [x] T019 Confirm with `git status` that no `.env` file or secret is staged, and record the commit-ready file list under Phase 1 Report

**Checkpoint (Gate G1)**: Phase 1 is verified only when T017-T019 pass and T016 is either passing or explicitly reported BLOCKED.

### Phase 1 Report (2026-11-16)

- **Completed**: T001-T015, T017-T019. T016 is PARTIAL: the connectivity script `backend/scripts/check-db.js` (uses the `pg` driver) exists and runs; the check itself is BLOCKED until `backend/.env` has a real database URL.
- **Stack correction (2026-11-16)**: the project does not use Prisma. Prisma packages and `backend/prisma.config.js` were removed. Database access uses the `pg` driver with plain, parameterized SQL and SQL migration files.
- **Verification**: backend 3/3 tests pass, frontend 2/2 tests pass, both lint clean, frontend builds. Both servers started; `/api/health` returned OK directly (127.0.0.1:4000) and through the Vite proxy (127.0.0.1:5173). Both listen on 127.0.0.1 only. `npm audit`: 0 vulnerabilities in both apps. `git add -n` shows no `.env`, `node_modules` or `dist` files; `backend/.env` did not exist at that time.
- **Files changed**: `backend/` (app, server, config, lib, middleware, health route, six module README stubs, tests, eslint, db check script, `.env.example`), `frontend/` (Vite + React + Tailwind shell, API client, test, `.env.example`), `.gitignore` (allows `.env.example`), plan.md, data-model.md, research.md, tasks.md.
- **Issues / blockers**: None. T016 completed successfully.
  PostgreSQL connectivity verified using `npm run db:check`.
  Output: `Database connection OK`.
- **Gate G1**: Phase 1 verification requirements T017Ã¢â‚¬â€œT019
  passed, and T016 is now verified. Gate G1 PASSED.
  Phases 2Ã¢â‚¬â€œ4 are ready to begin, subject to Gate G2.

---

## Phase 2: Database, Migrations and Seed Data (COMPLETE - 2026-11-16)

**Purpose**: Core schema (data-model.md "Core") and idempotent seed.

- [x] T020 Inform the Admin of the provisional placeholders (data-model.md) and record acknowledgement (Gate G2) in `specs/001-member-auth-catalogue/plan.md`
- [x] T021 Create `backend/db/migrations/001_core.sql` (plain SQL, `pg`) with Core tables: Member, Store, Category, Author, Publisher (naming layer for Brand/Publisher), Book, BookCategory, BookAuthor, Order/OrderLine (read side), AppConfig. Constraints verbatim from data-model.md: email unique lowercase, mobile unique normalized, price >= 0, format in (Paperback, Hardcover, eBook). Mark pending items with `PENDING ADMIN APPROVAL` SQL comments
- [x] T022 Add a small migration runner `backend/db/migrate.js` that applies numbered SQL files in order and records them in a migrations table (pending-admin items isolated in their own reversible migration, with a matching down script), and apply them to the local database
- [x] T023 Create `backend/db/seed.js` using `INSERT ... ON CONFLICT` upserts: the 20 exact genres in order (FR-021), authors, publishers/brands, 200+ books across genres with some in multiple genres, languages, formats, dates, popularity, local or open-license cover images and a fallback cover
- [x] T024 [P] Seed sample members (no real credentials; passwords generated by the seed and printed only to the local console, never stored in files) and sample orders for recommendation testing
- [x] T025 [P] Seed one Store row and AppConfig defaults (marked provisional)
- [x] T026 Write seed tests in `backend/tests/unit/seed.test.js`: exactly 20 categories, no duplicates, every category has a book, running the seed twice leaves counts unchanged (SC-005, SC-012)

**Checkpoint**: migrations applied, seed idempotent, tests green. Phases 3-4 NOT started.

### Phase 2 Report (2026-11-16)

- **Completed**: T020-T026.
- **Schema**: `001_core.sql` (members, categories, authors, publishers, books, book_categories, book_authors, orders, order_lines, app_config) and `002_pending_admin_placeholders.sql` (members.role, books.stock_quantity, stores, `brands` view), each with a `.down.sql`. Runner: `npm run db:migrate` / `db:rollback`. Applied to `bookworm_store_dev`.
- **Seed**: `npm run db:seed` gives 19 stored genres (FR-021 order; `All` is UI-only, so 19 + All = 20 options), 228 books (2 inactive, some in 2 genres), 7 members (6 members + 1 placeholder admin), 12 sample orders, 1 store, 11 config defaults. A second run changed nothing (SC-012). Covers: `npm run db:covers` writes 229 generated SVGs to `frontend/public/covers/` (a fallback is included).
- **Credentials**: sample passwords are random, printed once to the console and stored nowhere except as bcrypt hashes. Re-seeding never resets them. If you missed them, delete the sample members and re-run the seed, or reset the passwords in Phase 3.
- **Verification**: backend lint clean; 9/9 tests pass (6 new run in a throw-away schema, which includes rollback and re-apply of migration 002).
- **Still PENDING ADMIN APPROVAL** (provisional placeholders only, isolated in migration 002 or marked in code): Brand vs Publisher, single vs multiple categories, admin roles, store responsibilities, inventory rules. Payment provider and lifecycle: no payment tables yet, and payment requirements stay PARTIAL.
- **Issues / blockers**: none. `bcrypt` install scripts are skipped by npm policy, but hash/compare was verified at runtime.


---

## Phase 3: Member Authentication (COMPLETE - 2026-11-16) - US3, US7

**Goal**: Register, sign in by email or mobile, sign out, guest access, roles, protected routes.
**Independent test**: Quickstart scenarios 3, 4, 10.

- [x] T027 [P] [US3] Zod schemas for register/login in `backend/src/modules/member/member.schemas.js` (email format, mobile normalization, password strength, confirmation match)
- [x] T028 [P] [US3] Member repository in `backend/src/modules/member/member.repository.js` (parameterized SQL queries via `pg`)
- [x] T029 [US3] Member service in `backend/src/modules/member/member.service.js` (bcrypt hashing, duplicate checks, generic invalid-credentials error)
- [x] T030 [US3] Auth middleware (JWT in httpOnly, sameSite cookie) and role authorization in `backend/src/middleware/auth.js` and `backend/src/middleware/authorize.js`
- [x] T031 [US3] Rate limiting on login/register in `backend/src/middleware/rateLimit.js` (FR-007)
- [x] T032 [US3] Routes and controller: `POST /api/members/register`, `/login`, `/logout`, `GET /api/members/me` in `backend/src/modules/member/`
- [x] T033 [P] [US3] API tests (register, duplicate, login by email and mobile, wrong password, logout, `/me` unauthorized) in `backend/tests/api/member.test.js`
- [x] T034 [US3] Frontend auth context and API calls in `frontend/src/context/AuthContext.jsx`
- [x] T035 [P] [US3] LoginModal (identifier, password, visibility toggle, Forgot password entry that shows "coming soon", Sign Up link, Continue as Guest) in `frontend/src/components/LoginModal.jsx`
- [x] T036 [P] [US3] RegistrationForm with field validation in `frontend/src/components/RegistrationForm.jsx`
- [x] T037 [US7] ProtectedRoute and role-aware header login/profile control in `frontend/src/components/ProtectedRoute.jsx` and `frontend/src/components/Header.jsx`
- [x] T038 [P] [US3] Frontend tests for LoginModal and RegistrationForm in `frontend/tests/auth.test.jsx`
- [x] T039 [US7] Admin-only route guard test (member denied) in `backend/tests/api/authorization.test.js`

**Checkpoint**: Register, sign in (email or mobile), sign out, `/me`, roles and guards work through the UI proxy. Phase 4 NOT started.

### Phase 3 Report (2026-11-16)

- **Completed**: T027-T039.
- **Backend** (`backend/src/`): `modules/member/{member.schemas,member.repository,member.service,member.routes}.js`, `middleware/{auth,authorize,rateLimit}.js`, `lib/{db,session}.js`. Endpoints: `POST /api/members/register`, `/login`, `/logout`, `GET /api/members/me` (per `contracts/openapi.yaml`). The error shape gained an optional `fields` map for field-level messages.
- **Security**: bcrypt cost 12; password rules 8-72 chars with upper, lower and digit; JWT (HS256, 8 h) in an httpOnly, SameSite=Lax cookie (`Secure` in production); one generic `INVALID_CREDENTIALS` response for unknown account, wrong password and disabled account, with a dummy hash compare to even out timing; failed-login limiter (10 per 15 min per IP, FR-007) and a register limiter; parameterized SQL only; unique constraints are the final duplicate guard. `SESSION_SECRET` must be at least 32 characters and the server refuses to start otherwise. The password hash is never returned.
- **Frontend** (`frontend/src/`): `context/AuthContext.jsx`, `components/{Header,LoginModal,RegistrationForm,Modal,ProtectedRoute}.jsx`, `react-router-dom` routing, API client with cookie-based sessions. My Wishlist and My Writers show "coming soon" and no data. The cart control is a visible placeholder (cart is Phase 5). `/orders` is protected and shows a "coming soon" placeholder. Forgot password shows "coming soon".
- **Verification**: backend lint clean, 20/20 tests (new: 8 member API, 3 authorization; run in throw-away schemas); frontend lint clean, 13/13 tests (11 new), build OK; `npm audit` 0 vulnerabilities in both apps. Live smoke test through the Vite proxy: health, guest `/me` 401, register, login by mobile, `/me`, logout, `/me` 401; both servers listen on 127.0.0.1 only. The smoke-test member and scripts were removed afterwards (members back to 7).
- **Added dependencies**: backend `jsonwebtoken`, `cookie-parser`, `express-rate-limit`; frontend `react-router-dom`, `@testing-library/user-event` (dev).
- **Still PENDING ADMIN APPROVAL**: admin roles and permissions (MEMBER and ADMIN are provisional; no admin endpoint exists yet, the guard is tested with a test-only route). The other five items are unchanged.
- **Known limits (by design for now)**: no CSRF token (SameSite=Lax cookie plus JSON-only bodies); the limiter is in-memory per process; password reset is not implemented.
- **Issues / blockers**: your `backend/.env` `SESSION_SECRET` is only 13 characters, so `npm run dev` / `npm start` will now refuse to start until you replace it with a 32+ character random value (command in `backend/.env.example`). I did not read or print it.


---

## Phase 4: Home Page and Catalogue (COMPLETE - 2026-11-16) - US1, US2, US4, US5, US6

**Goal**: Home page, 20 genres, search, filters, sort, pagination, details, related books.
**Independent test**: Quickstart scenarios 5-9.

- [x] T040 [P] [US1] Catalog repository with combined server-side filtering, sorting and pagination in `backend/src/modules/catalog/catalog.repository.js`
- [x] T041 [US1] Catalog service and query validation (min > max price rejected) in `backend/src/modules/catalog/catalog.service.js`
- [x] T042 [US1] Routes: `GET /api/categories`, `/api/books`, `/api/books/:id`, `/api/authors`, `/api/publishers` in `backend/src/modules/catalog/`
- [x] T043 [P] [US4] `GET /api/books/featured` (bestsellers, new launches) and `GET /api/books/recommended` (own order history only, popular fallback, `personalised` flag) in `backend/src/modules/catalog/`
- [x] T044 [P] [US5] Related books and estimated delivery (labelled estimated) in the book details response in `backend/src/modules/catalog/catalog.service.js`
- [x] T045 [P] API tests for filtering combinations, sorting, pagination, empty results, not-found, recommendation privacy in `backend/tests/api/catalog.test.js`
- [x] T046 [P] [US1] Sidebar (categories from the API, All selected by default) in `frontend/src/components/Sidebar.jsx`
- [x] T047 [P] [US2] SearchBar, CatalogueFilters, SortDropdown in `frontend/src/components/`
- [x] T048 [P] [US5] BookCard and BookGrid with cover fallback in `frontend/src/components/`
- [x] T049 [US4] HomePage with Recommended for You, Bestsellers This Month, New Launches in `frontend/src/pages/HomePage.jsx`
- [x] T050 [US1] Reusable CataloguePage driven by the selected category in `frontend/src/pages/CataloguePage.jsx`
- [x] T051 [US5] BookDetailsPage with not-found state in `frontend/src/pages/BookDetailsPage.jsx`
- [x] T052 [US6] Author and publisher browsing links and filters in `frontend/src/components/CatalogueFilters.jsx`
- [x] T053 [US7] Header placeholders for My Wishlist and My Writers showing "coming soon" (no fake data) in `frontend/src/components/Header.jsx`
- [x] T054 [P] Frontend tests for Sidebar, filters, BookCard in `frontend/tests/catalogue.test.jsx`
- [x] T055 Run quickstart scenarios 5-9 and record results in this file

**Checkpoint**: Home page, 20-option genre sidebar, search, filters, sort, pagination, details and related books work end to end.

### Phase 4 Report (2026-11-16)

- **Completed**: T040-T055.
- **Backend** (`backend/src/modules/catalog/`): repository, service, routes. Endpoints: `GET /api/categories`, `/authors`, `/publishers`, `/languages` (new, so the language filter comes from stored data), `/books`, `/books/featured`, `/books/recommended`, `/books/:id`. Search (title or author, partial, case-insensitive, `%` and `_` matched literally), genre, author, publisher, language, format, price range, sort (relevance, price asc/desc, newest, popularity) and paging all run in one parameterized SQL query with a total count (FR-031, FR-032). Invalid input returns 400 with field messages, including min price above max price (FR-034). Inactive books never appear, and an inactive or unknown id is 404. Delivery dates are labelled as estimates and eBooks have none (FR-040). `optionalAuth` middleware added; `estimated_delivery_days` config default added to the seed.
- **Recommendations** (FR-018, FR-019): when signed in, only that member's own non-cancelled orders are read (genres they bought from, excluding books already bought); otherwise popular books with `personalised: false`, and the UI says "Popular books right now" in that case. The response contains no order or member data.
- **Frontend**: `Layout` (sidebar and search bar), `Sidebar` (All plus the API's genres, All highlighted by default), `SearchBar`, `CatalogueFilters`, `SortDropdown`, `Pagination`, `BookCard`, `BookGrid` (cover fallback), `HomePage` (three sections), one reusable `CataloguePage` for every genre (state in the URL, so filters survive paging and links are shareable), `BookDetailsPage` (not-found state, related books). Author, publisher and genre links on cards and details open the filtered catalogue. My Wishlist and My Writers show "coming soon" with no data (done in Phase 3, covered again in the quickstart check).
- **Verification**: backend lint clean, 39/39 tests (19 new catalogue API tests in a seeded throw-away schema); frontend lint clean, 29/29 tests (16 new), build OK; `npm audit` 0 vulnerabilities in both apps.
- **Quickstart scenarios 5-9 (live, through the Vite proxy on 127.0.0.1)**:
  - 5: home page served (HTTP 200); 6 bestsellers and 6 new launches from real data; All shows 226 active books; sidebar is 19 API genres plus All = 20.
  - 6: every genre returns only its own books, its count matches the sidebar, none is empty.
  - 7: genre + language + format + price range + search + sort + page together returned 3 results, all meeting every criterion; min above max returned HTTP 400.
  - 8: details returned with 6 related books and an estimated date; unknown id returned HTTP 404; cover and fallback images served (HTTP 200).
  - 9: guest gets popular books with `personalised=false`; member with seeded orders gets `personalised=true`. A member with no orders is covered by the automated test.
  - The browser itself was not driven (no browser automation here); UI behaviour is covered by the component tests above, so a quick visual check of the page by you is still worthwhile.
- **Still PENDING ADMIN APPROVAL**: Brand vs Publisher (the UI says "Publisher" and the API field is `publisher`; one place to rename), single vs multiple categories (books show all their genres and appear under each), inventory rules ("In stock" is just `stock_quantity > 0`, defined in one expression), plus the other three unchanged. Payment stays PARTIAL.
- **Known limits**: Relevance sorting is simple (title starts with, then contains, then author match, then popularity). Search uses `ILIKE`, which is fine at this size and would need an index for a much larger catalogue. (The header Cart control became real in Phase 5.)
- **Issues / blockers**: none.


---

## Phase 5: Cart (COMPLETE) - US8

- [x] T056 [US8] Cart schema addition (isolated migration), service, routes in `backend/src/modules/order/` (add, update quantity, remove, summary, guest merge on login, server-side price check)
- [x] T057 [P] [US8] Cart API tests in `backend/tests/api/cart.test.js`
- [x] T058 [US8] Cart page, header count, add-to-cart on cards and details in `frontend/src/pages/CartPage.jsx`

- [x] T078 [US8] Fix cart service validation so inactive books cannot be added or have their quantities updated. Return 404 for inactive or unknown books. Revalidate book availability when retrieving existing cart items.

- [x] T079 [P] [US8] Add regression API tests covering inactive books on add, quantity update and existing-cart retrieval. Verify active in-stock books still work, and out-of-stock books return 409.


**Checkpoint**: Guests and members can add books, change quantities, remove items and see a server-calculated total. A guest cart survives sign-in. Phase 6 NOT started.

### Phase 5 Report (2026-11-16)

- **Completed**: T056-T058, plus corrective tasks T078-T079.
- **Database**: `003_cart` (own migration with its own rollback, applied to the dev database). `carts` has exactly one owner, a member or a guest (CHECK constraint). `cart_items` holds book, quantity and `price_at_add`, which is used only to detect price changes. The seed test now rolls back and re-applies both 003 and 002.
- **Backend** (`backend/src/modules/order/`: `cart.repository`, `cart.service`, `cart.routes`, `cart.token`): `GET /api/cart`, `POST /api/cart/items`, `PATCH` and `DELETE /api/cart/items/:bookId`. Added `withTransaction` to `lib/db.js`.
  - Guests are identified by a random `cart_token` httpOnly cookie (7 days, SameSite=Lax). Only its SHA-256 hash is stored. It is created on the first add, never on a plain view. A malformed or forged token is ignored.
  - The client sends only a book id and a quantity (1 to 99). Price, stock and availability always come from the `books` table, and any price the client sends is ignored (FR-049).
  - Asking for more than is in stock limits the quantity and returns a message. Out-of-stock gives 409, and inactive or unknown books give 404 (FR-050).
  - Viewing the cart recomputes everything. It reports a changed price (old and new), reduced quantities and unavailable books. The delivery date is labelled as an estimate, and eBook-only carts have none (FR-054).
  - Sign-in merges the guest cart into the member cart in one transaction: the same book is added together and limited to stock, unavailable books are dropped, the guest cart and cookie are removed (FR-051). A merge failure is logged and never blocks sign-in. Registration does not sign the user in, so the merge happens on the sign-in that follows.
- **Frontend**: `CartContext` (cart reloads after sign-in and sign-out so the merge shows), `CartPage` (items, quantity on blur or Enter, remove, total, price and availability notices, estimate label, loading, error with retry and empty states), `AddToCart` on book cards and the details page (hidden for out-of-stock books, shows the server's message), header `Cart (n)` is now a real link with a live count. Checkout is a disabled "coming soon" button for members, and a "Sign in to check out" button for guests (checkout itself is Phase 6).
- **Verification**: backend lint clean, 60/60 tests (21 cart API tests including 6 inactive-book regression tests, plus the updated seed test); frontend lint clean, 39/39 tests (10 new), build OK; `npm audit` 0 vulnerabilities in both apps. Re-run after T078/T079 with the same results.
- **Live smoke test (through the Vite proxy on 127.0.0.1)**: empty cart; guest add (cookie set); update; add and remove a second book; quantity 0 returned 400; register and sign in, after which the cart cookie is cleared and the guest items are in the member cart. Both servers were stopped afterwards.
- **Still PENDING ADMIN APPROVAL**: unchanged (Brand vs Publisher, categories, admin roles, store responsibilities, inventory rules, payment). The cart reads availability from one function, `availableCopies` in `cart.service.js`, so an inventory decision changes one place. No new pending item. Payment stays PARTIAL.
- **Known limits**: stock is not reserved by the cart, so it is checked again at checkout (Phase 6). Guest carts are not cleaned up after 7 days yet. The browser was not driven, so a quick visual check of the cart page is worthwhile.
- **Corrective fix (T078, T079)**: a defect in inactive-book handling was found during manual browser testing. Checked case by case:
  - Add an inactive or unknown book: already returned 404 and created no line. Now locked in by a regression test.
  - Update the quantity of a book that has since become inactive: **was wrong** (409 `OUT_OF_STOCK`). `updateItem` in `cart.service.js` now returns 404 `NOT_FOUND` for an inactive or missing book, leaves the stored quantity unchanged, and still returns 409 for an active book whose stock dropped to 0.
  - Retrieve a cart holding a book that became inactive: already revalidated on every view (unavailable, quantity 0, excluded from the total and count, flagged with a warning). Now covered for both a guest and a member.
  - Also covered: removing an inactive book still works, an inactive book is dropped when a guest cart merges on sign-in, and active in-stock books and out-of-stock books (409) behave as before.
  - Stock validation, price recomputation and guest-to-member merge are unchanged (their existing tests pass).
- **Issues / blockers**: none open. The browser was not driven again, so please repeat the manual check that found the defect (deactivate a book that is in your cart, then reload the cart page, change its quantity, and remove it).
- **Status**: Phase 5 verified after T078 and T079. Phase 6 NOT started.


---

### Phase 6 Report (2026-11-17)

- **Completed**: T059-T065.
- **PAYMENT STATUS (T065): PARTIAL, mock only.** FR-072..FR-080, SC-014, SC-015, SC-015a and SC-021 are implemented and tested against a temporary mock gateway behind a swappable interface (`setGateway`). They are **not** fully satisfied. The provider, the real authorization flow and the payment lifecycle (refunds, Paid on delivery) are PENDING ADMIN APPROVAL.
- **Database**: `004_checkout` (own migration and rollback, applied to the dev database). New tables `addresses`, `shipping_zones`, `coupons`, `gift_point_ledger`, `payments`. New `orders` columns for subtotal, shipping, coupon, points, address snapshot, estimated delivery, confirmed time and `stock_held`. Unique indexes: one Pending Payment order per member, one successful payment per order, one idempotency key. The seed adds zones, coupons and welcome points and is idempotent (same counts when run twice).
- **Backend**:
  - `shipping/` (T059): address create, list, edit, delete (member-scoped), 6-digit PIN rule, zone lookup (longest prefix), free-shipping threshold, estimated delivery.
  - `order/` (T060): `pricing.js` (pure), `order.service.js` with `review`, `placeOrder`, `getOrder`, `giftPoints` and the hooks the payment module uses. Routes: `POST /api/checkout/review`, `POST /api/checkout/order`, `GET /api/orders/:orderNumber`, `GET /api/gift-points`.
  - `payment/` (T061, T062): `PaymentGateway` contract with a mock (no card fields in its inputs). `POST /api/payments` needs an `Idempotency-Key`, `GET /api/payments/:orderNumber`.
- **Frontend (T063)**: `CheckoutPage.jsx` (address list and add/edit with field errors, PIN rule, estimated delivery labelled as an estimate, shipping, coupon, gift points, review, Card/UPI/Net Banking/COD, COD terms, loading and error states, double-click guard, a stable key after a network failure and a new key after a decline, confirmation view), `lib/checkout.js`, API client functions with header support, `/checkout` route behind `ProtectedRoute`, and the cart button is now a real link. No card, UPI or bank fields exist in the UI. A test-mode "simulate a declined payment" checkbox appears only in the dev build.
- **Design decisions**:
  - Stock timing (inventory rules PENDING ADMIN APPROVAL): a Pending Payment order holds nothing. When payment starts, one transaction takes stock, the coupon use and the gift points. A failure or an abandoned attempt (older than 2 minutes) gives them back.
  - Payment runs in two transactions with the gateway call between them. The key is stored as `memberId:clientKey`.
  - The payment request accepts only `orderNumber`, `method`, `idempotencyKey`, `acceptCodTerms`, `simulate`. Anything else is refused with 400 and never echoed. `simulate` is ignored in production.
  - Free shipping is judged on the subtotal of physical books.
  - Recommendations now ignore Pending Payment orders.
- **Verification**: backend lint clean, 99/99 tests (17 checkout, 22 payment); frontend lint clean, 52/52 tests (13 new checkout tests), build OK; `npm audit` 0 vulnerabilities in both apps.
- **Live smoke test (Vite proxy, 127.0.0.1)**: register, sign in, address saved, bad PIN rejected (400), review, order placed as Pending Payment, decline gave 402 and the order stayed Pending Payment, two simultaneous payments with one key gave one charge (200 and 409), order Confirmed with a MOCK reference, cart emptied, a card number was refused without being echoed, COD without terms refused (400), COD with terms confirmed as Pay on Delivery - Pending, eBook-only review had no shipping and no COD, a guest got 401. Gift point return and redemption could not be shown live because a newly registered member has 0 points (welcome points are seeded for seeded members only); those paths are covered by the automated tests. Both servers were stopped and ports 4000 and 5173 are free.
- **Docs**: `contracts/openapi.yaml` (new endpoints, parses), `data-model.md`, `quickstart.md` (scenarios 13-20).
- **Still PENDING ADMIN APPROVAL**: Brand vs Publisher, categories, admin roles and permissions, store responsibilities, inventory rules (stock timing above is a placeholder), payment provider and lifecycle. Ownership of gift points and coupons across Order and Payment (T060) is also pending.
- **Known limits**: no cancellation, refund or shipment lifecycle yet (Phase 7). An abandoned reservation is released only on a retry or the stale-payment path, with no scheduled cleanup. Gift points are not earned on delivery yet (Phase 7). COD moves to Paid on delivery in Phase 7. The browser was not driven, so a visual check of the checkout page is worthwhile.
- **Issues / blockers**: none open.
- **Status**: Phase 6 verified.

---

### Phase 7 Report (2026-11-17)

- **Completed**: T066-T071.
- **PAYMENT STATUS: still PARTIAL, mock only.** Refunds go through the temporary mock gateway only. FR-072..FR-080, SC-014, SC-015, SC-015a and SC-021 are **not** fully satisfied. Provider and payment lifecycle stay PENDING ADMIN APPROVAL.
- **Database**: `005_fulfilment` (own rollback, applied to the dev database; seed run twice, same counts). New tables `shipments`, `shipment_events`, `return_shipments`, `refunds`. New `orders` columns `delivered_at`, `cancelled_at`, `cancel_reason`. New order statuses Delivered, Cancelled, Return Requested, Returned; payment status adds CANCELLED. Unique indexes: one refund per order and reason, one gift point EARN per order. Confirmed orders from Phase 6 get a shipment by back-fill. New config keys `return_timer_pickup_minutes` and `return_timer_received_minutes`.
- **Backend**:
  - `order/` (T066, T067, T069): `order.rules.js` (pure cancel, return, refund share and points rules), `order.delivery.js` (shipment created on confirmation, delivery effects), `order.lifecycle.js` (list, details, cancel, return, Buy Again, admin overrides, background sweep). Routes: `GET /api/orders`, `GET /api/orders/:orderNumber`, `POST .../cancel`, `.../return`, `.../buy-again`, and admin `POST /api/admin/orders/:orderNumber/shipment` and `/return`.
  - `shipping/` (T068): shipment rules, repository and service (timers, events, tracking reference, return shipment).
  - `payment/payment.refunds.js`: refund records, the gateway call after the transaction, retry of pending refunds, COD marked Paid on delivery.
  - `server.js`: a 30-second sweep moves orders forward and retries pending refunds.
- **Frontend (T071)**: `OrdersPage.jsx` (My Orders list, order details with items, address, payment and refund status, shipment history, estimate vs confirmed date, cancel with confirmation and optional reason, return, Buy again; loading, error with retry, empty and not-found states), `lib/orders.js`, API client functions, routes `/orders` and `/orders/:orderNumber` behind `ProtectedRoute`. The "coming soon" placeholder is gone.
- **Design decisions**:
  - One shipment per order with physical books, created on confirmation. eBook-only orders are Delivered at confirmation with no shipment.
  - Timers are minutes after the shipment was created (defaults 2, 5 and 10), applied when an order is viewed, cancelled or returned, and by the sweep. Event times are when each step was due.
  - The tracking reference and the confirmed date appear only at dispatch. Before that the date is labelled an estimate (SC-018).
  - Cancel needs a Confirmed order, a shipment still Preparing and the window not passed (default 48 hours). It releases stock, the coupon use and points, cancels the shipment and starts a refund. The gateway is called after the order is safely cancelled; a gateway failure leaves the refund PENDING and the sweep retries it. An unpaid COD order needs no money refund.
  - Return needs a Delivered order with physical books inside the window (default 7 days), once per order. The refund is made when the return shipment is Received: proportional for a mixed order, shipping included only if everything was physical. A share of the points is restored.
  - Gift points are earned once on delivery (default 5 percent of the total minus shipping, rounded down). COD becomes Paid on delivery.
  - Admin override moves forward only, may skip steps, cannot dispatch a cancelled order, and is recorded with actor ADMIN.
  - Buy Again goes through the normal cart add, so price, availability and stock limits apply; unavailable books are listed.
  - `GET /api/orders/:orderNumber` now returns the richer view; the Phase 6 tests still pass against it.
- **Verification**: backend lint clean, 135/135 tests (25 order, 11 order rules, 17 seed and migration); frontend lint clean, 65/65 tests (12 new orders tests, 6 runs in a row), build OK; `npm audit` 0 vulnerabilities in both apps. A timing race in an existing checkout test (`getByRole` before the review loaded) was fixed with `findByRole`.
- **Live smoke test (Vite proxy, 127.0.0.1)**: two orders placed and paid; My Orders listed both newest first; details showed Confirmed, Preparing and an estimate only; another member got 404; cancel gave a completed refund; a member was refused the admin override (403); an admin moved the other order to Delivered; gift points were earned; the return was requested with a return tracking reference; Buy Again added the book. The smoke members and orders were removed afterwards (dev data is back to 11 members, 16 orders). Both servers were stopped and ports 4000 and 5173 are free. The browser was not driven.
- **Docs**: `contracts/openapi.yaml` (Orders and Admin tags, 7 new paths, parses), `data-model.md`, `quickstart.md` (scenarios 20-27).
- **Still PENDING ADMIN APPROVAL**: Brand vs Publisher, categories, admin roles and permissions (the override uses the `ADMIN` role as a placeholder, there is no admin UI), store responsibilities, inventory rules (returned books are **not** put back in stock), payment provider and lifecycle.
- **Known limits**: the carrier is simulated (timers, lazy update and a sweep). Returned books do not go back into stock. No scheduled cleanup of abandoned reservations. Refunds use the mock gateway only. Mixed-order return refunds use a proportional split that the Admin has not approved. The browser was not driven, so a visual check of the Orders pages is worthwhile.
- **Issues / blockers**: none open.
- **Status**: Phase 7 verified. Phase 8 NOT started.

### Phase 7.5 Report (2026-11-17)

- **Completed**: T080-T112 (My Wishlist, US13, and My Writers, US14).
- **PAYMENT STATUS: still PARTIAL, mock only.** Nothing in Phase 7.5 changes payment. FR-072..FR-080, SC-014, SC-015, SC-015a and SC-021 are **not** fully satisfied. Provider and payment lifecycle stay PENDING ADMIN APPROVAL.
- **Spec and design (T080-T082)**: `spec.md` (User Stories 13 and 14, FR-081..FR-091, SC-022..SC-025, edge cases, clarifications; the old placeholder wording is kept and marked Superseded), `plan.md` (Phase 7.5 row and section 4a), `data-model.md` (WishlistItem and FollowedAuthor, now Implemented), `contracts/openapi.yaml` (tags Wishlist and Writers, 7 new paths plus `GET /authors/{id}`, 37 paths, 0 broken refs), `checklists/requirements.md`, `quickstart.md` (scenarios 28-35; scenario 10 marked superseded).
- **Database (T083-T085)**: `006_wishlist` and `007_followed_writers`, each with its own rollback. Tables `wishlist_items` and `followed_authors`, both with foreign keys that cascade when a member (or writer) is deleted, a unique pair per member, and an index for newest-first reads. New config key `wishlist_max_items` (200). No seed rows for either list.
- **Backend (T086-T090, T097-T100)**, in the Member module (D1): `wishlist.*` (`/api/wishlist`, `/items`, `/items/{bookId}`, `/cart`), `writers.*` (`/api/writers`, `/{authorId}/follow`) and public `GET /api/authors/{id}` (adds `following` for a signed-in member). Catalog gained read-only helpers (`isActiveBook`, `booksForWishlist`, `findAuthor`, `getAuthor`, `authorsByIds`); `GET /api/authors` and `GET /api/books?author=` are unchanged. Add to cart goes through `order/cart.service`.
- **Frontend (T092-T096, T102-T107)**: `WishlistContext`, `WritersContext`, `WishlistButton` (cards and book page), `FollowButton` plus a "View writer" link on the book page, `WishlistPage`, `WritersPage`, `WriterDetailPage` (public, `/writers/:authorId`), `lib/wishlist.js`, `lib/writers.js`, API client functions. The header placeholders are now links to `/wishlist` and `/writers` (both behind `ProtectedRoute`), and the "coming soon" notice is gone.
- **Decisions D1-D7 as approved**: D1 Member module. D2 an active out-of-stock book can be wishlisted and is labelled unavailable; an unknown or inactive book is rejected. D3 adding to the cart keeps the book on the wishlist. D4 at most 200 books (`wishlist_max_items`). D5 any existing writer can be followed, including one with no active books. D6 author links still open the filtered catalogue, and "View writer" opens the new page. D7 no seed data.
- **Clarifications applied**: a wishlisted book that became inactive returns ONLY `bookId`, `title`, `coverUrl`, `available:false` and `unavailableReason` (no price, authors, format, description, publisher, categories or stock). In SQL that data is never selected for inactive books.
- **Verification**:
  - Backend: eslint clean; 183/183 tests (24 wishlist, 17 writers, 4 integration, seed and migration tests now 9); `npm audit` 0.
  - Frontend: oxlint clean; 88/88 tests (13 wishlist, 10 writers; the 65 earlier tests still pass, with the `auth.test.jsx` placeholder test replaced); build OK; `npm audit` 0.
  - Migrations: 007 and 006 rolled back, then applied again; second apply "Nothing to do". Seed run twice with identical counts (categories 19, books 228, members 11, orders 19).
  - The integration test covers wishlist to cart to checkout review to a paid mock order, a book deactivated mid-flow, follow a writer then open their books then wishlist one, and two members never seeing each other's lists.
- **Live smoke test (Vite proxy, 127.0.0.1)**: 27 checks passed. Guests got 401 on `/wishlist` and `/writers`; a member added, duplicated, listed (newest first), moved a book to the cart (it stayed on the wishlist) and removed (twice, both 204); an unknown book and an unknown writer gave 404; follow, repeat, list, public writer page (`following` true for the follower, false for another member) and unfollow worked; the existing `/authors?q=` list still worked; the wishlist survived sign-out and sign-in; a second member saw empty lists. The two smoke members were removed (wishlist and follow tables are empty again), both servers were stopped and ports 4000 and 5173 are free. The password came from a run-time variable; none was written to a file.
- **Still PENDING ADMIN APPROVAL (unchanged)**: Brand vs Publisher, single vs multiple categories, admin roles and permissions, store responsibilities, inventory rules, payment provider and lifecycle. No Admin screen was added.
- **Known limits**: the browser was not driven, so a visual check of the new pages is worthwhile. "Out of stock" uses the provisional stock rule, so it will follow the Admin's inventory rules once approved. Adding the whole wishlist to the cart adds one copy of each book. Nothing about the wishlist or followed writers feeds recommendations, sharing, alerts or notifications (out of scope). Writers cannot be created or edited by members, and there is no admin UI.
- **Issues / blockers**: none open.
- **Status**: Phase 7.5 verified. Phase 8 and Phase 9 NOT started.

### Phase 8 Report (2026-11-18)

- **Completed**: T072 (test gaps), T073 (keyboard, labels, contrast, responsive), T074 (OpenAPI served by the app).
- **PAYMENT STATUS: still PARTIAL, mock only.** Phase 8 only tests the mock. FR-072..FR-080, SC-014, SC-015, SC-015a and SC-021 are **not** fully satisfied. Provider and payment lifecycle stay PENDING ADMIN APPROVAL.
- **T072 tests**: coverage was already high, so work went to the gaps (`server.js`, `env.js`, mock gateway, error handler, session). New files: `tests/unit/hardening.unit.test.js` (session secret, alg-none and expired tokens, cookie flags in production, mock gateway methods, amounts, idempotent refund, no card fields, error handler), `tests/api/hardening.test.js` (16 tests: security headers, CORS, oversized body, cookie clearing, email case, malformed and SQL-like input, deleted-member cookie, catalogue input safety, cart quantities and prices, generic 500 on a database failure) and `tests/api/contract.test.js` (every documented operation is a real route, the operation count equals the route count, member-only routes give 401, no card fields described, the file is served unchanged).
- **Bug found and fixed (T072)**: an oversized JSON body returned **500** (logged as an unhandled error). It now returns **413** `PAYLOAD_TOO_LARGE` "Request is too large" (`errorHandler.js`).
- **T074**: `contracts/openapi.yaml` now has 38 paths and 42 operations, 0 broken refs. `GET /api/openapi.yaml` (`modules/system/docs.routes.js`, mounted in `app.js`) serves it unchanged as YAML. A read failure gives a generic 404. No Swagger UI, on purpose (no new dependency).
- **T073 browser audit**: `frontend/scripts/browser-audit.mjs` drives headless Edge with axe-core over 9 pages at 375, 768 and 1280 px plus the Login and Register dialogs (WCAG 2 A/AA, sideways scroll, keyboard reach, real Tab, Shift+Tab and Escape presses). The first run found real defects; the last run is **33 checks, 0 issues**.
- **Accessibility defects fixed**: dim `text-gray-500` text measured 3.87:1 (now `text-gray-400`); three Label-in-Name failures (WCAG 2.5.3): Add to cart buttons are now named `Add to cart: {title}`, the wishlist button shows "Add to wishlist" or "Remove from wishlist", the follow button shows "Follow" or "Unfollow" (the visible "On your wishlist" and "Following" texts were removed); the book page scrolled sideways at tablet width (grid now switches at `lg` and uses `minmax(0,1fr)`); `Modal.jsx` had no Tab trap and no focus return (both added). `lib/contrast.js` and `tests/a11y.test.jsx` (7 tests) keep the colours and the dialog behaviour from regressing.
- **Verification**:
  - Backend: eslint clean; **214/214 tests** (183 before); coverage of `src/` 95.1% statements, 88.9% branches, 97.1% functions, 97.3% lines (`mock.gateway.js` 76.9% to 100%, `errorHandler.js` and `app.js` 100%).
  - Frontend: oxlint clean; **95/95 tests** (88 before); build OK.
  - Live (Vite proxy and direct, 127.0.0.1): `GET /api/openapi.yaml` 200 `application/yaml`; a 200 KB body gave 413.
  - **`npm audit`: backend production 0; both apps show 1 high finding in the dev toolchain**: `picomatch` (ReDoS via repeated extglobs, GHSA-fc5q-39xc-vjpf), pulled in by Vite and vitest through `tinyglobby` and `fdir`. This is a new advisory (earlier phases showed 0). The installed 4.0.7 is the latest published version and is still in the affected range, so there is no patched version to install; the offered `--force` fix would downgrade Vite and Vitest, which is not acceptable. It is used at build and test time only, never with user input at run time. **Open: re-check `npm audit` and upgrade as soon as a patched picomatch is published.**
- **Cleanup**: 6 `audit8*` smoke members (and their wishlist, follow, address and cart rows) were removed; other rows were left untouched, including members and orders made since the seed (for example arya@gmail.com and bc@gmail.com) and two smoke*@example.com members that were not created in this phase; remove them if they are not wanted. Both servers were stopped and ports 4000 and 5173 are free. Passwords came from the run-time variable `SMOKE_PW`; none was written to a file. `quickstart.md` gained scenarios 36-39.
- **Still PENDING ADMIN APPROVAL (unchanged)**: Brand vs Publisher, single vs multiple categories, admin roles and permissions, store responsibilities, inventory rules, payment provider and lifecycle. No Admin screen was added.
- **Known limits**: contrast was audited on the dark theme only; axe-core covers only part of WCAG, so a screen-reader pass and a manual audit are still worthwhile; the browser audit needs Edge or Chrome and the dev servers; `server.js` (the 30-second sweep and boot code) has no unit test; the mock gateway is temporary.
- **Issues / blockers**: the open `picomatch` advisory above (dev tooling only, no fix available yet).
- **Status**: Phase 8 verified. Phase 9 NOT started.
### Phase 9 Report (2026-11-19)

- **Completed**: T075 (`README.md`) and T076 (`documents/architecture-and-decisions.md`). **T077 is NOT complete** (see below).
- **PAYMENT STATUS: still PARTIAL, mock only.** Both documents say so on their first page. FR-072..FR-080, SC-014, SC-015, SC-015a and SC-021 are **not** fully satisfied.
- **T075**: `README.md` at the repository root: what the app is, stack, requirements, setup in order (install, copy `backend/.env.example` to `backend/.env`, set `DATABASE_URL` and `SESSION_SECRET`, then `db:check`, `db:migrate`, `db:covers`, `db:seed`, run both servers), command table, API docs URL, project layout, Spec Kit links, security notes and a delivery-links table. It contains no secrets and no sample passwords; the seed prints generated member passwords once. I also added `coverage/` to `.gitignore`.
- **T076**: `documents/architecture-and-decisions.md`: the six PENDING ADMIN APPROVAL items (what the code does today, where it lives), the open Order-vs-Payment question for gift points and coupons, the PARTIAL payment status, module table against the diagram, a mermaid diagram, 17 decisions with reasons, a security summary, quality results and known limits. The architecture diagram was not changed (no G3). I checked the document's claims against the code and corrected two (guest cart cookie wording; seed books have one or two categories).
- **T077 (not done)**: a pull request and a recorded video need your GitHub account and your screen, so I cannot do them. I prepared `documents/pr-and-demo.md`: a pre-PR checklist, a draft PR title and description, and a 3-minute demo script with timings. The repository still has **no commits and no remote** (`git` says the branch `master` has no commits). Once you have created both, paste the two links into the "Delivery links" table in `README.md` and tick T077.
- **Verification**: all Markdown links in `README.md` and `documents/*.md` resolve; `git add -n .` lists 421 files and none is a `.env`, `node_modules`, `dist`, coverage or temporary file (only the two `.env.example` templates); a scan of all untracked files found no connection string with a password. Only documentation and `.gitignore` changed, so the Phase 8 results stand (backend 214 tests, frontend 95 tests, lint clean, build OK).
- **Open items**: `picomatch` advisory in the dev toolchain (GHSA-fc5q-39xc-vjpf, no patched release); two `smoke*@example.com` members left in the dev database from earlier phases.
- **Still PENDING ADMIN APPROVAL (unchanged)**: Brand vs Publisher, single vs multiple categories, admin roles and permissions, store responsibilities, inventory rules, payment provider and lifecycle. No Admin feature was added.
- **Status**: Phase 9 documentation done; T077 waits for the owner.
---
## Phase 6: Addresses, Gift Points, Checkout, Payment (COMPLETE, payment PARTIAL) - US9, US10

Payment tasks use the temporary mock only; payment requirements remain PARTIAL.

- [x] T059 [US9] Address model, routes, PIN validation, shipping zone and rate rules in `backend/src/modules/shipping/`
- [x] T060 [US9] Gift point ledger and coupons (ownership across Order and Payment PENDING ADMIN APPROVAL) in `backend/src/modules/order/`
- [x] T061 [US10] `PaymentGateway` interface and temporary mock implementation in `backend/src/modules/payment/gateway/` (swappable; no card data stored or logged)
- [x] T062 [US10] Idempotent payment endpoint, COD rule (FR-072a), failed payment handling in `backend/src/modules/payment/`
- [x] T063 [P] [US9] Checkout and payment pages in `frontend/src/pages/CheckoutPage.jsx`
- [x] T064 [P] Payment and checkout API tests (duplicate submit, failure, COD) in `backend/tests/api/payment.test.js`
- [x] T065 Record payment requirements as PARTIAL (mock only) in this file and in the final report

---

## Phase 7: Orders, History, Buy Again, Cancellation, Shipping (COMPLETE, payment still PARTIAL) - US11, US12

- [x] T066 [US11] Order creation and confirmation, stock handling (inventory rules PENDING ADMIN APPROVAL), history in `backend/src/modules/order/`
- [x] T067 [US11] 48-hour cancellation (configurable) with refund and restoration in `backend/src/modules/order/`
- [x] T068 [US11] Shipment timers, admin override (clarified), return shipment in `backend/src/modules/shipping/`
- [x] T069 [US12] Buy Again and gift point earning on delivery in `backend/src/modules/order/`
- [x] T070 [P] API tests: cancellation window, ownership checks, shipment rules in `backend/tests/api/order.test.js`
- [x] T071 [P] My Orders, order details, cancel/return UI in `frontend/src/pages/OrdersPage.jsx`

---

## Phase 7.5: My Wishlist and My Writers (COMPLETE - 2026-11-17) - US13, US14

**Status**: Approved by the Admin on 2026-11-17 with the clarifications below (D2 and T087). Work proceeds in task order. Phase 8 and Phase 9 keep their IDs and content but run **after** Phase 7.5 is complete and verified. New IDs start at T080 because T072-T079 are already used.

**Why a spec change is needed**: spec.md (FR-016, User Story 7 scenario 4, the Assumptions) currently says My Wishlist and My Writers are out of scope placeholders. T080 amends the spec first. The original placeholder wording stays in the file, marked as superseded, and the Phase 3 and Phase 4 reports are not edited.

**Placement (no new module, so no G3)**: the diagram has no Wishlist or Writers box. The member-owned data (wishlist and followed writers) lives inside the existing **Member** module. It reads books and authors through the **Catalog** service and adds to the cart through the **Order** cart service, never through their tables. Please confirm this placement (D1).

**Defaults to confirm (labelled, small, reversible)**
- D1 Placement: `backend/src/modules/member/` (`wishlist.*`, `writers.*`); author reads stay in `catalog/`.
- D2 (clarified by the Admin) Only **active** books can be added. Unknown or already inactive books are rejected when adding. An active book that is **out of stock is accepted**, labelled unavailable, and cannot be added to the cart until stock is available. If a book later becomes inactive it stays in the list, is shown as unavailable with the reason, cannot be added to the cart, and can be removed. Availability uses the same placeholder stock rule as the cart (inventory rules stay PENDING ADMIN APPROVAL).
- D3 Adding a wishlist book to the cart does not remove it from the wishlist.
- D4 A wishlist holds at most 200 books, set by the config key `wishlist_max_items` (configurable per constitution VIII).
- D5 Any existing writer can be followed, including one with no active books. The existing `/api/authors` list is unchanged (still only writers with active books).
- D6 Author links on cards and details keep opening the filtered catalogue (US6). A separate "View writer" link opens the new writer page.
- D7 No seed data: every member starts with an empty wishlist and no followed writers.

**Out of scope (not invented)**: any Admin screen or Admin rule, creating or editing authors, notifications for followed writers, sharing wishlists, price alerts, recommendations from wishlist or follows, and anything about the six PENDING ADMIN APPROVAL items.

**Proposed requirement IDs (added to spec.md by T080)**: FR-081..FR-091, SC-022..SC-025. Existing IDs are not changed.

### Part A - Spec, contract and design (first; no code)

- [x] T080 [US13] [US14] Amend `spec.md`: add User Stories 13 (My Wishlist) and 14 (My Writers) with acceptance scenarios, FR-081..FR-091 and SC-022..SC-025; mark FR-016, User Story 7 scenario 4 and the Assumptions line as superseded for these two items (original text kept); update `checklists/requirements.md`. Does not touch the six pending items.
- [x] T081 [P] Update `data-model.md` (WishlistItem, FollowedAuthor, state notes, ownership) and `plan.md` (Phase 7.5 row, Member-module placement, dependency on Catalog and Order service interfaces).
- [x] T082 [P] Contract first: add the Wishlist and Writers endpoints to `contracts/openapi.yaml` (see Endpoints below), with error codes and examples; check that the file parses.

**Endpoints (proposed)**
- Wishlist (member only): `GET /api/wishlist`, `POST /api/wishlist/items` {bookId}, `DELETE /api/wishlist/items/{bookId}`, `POST /api/wishlist/cart` {bookIds optional; all available books when omitted}.
- Writers: `GET /api/authors/{id}` (public; adds `following` when signed in), `GET /api/writers` (member), `POST /api/writers/{authorId}/follow`, `DELETE /api/writers/{authorId}/follow`. A writer's books reuse the existing `GET /api/books?author={id}`.

### Part B - Database (migrations with rollback)

**Independent test**: each migration applies, rolls back and re-applies on a temporary schema on its own.

- [x] T083 [US13] `backend/db/migrations/006_wishlist.sql` and `006_wishlist.down.sql`: table `wishlist_items` (member_id and book_id foreign keys, `added_at`, unique per member and book, index for newest-first listing, member deletion cascades). Add config key `wishlist_max_items` (200) to `seed-data.js` (idempotent upsert).
- [x] T084 [US14] `backend/db/migrations/007_followed_writers.sql` and `007_followed_writers.down.sql`: table `followed_authors` (member_id and author_id foreign keys, `followed_at`, primary key per member and author, index on author). Reuses `authors` and `book_authors`; no new author columns.
- [x] T085 Update `backend/tests/unit/seed.test.js` for the two new migrations (roll back and re-apply order) and add schema checks (uniqueness, cascade, no row created by the seed). Apply 006 and 007 to the dev database and run the seed twice to confirm the same counts.

### Part C - My Wishlist backend (US13)

**Independent test**: with only Part B applied, every wishlist endpoint works by API call alone.

- [x] T086 [US13] Add to wishlist in `backend/src/modules/member/wishlist.*`: validate the book id, active books only (unknown or inactive is 404), repeat add is idempotent (one row), cap from `wishlist_max_items` with a clear message, member scoped.
- [x] T087 [US13] View wishlist: `GET /api/wishlist` newest first with current price, format, authors, cover, `available` and an `unavailableReason` (inactive or out of stock). Needs a small Catalog service function that returns book cards for given ids including inactive books. **For an inactive book only `bookId`, `title`, `coverUrl`, `available: false` and `unavailableReason` are returned (Admin clarification); price, authors, format, description, publisher, categories and stock are never exposed.** Never fabricated data.
- [x] T088 [US13] Remove from wishlist: `DELETE /api/wishlist/items/{bookId}`, idempotent, only ever touches the signed-in member's row.
- [x] T089 [US13] Add to cart from wishlist: `POST /api/wishlist/cart` goes through `order/cart.service` `addItem` (stock limits and price rules apply). Response lists `added`, `skipped` (book and reason: inactive, out of stock, limited by stock) and the cart. Never errors the whole request because one book is unavailable.
- [x] T090 [US13] Routes, authentication and validation: all wishlist routes behind `requireAuth` (guests get 401), mounted at `/api/wishlist` in `app.js`, validation and generic error messages, events logged without secrets or personal data.
- [x] T091 [P] [US13] API tests in `backend/tests/api/wishlist.test.js`: persists across sign-out and sign-in, duplicate add, inactive and unknown book, cap, remove (and remove twice), another member cannot see or change a list (list, remove, add-to-cart all scoped), guest 401, a book deactivated after adding is flagged and cannot go to the cart, stock 0, partial add-to-cart result, quantity limited by stock.

### Part D - My Wishlist frontend (US13)

**Independent test**: with the API stubbed, the pages and buttons work without the Writers feature.

- [x] T092 [P] [US13] API client functions, `src/lib/wishlist.js` and a `WishlistContext` (set of wishlisted book ids, reloaded on sign-in and sign-out, same pattern as `CartContext`).
- [x] T093 [US13] `WishlistButton` on `BookCard` and `BookDetailsPage`: toggle with `aria-pressed`, guest is asked to sign in, shows the server message on failure. Existing card layout and tests keep passing.
- [x] T094 [US13] `frontend/src/pages/WishlistPage.jsx`: loading, error with retry, empty state; items with price, authors and link to details; unavailable items clearly labelled with the reason and no cart button; remove; add one and add all available to the cart, showing which were added and which were skipped and why.
- [x] T095 [US13] Replace the My Wishlist placeholder: `Header.jsx` link to `/wishlist`, `/wishlist` route behind `ProtectedRoute` in `App.jsx`; update the wishlist half of the placeholder test in `tests/auth.test.jsx` (guest is asked to sign in, member sees the page).
- [x] T096 [P] [US13] Frontend tests in `frontend/tests/wishlist.test.jsx`: list, empty, error and retry, remove, add to cart (full and partial), unavailable item, guest prompt from the button, toggle state on a card.

### Part E - My Writers backend (US14)

**Independent test**: with only Part B applied, writers endpoints work by API call alone and use the existing seeded authors.

- [x] T097 [US14] Writer details in the Catalog module: `GET /api/authors/{id}` returns name, active book count and, for a signed-in member, `following`. Public like the rest of the catalogue (FR-014). An unknown id is 404. A writer with no active books returns 200 with count 0. No author is created or edited.
- [x] T098 [US14] Follow and unfollow in `backend/src/modules/member/writers.*`: `POST` and `DELETE /api/writers/{authorId}/follow`, idempotent, unknown writer is 404, member scoped.
- [x] T099 [US14] View followed writers: `GET /api/writers` newest first with name, active book count and `followedAt`; a followed writer who now has no active books is still listed with count 0.
- [x] T100 [US14] Routes, authentication and validation: `/api/writers` behind `requireAuth` (guests 401), optional session on `GET /api/authors/{id}`, mounted in `app.js`, validation, generic errors, logging without secrets.
- [x] T101 [P] [US14] API tests in `backend/tests/api/writers.test.js`: follow and unfollow (repeat both), list, persistence across sessions, writer with no books, unknown writer, writer details guest versus member (`following`), another member cannot see or change follows, guest 401, a writer's books match `GET /api/books?author=` and contain only active books.

### Part F - My Writers frontend (US14)

**Independent test**: with the API stubbed, the pages work without the Wishlist feature.

- [x] T102 [P] [US14] API client functions, `src/lib/writers.js` and a `WritersContext` (set of followed writer ids, reloaded on sign-in and sign-out).
- [x] T103 [US14] `FollowButton` next to each author on `BookDetailsPage`, plus a "View writer" link (existing author links keep opening the filtered catalogue, D6). Guest is asked to sign in.
- [x] T104 [US14] `frontend/src/pages/WritersPage.jsx` (My Writers): loading, error with retry, empty state, list with book counts, unfollow, link to the writer page, "no books available right now" for a writer with none.
- [x] T105 [US14] `frontend/src/pages/WriterDetailPage.jsx` at `/writers/:authorId`: name, follow toggle, books through the existing catalogue endpoint with `BookGrid` and `Pagination`, no-books message, not-found message.
- [x] T106 [US14] Replace the My Writers placeholder: `Header.jsx` link to `/writers`, `/writers` route behind `ProtectedRoute` (the writer page itself is public), update the writers half of the placeholder test in `tests/auth.test.jsx`.
- [x] T107 [P] [US14] Frontend tests in `frontend/tests/writers.test.jsx`: list, empty, error and retry, unfollow, writer page with books, with no books, not found, follow toggle, guest prompt.

### Part G - Integration, regression and documentation

- [x] T108 [P] Integration test `backend/tests/api/lists.integration.test.js`: wishlist book to cart to checkout review and a paid order (mock gateway); a book deactivated in the middle of the flow; follow a writer, open their books, wishlist one; two members never see each other's lists or follows.
- [x] T109 Regression run: backend and frontend lint, all tests (existing cart, catalogue, orders, auth and checkout suites unchanged and passing), frontend build, `npm audit` in both apps, migrations 006 and 007 up, down and up again, seed twice with identical counts. Fix only what these changes break.
- [x] T110 Live smoke test through the Vite proxy on 127.0.0.1 (register, wishlist add and remove, add to cart, follow and unfollow, writer page, guest denied), remove the smoke data, stop both servers, confirm ports 4000 and 5173 are free. Passwords come from a run-time environment variable only.
- [x] T111 [P] Final documentation: re-check `openapi.yaml` against the built routes, `data-model.md`, `quickstart.md` scenarios 28 onwards (wishlist, unavailable book, wishlist to cart, follow, writer page, ownership, guest denial), notes in `member/README.md` and `catalog/README.md`.
- [x] T112 Phase 7.5 report in this file: completed tasks, files changed, decisions D1-D7 as approved or changed, verification results, known limits, and a statement that the six PENDING ADMIN APPROVAL items and the PARTIAL payment status are unchanged. Then stop; Phase 8 starts only on a new instruction.

**Order inside Phase 7.5**: T080 -> (T081, T082) -> T083 and T084 -> T085 -> then Wishlist (T086-T096) and Writers (T097-T107) can be done in either order or in parallel -> T108 -> T109 -> T110 -> T111 -> T112. Frontend tasks need only the contract (T082), not the finished backend.

---
## Phase 8: Tests, Validation, Responsiveness, Accessibility (COMPLETE - 2026-11-18)

- [x] T072 Fill test gaps for authentication, catalogue, cart, payment, cancellation (constitution VII) in `backend/tests/`
- [x] T073 Keyboard, labels, alt text and contrast pass; responsive checks at phone, tablet, desktop widths in `frontend/src/`
- [x] T074 Update `specs/001-member-auth-catalogue/contracts/openapi.yaml` for all implemented endpoints and serve it from `backend/src/app.js`

---

## Phase 9: Documentation and Delivery (PARTLY DONE - 2026-11-19; T077 waits for the owner)

- [x] T075 README with setup using `.env.example`, no secrets, in `README.md`
- [x] T076 Architecture and decisions doc stating the six PENDING ADMIN APPROVAL items and mock payment status in `documents/architecture-and-decisions.md`
- [ ] T077 GitHub PR and 3-minute demo video (links recorded in `README.md`)

---

## Dependencies and Order

- Phase 1 -> G1 -> (G2) Phase 2 -> Phase 3 and Phase 4 (Phase 4 needs Phase 2; guest browsing does not need Phase 3) -> Phase 5 -> Phase 6 -> Phase 7 -> **Phase 7.5 (proposed)** -> Phase 8 -> Phase 9. Phase 8 does not start until Phase 7.5 is complete and verified.
- Within Phase 1: T002 before T007-T011; T003 before T013-T015; T016 needs the user's `.env`.
- Parallel in Phase 1: T003, T004, T005 together; T008, T009 together; T012 and T015 after their targets exist.

## Implementation Strategy

Do Phase 1 only, report, and stop. Move to Phase 2 only after Phase 1 is verified (G1) and the Admin has been informed (G2).


