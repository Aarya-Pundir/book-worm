# Implementation Plan: Book Worm - Member, Catalogue, Cart, Order, Payment, Shipping

**Branch**: `001-member-auth-catalogue` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-member-auth-catalogue/spec.md`

## Summary

Build Book Worm as a modular monolith: a React single-page app talking to a Node/Express REST API backed by PostgreSQL through the `pg` driver (plain parameterized SQL, no ORM). All six original modules (Member, Store, Catalogue, Order, Payment, Shipping) exist as backend modules from the start; delivery is incremental. **Current priority is Phases 1-4** (setup, database and seed, auth, home/catalogue). Phases 5-9 are planned but not started.

## 0. Authoritative Architecture Reference

[`documents/architecture-diagram.png`](../../documents/architecture-diagram.png) is the authoritative architecture. It MUST NOT be replaced or redesigned without Admin approval. Inspected 2026-11-16. Alignment:

| Diagram element | Responsibilities shown in the diagram | Plan alignment |
|-----------------|---------------------------------------|----------------|
| Member | Guest/registered users; login and logout; role and entitlement | `backend/src/modules/member` |
| Store | Create stores, catalogs, store policies | `backend/src/modules/store` (structure only; behaviour PENDING ADMIN APPROVAL) |
| Catalog | Browse catalog by entitlement; browse by category and **brand**; recommendations from order history; up-sell and cross-sell | `backend/src/modules/catalog` (folder named as in the diagram) |
| Order | Create/modify order; checkout; confirm, cancel, return; order history; redeem gift points and coupons | `backend/src/modules/order` (cart lives here, as "Add to Cart" feeds the order flow) |
| Payment | Payment through a gateway; refund processing; payment confirmation; gift and wallet | `backend/src/modules/payment` |
| Shipping | Shipping rate calculation; approximate delivery time; return shipment | `backend/src/modules/shipping` |

Data flow to preserve: Registered User -> User Login -> Home Page; Guest User -> Home Page; Home Page -> Browse -> Add to Cart -> Payment Processing -> Shipment.

Observations to confirm with the Admin (not changed by the plan):
- The diagram says **Brand** where the spec says Publisher (see Brand vs Publisher below).
- "Gift & Wallet" appears under Payment, while "Redeem Gift points, Coupons" appears under Order. Ownership of the gift point ledger across these two modules is PENDING ADMIN APPROVAL.
- "Browse catalog by entitlement" implies entitlement-aware catalogue access; the entitlement model is part of the pending Admin roles and permissions decision.
- "Up-sell and cross-sell" is shown under Catalog; the spec covers related books and recommendations only.

## 1. Repository Assessment

Inspected 2026-11-16. The workspace contains only Spec Kit scaffolding, the constitution and `spec.md`.

| Item | Status |
|------|--------|
| Frontend, backend, database schema, migrations, seed data, APIs, tests | NOT STARTED (none exist) |
| `tasks.md`, `plan.md`|
| Constitution v1.0.0 | COMPLETED |
| Spec (12 user stories, FR-001..FR-080) with 3 clarifications | COMPLETED |
| Local environment | Node 24.21, npm 11.19, PostgreSQL 18 service running; `psql` not on PATH; Docker absent |



## Technical Context

**Language/Version**: JavaScript (ES modules), Node.js 24 LTS line; no TypeScript.

**Primary Dependencies** (latest stable verified on npm 2026-11-16):
- Frontend: React 19.3, Vite 8.3, Tailwind CSS 4.3, React Router, Axios or fetch.
- Backend: Express 5.3, pg 8.x (PostgreSQL driver; no ORM), jsonwebtoken 9.0, bcrypt 6.0, helmet 8.3, zod 4.6 (input validation), pino (structured logging), express-rate-limit, swagger-ui-express.

**Storage**: PostgreSQL 18 (already installed locally) via the `pg` driver with numbered SQL migration files.

**Testing**: Vitest (unit, frontend), Vitest + Supertest (API), React Testing Library.

**Target Platform**: Web (desktop, tablet, phone); local development first.

**Project Type**: Web application (frontend + backend).

**Performance Goals**: Genre/filter/search results visible within 2 s for 95% of interactions (SC-003, SC-004).

**Constraints**: Server-side filtering/sorting/paging; services bind to 127.0.0.1; JWT in an httpOnly, sameSite cookie; no secrets in git; no card data stored.

**Scale/Scope**: Capstone demo: 200+ seeded books, 20 genres, a few hundred members.

## Constitution Check

| Principle | Gate | Plan response | Result |
|-----------|------|---------------|--------|
| I Security First | Auth, hashed passwords, server-side authorization, no card storage, 127.0.0.1 binding | bcrypt, JWT cookie, auth + role middleware, mock gateway stores tokens only, bind to 127.0.0.1 | PASS |
| II User-Centric | Responsive, consistent nav, feedback, accessibility | Tailwind responsive layout, shared header, toasts/error states, semantic HTML | PASS |
| III Modular | Six modules, layered, defined interfaces | `modules/<name>/{routes,controller,service,repository}`; cross-module calls via service interfaces only | PASS |
| IV Data Integrity | Server-side prices, estimated vs confirmed dates, ledger | Prices recomputed server-side; ledger table for gift points | PASS (Phases 5-7) |
| V Reliable Transactions | Idempotent payment, confirm after authorization, 48 h cancel | Idempotency key, DB transactions, configurable cancellation window | PASS (Phases 6-7) |
| VI Personalization | Order-history recommendations, no cross-customer leakage | Recommendation query scoped to the caller's own orders | PASS |
| VII QA | Tests for auth, catalogue, cart, payment, cancellation | Phase 8 plus tests written alongside each phase | PASS |
| VIII Maintainability | Config-driven rules, documented APIs | `config` table/env for rules, OpenAPI in `contracts/` | PASS |

Post-design re-check: no violations, so no Complexity Tracking entries.

## 2. Pending Admin Approval

All six decisions below remain **PENDING ADMIN APPROVAL**. The "provisional placeholder" column exists only so development is not blocked. It is NOT a requirement, NOT a decision and MUST NOT be treated as final.

Rules for provisional placeholders:
- They live in clearly labelled places (marked `PENDING ADMIN APPROVAL` in code comments and in a dedicated migration), so they can be changed or removed without rewriting unrelated code.
- No irreversible schema decision is made: migrations touching these topics are isolated, small and reversible (no data-destroying changes without Admin approval).
- Requirements in the spec are not removed or weakened because a decision is pending.
- Admin approval is requested before the Phase 2 migration is applied (see Gate G2 below).

| Topic | Provisional placeholder (not final) | Status |
|-------|--------------------------------------|--------|
| Brand vs Publisher | Spec says Publisher; the diagram says Brand. A single swappable naming layer is used so renaming is cheap. | PENDING ADMIN APPROVAL |
| Single vs multiple categories per book | A join table is used so either outcome is reachable; no constraint that forbids a second category and none that requires it. | PENDING ADMIN APPROVAL |
| Admin roles and permissions | Roles Guest, Member, Admin as in the diagram ("Role & Entitlement"); permissions limited to the clarified shipment override. | PENDING ADMIN APPROVAL |
| Store responsibilities | Store module exists as structure only; no store management behaviour is implemented. | PENDING ADMIN APPROVAL |
| Inventory rules | A stock quantity field exists for availability display only; reservation/threshold rules are not final. | PENDING ADMIN APPROVAL |
| Payment gateway/provider and payment lifecycle | Temporary mock gateway behind a swappable interface (see Payment Rules). | PENDING ADMIN APPROVAL |

### Payment Rules (temporary mock)

- The mock gateway is **temporary** and sits behind a `PaymentGateway` interface so a real provider can replace it without changing other modules.
- Payment requirements (FR-072 to FR-080, SC-014, SC-015, SC-015a, SC-021) are tracked as **PARTIAL / not fully satisfied** until the Admin approves a provider and lifecycle and it is verified against that provider. Passing tests against the mock MUST NOT be reported as the requirements being satisfied.
- No real card, UPI or bank credentials are ever collected or stored.

### Gates

| Gate | Condition |
|------|-----------|
| G1 | Phase 1 tested and verified before any of Phases 2-4 begins |
| G2 | Admin informed of the placeholders above before the Phase 2 migration is applied |
| G3 | Diagram changes or module redesign require Admin approval |


**G2 record (2026-11-16)**: The Admin instructed `/speckit-implement phase 2 only` after being told that six items remain PENDING ADMIN APPROVAL (Brand vs Publisher, single vs multiple categories, admin roles, store responsibilities, inventory rules, payment provider/lifecycle). The Phase 2 schema treats all six as provisional placeholders: they are marked with `PENDING ADMIN APPROVAL` SQL comments and isolated in the reversible migration `002_pending_admin_placeholders.sql` (with a down script). This is recorded as acknowledgement to proceed, not as approval of any placeholder.



### Secrets and Credentials

- No credentials, tokens, secrets, keys or connection strings with passwords are ever committed.
- Secrets live only in git-ignored `.env` files; only `.env.example` templates with placeholder values are committed.
- `.gitignore` already excludes `.env` and `.env.*`; `.env.example` is allowed through with an explicit exception.
- Logs redact passwords, tokens and card data.

## Project Structure

### Documentation (this feature)

```text
specs/001-member-auth-catalogue/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/openapi.yaml
├── checklists/requirements.md
└── tasks.md            # created later by /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── db/                # migrations/*.sql, migrate.js, seed.js
├── src/
│   ├── app.js, server.js, config/
│   ├── middleware/    # auth, authorize, validate, errorHandler, rateLimit
│   ├── modules/
│   │   ├── member/    # routes, controller, service, repository
│   │   ├── store/
│   │   ├── catalog/
│   │   ├── order/     # includes cart
│   │   ├── payment/   # gateway/ (interface + mock)
│   │   └── shipping/
│   └── lib/           # logger, errors, response helpers
├── openapi/           # served API docs
└── tests/             # unit/, api/

frontend/
├── src/
│   ├── components/    # Header, Sidebar, BookCard, BookGrid, SearchBar, CatalogueFilters, SortDropdown, LoginModal, ProtectedRoute
│   ├── pages/         # HomePage, CataloguePage, BookDetailsPage, (later) Cart, Checkout, Orders
│   ├── services/      # API client
│   └── context/       # auth state
└── tests/
```

**Structure Decision**: Two top-level apps (`backend/`, `frontend/`) in one repo, matching the constitution's frontend/backend/database separation. The backend is a single deployable with one folder per business module.

## 3. Phase-wise Execution Plan

| Phase | Scope | Spec mapping | Status |
|-------|-------|--------------|--------|
| 1 | Scaffold frontend/backend per the diagram's module layout, `.env.example` templates, scripts, test runners, health endpoint, DB connectivity check | FR-044, FR-045 | **CURRENT - only phase in progress** |
| 2 | SQL schema migrations, idempotent seed: 20 genres, authors, publishers/brands, 200+ books, sample members/orders, config. Starts only after G1 and G2 | FR-021..FR-022, FR-042, SC-005, SC-012 | NOT STARTED - blocked by G1, G2 |
| 3 | Register, login (email or mobile), logout, `/me`, JWT cookie, roles, guest access, protected routes, rate limit | US3, US7; FR-001..FR-014 | NOT STARTED - **PRIORITY** |
| 4 | Home page sections, 20-genre sidebar, search, filters, sorting, pagination, authors/publishers browsing, book details, related books, recommendations | US1, US2, US4, US5, US6; FR-015..FR-041 | NOT STARTED - **PRIORITY** |
| 5 | Cart (guest + member), quantity update, removal, summary, merge on login | US8; FR-047..FR-052 | Planned |
| 6 | Addresses, gift points ledger, coupons, shipping charge, checkout, temporary mock payment (Card/UPI/Net Banking/COD). Payment requirements stay PARTIAL | US9, US10; FR-053..FR-056, FR-072..FR-080 | Planned |
| 7 | Order creation/confirmation, history, Buy Again, 48 h cancellation, shipment timers + admin override, returns | US11, US12; FR-057..FR-071 | Planned |
| 7.5 | My Wishlist and My Writers: server-side wishlist (add, view, remove, add to cart, unavailable handling) and followed writers (follow, unfollow, list, writer page), migrations 006 and 007, working header links. Placed in the **Member** module (D1); no new module and no diagram change (no G3). Reads books and authors through Catalog and adds to the cart through the Order cart service | US13, US14; FR-081..FR-091; SC-022..SC-025 | **Approved 2026-11-17, runs before Phase 8** |
| 8 | Wider unit/API tests, validation hardening, responsive and accessibility pass | FR-043, FR-044, SC-011 | Planned (starts after Phase 7.5 is complete and verified) |
| 9 | README, docs, PR, 3-minute demo | - | Planned |

Each phase ends with: run tests, check frontend-backend integration, update `tasks.md`, report files changed and blockers, confirm the app still runs.

## 4. Required Changes by Layer (Phases 1-4)

- **Database**: tables Member, Role, Store, Category, Author, Publisher, Book, BookCategory, BookAuthor, plus read-only Order/OrderLine for recommendations (full detail in [data-model.md](data-model.md)).
- **API**: `/api/members/*`, `/api/categories`, `/api/books`, `/api/books/:id`, `/api/books/featured`, `/api/books/recommended`, `/api/authors`, `/api/publishers`, `/api/health` (see [contracts/openapi.yaml](contracts/openapi.yaml)).
- **UI**: dark theme per reference, Header, Sidebar, filter bar, three home sections, BookCard/Grid, login/registration modal with guest option, details page, placeholder messages for Wishlist/Writers. *(Phase 7.5 replaces the Wishlist and Writers placeholders with working pages.)*

## 4a. Phase 7.5: My Wishlist and My Writers

- **Placement and diagram (D1)**: the diagram has no Wishlist or Writers box. Both features are member-owned data, so they live in the existing **Member** module (`backend/src/modules/member/wishlist.*`, `writers.*`). The diagram is not changed, so gate G3 does not apply. If the Admin later wants a different home, only these files move.
- **Interfaces, not table access (constitution III)**: Member calls a small Catalog service function (book cards by id, with inactive books limited to bookId, title, coverUrl and reason; author details by id) and the Order `cart.service.addItem`. It never reads `books`, `authors` or the cart tables to build responses.
- **Database**: `006_wishlist` and `007_followed_writers`, each with its own `.down.sql`, applied and rolled back independently. No seed rows. One config key, `wishlist_max_items`.
- **API** (see [contracts/openapi.yaml](contracts/openapi.yaml)): `/api/wishlist`, `/api/wishlist/items`, `/api/wishlist/items/{bookId}`, `/api/wishlist/cart`, `/api/writers`, `/api/writers/{authorId}/follow`, and the public `GET /api/authors/{id}`. A writer's books reuse `GET /api/books?author={id}`.
- **UI**: `WishlistContext` and `WritersContext` (reloaded on sign-in and sign-out, like the cart), `WishlistButton`, `FollowButton`, `WishlistPage`, `WritersPage`, `WriterDetailPage`; header links to `/wishlist` and `/writers` replace the placeholders. Existing author links keep opening the filtered catalogue (D6).
- **Security**: all member routes behind `requireAuth`; every query scoped by the session's member id; validation on every id; generic errors; logs hold no personal data.
- **Pending Admin items**: unchanged. "Out of stock" uses the provisional stock rule already used by the cart (inventory rules stay PENDING ADMIN APPROVAL). No Admin feature is added.
- **Out of scope**: sharing, price alerts, notifications, recommendations from wishlist or follows, author editing, any Admin screen.

## 5. Dependencies and Risks

| Risk | Mitigation |
|------|------------|
| PostgreSQL 18 is running but credentials and `psql` path are unknown | Credentials are supplied by the user in git-ignored `backend/.env`; `.env.example` is committed with placeholders. DB connectivity verification stays BLOCKED until then |
| No ORM: migrations and queries are hand-written SQL | Parameterized queries only; small migration runner; repository layer isolates SQL |
| Cover images (copyright, availability) | Seed with generated local placeholder covers or open images; fallback image for missing covers |
| Scope is very large | Phases 1-4 first; no later phase starts until verified |
| Pending admin decisions may change schema | Isolated, reversible migrations; G2 gate before Phase 2 migration; naming layer for Brand/Publisher |
| Diagram drift | Diagram is authoritative; module folders mirror it; changes need Admin approval (G3) |
| Concurrency on last copy | DB transaction with row lock in Phase 7 |

## 6. First Recommended Implementation Step

Phase 1, step 1: create `backend/` (Express app, `/api/health`, env loading, pino logger, error handler) and verify the connection to the local PostgreSQL instance with `pg`, then create `frontend/` with Vite + Tailwind and a page that calls `/api/health` through the dev proxy.

## Complexity Tracking

No constitution violations; section not needed.

