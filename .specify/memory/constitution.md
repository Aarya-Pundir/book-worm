<!--
Sync Impact Report (temporary; remove before commit)
- Version change: (template) -> 1.0.0
- Modified principles: none renamed (initial adoption); all 8 principles newly defined
  I. Security First; II. User-Centric Experience; III. Modular Architecture;
  IV. Data Integrity and Accuracy; V. Reliable Transactions; VI. Personalization;
  VII. Quality Assurance; VIII. Maintainability and Documentation
- Added sections: Core Principles, Architecture & Scope, Development Workflow & Quality Gates,
  Governance
- Removed sections: none
- Follow-up TODOs: none. Tech stack intentionally left to /speckit-plan.
-->

# E-Store Constitution

## Core Principles

### I. Security First (NON-NEGOTIABLE)
- Guest users MAY browse the Home page and Catalogue. Personalized account features (profile,
  addresses, order history, Buy Again, gift points/wallet, checkout) MUST require an authenticated
  Registered User session.
- Customer data and credentials MUST be protected: passwords MUST be stored only as salted,
  slow hashes; secrets MUST come from environment variables or a vault, never source control.
- Payment card data MUST NOT be stored by the application. Payments MUST go through the payment
  gateway, and only gateway tokens/references MAY be persisted.
- Access to a customer's orders, addresses and balances MUST be authorized server-side on every
  request; a customer MUST NOT be able to read or modify another customer's data.
- All inputs MUST be validated on the server. All traffic MUST use TLS 1.2+ outside local
  development. Local services MUST bind to 127.0.0.1, not 0.0.0.0.

Rationale: Security, transaction integrity and customer data privacy take priority over
convenience.

### II. User-Centric Experience
- The UI MUST be responsive and intuitive across desktop and mobile widths.
- Navigation across Home, Catalogue, Cart and Payment MUST be consistent (shared header,
  cart indicator, and flow: Home -> Browse -> Add to Cart -> Payment).
- Every important action (login, add to cart, checkout, payment, cancel, return) MUST show clear
  success and error feedback.
- The UI MUST follow accessibility best practices (WCAG 2.1 AA target): semantic HTML, keyboard
  navigation, labels, alt text and sufficient contrast.

### III. Modular Architecture
- The system MUST be separated into the modules Home, Catalogue, Product, Cart, Order and
  Payment, supported by the Member, Store and Shipping domains (see Architecture & Scope).
- Frontend, backend and database responsibilities MUST remain separate: the UI MUST NOT access
  the database directly, and business rules MUST live in the backend.
- Components and services MUST be reusable rather than duplicated per page.
- Modules MUST interact only through well-defined interfaces (APIs/service contracts), not by
  reading each other's internal data stores.

### IV. Data Integrity and Accuracy
- Product details, prices, availability and delivery estimates MUST be accurate and come from a
  single source of truth; the cart and order MUST recompute prices server-side.
- Tentative (estimated) delivery dates MUST be visibly distinguished from confirmed dates.
- Order history MUST reflect actual completed, cancelled and returned transactions.
- Gift point redemption MUST keep customer balances accurate (no negative or double-spent
  balances); balance changes MUST be recorded as auditable entries.

### V. Reliable Transactions (NON-NEGOTIABLE)
- Payment processing MUST be idempotent and prevent duplicate charges (for example via
  idempotency keys on submit and retry).
- An order MUST be confirmed only after successful payment authorization.
- A failed payment MUST NOT produce a successful purchase confirmation or consume stock,
  coupons or gift points permanently.
- Order cancellation MUST enforce the 48-hour cancellation policy; refunds for cancelled orders
  MUST go through the payment module.

### VI. Personalization
- Registered customers MUST be able to view their previous orders.
- Buy Again MUST allow reordering of previously purchased products, subject to current price and
  availability.
- Recommendations (including up-sell and cross-sell) MUST be based on relevant order history.
- Recommendations MUST NOT expose any other customer's purchase information.

### VII. Quality Assurance
- Every critical business function MUST have appropriate automated tests.
- Authentication, catalogue, cart, payment and cancellation workflows MUST be tested.
- Error handling and input validation are mandatory on all user-facing and API operations;
  errors returned to clients MUST be generic and MUST NOT leak internals.
- The critical purchase workflow (login -> browse -> cart -> payment -> order confirmation, plus
  cancellation) MUST pass integration tests before release.

### VIII. Maintainability and Documentation
- Code MUST follow consistent naming conventions and the coding standards chosen in the plan.
- Unnecessary duplication MUST be avoided.
- Business rules (for example the cancellation window, shipping rates, recommendation limits,
  gift point rules) MUST be configurable where practical rather than hard-coded.
- Important APIs, data models and architectural decisions MUST be documented.

## Architecture & Scope

The reference architecture is: User (Guest or Registered) -> User Login -> Home Page -> Browse ->
Add to Cart -> Payment Processing -> Shipment.

| Domain | Responsibilities |
|--------|------------------|
| Member | Guest/registered users, login and logout, roles and entitlements |
| Store | Stores, catalogs and store policies |
| Catalog | Browse by entitlement, category and brand; order-history-based recommendations; up-sell and cross-sell |
| Order | Create/modify order, checkout, confirm, cancel and return, order history, gift points and coupons |
| Payment | Gateway payment processing, refunds, payment confirmation, gift/wallet |
| Shipping | Shipping rate calculation, approximate delivery time, return shipment |

Scope guidance for the initial release:
- The goal is a workable, fully connected end-to-end project. Admin and back-office features
  (store, catalog and policy management) MAY be minimal, for example seeded data or a simple role
  check, as long as the Security First and Reliable Transactions principles are still met.
- Roles and entitlements MAY start with two roles (Guest, Registered Customer) plus a basic Admin
  role, and be extended later.
- The payment gateway MAY be a sandbox or mock implementation behind the Payment module
  interface so it can be replaced without changing other modules.
- The technology stack is not fixed by this constitution; it MUST be chosen in `/speckit-plan`
  and MUST satisfy the principles above.

## Development Workflow & Quality Gates

- Work follows the Spec Kit flow: constitution -> specify -> (clarify) -> plan -> tasks ->
  (analyze) -> implement.
- Each feature MUST have a spec, plan and task list under its feature folder before
  implementation begins.
- Changes touching authentication, payment, order, cancellation or customer data MUST include
  tests and MUST be reviewed against Principles I, IV and V.
- A change MUST NOT be merged while its tests fail or while it knowingly violates a principle,
  unless the exception is documented under Governance.
- Dependencies MUST be actively maintained, free of known critical/high vulnerabilities, and
  pinned with a lock file.

## Governance

- This constitution supersedes other practices. Where convenience conflicts with Security,
  Transaction integrity or customer data privacy, the latter MUST win.
- Amendments MUST be made through `/speckit-constitution`, with the change documented and the
  version updated.
- Versioning follows semantic versioning: MAJOR for removing or redefining principles, MINOR for
  adding or materially expanding principles or sections, PATCH for clarifications and wording.
- Specs, plans, tasks and reviews MUST verify compliance with this constitution. Any justified
  deviation MUST be recorded in the relevant plan with its rationale.

**Version**: 1.0.0 | **Ratified**: 2026-11-16 | **Last Amended**: 2026-11-16
