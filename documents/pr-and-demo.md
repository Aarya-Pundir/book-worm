# Pull Request and Demo Kit

Use this to open the GitHub pull request and record the 3-minute demo. When both exist, paste the links into the "Delivery links" table in [README.md](../README.md).

## 1. Before opening the pull request

The repository has no commits and no remote yet. Check each item first.

1. `git status` shows no `.env` file, no `node_modules`, no `dist` and no `coverage` folder. Only `.env.example` templates may appear.
2. Backend: `npm run lint` and `npm test` pass. Frontend: `npm run lint`, `npm test` and `npm run build` pass.
3. Run `npm audit` in both apps and note the result (see the open `picomatch` item in the README).
4. Create the GitHub repository, add it as `origin`, then commit on a branch named `001-member-auth-catalogue` and open a pull request into the default branch (the local branch is `master`).

## 2. Draft pull request

**Title:** Book Worm: member, catalogue, cart, order, payment (mock) and shipping

**Description**

Implements the Book Worm online bookstore with Spec Kit, in nine phases (plus 7.5). The six backend modules follow `documents/architecture-diagram.png`, which was not changed.

What is included
- Member sign-up and sign-in (email or mobile), roles, wishlist and followed writers
- Catalogue: 20 genre options, search, filters, sort, paging, authors, publishers, details, recommendations
- Cart (guest and member, merged on sign-in), addresses, shipping charge and estimate, coupons, gift points
- Checkout and idempotent payment through a **mock** gateway; orders, 48-hour cancellation with refund, returns, Buy Again, timed shipment tracking
- OpenAPI description at `/api/openapi.yaml`; accessibility and responsive pass with an automated browser audit

Not decided yet (PENDING ADMIN APPROVAL, unchanged): Brand vs Publisher, single vs multiple categories, admin roles and permissions, store responsibilities, inventory rules, payment provider and lifecycle. **Payment is PARTIAL (mock only)**: FR-072..FR-080, SC-014, SC-015, SC-015a and SC-021 are not fully satisfied.

How it was checked
- Backend: lint clean, 214 tests pass, about 95% statement coverage
- Frontend: lint clean, 95 tests pass, production build OK
- Browser audit: 9 pages at 375, 768 and 1280 px and both dialogs, 0 axe-core issues
- `npm audit`: backend production 0. One high advisory in the dev toolchain of both apps (`picomatch` ReDoS, GHSA-fc5q-39xc-vjpf) with no patched release yet

Security notes: no secrets committed (`.env.example` only), services bind to 127.0.0.1, parameterized SQL, generic errors, no card data stored.

Where to look: [README](../README.md), [architecture and decisions](architecture-and-decisions.md), [tasks.md](../specs/001-member-auth-catalogue/tasks.md) (a report per phase), [quickstart.md](../specs/001-member-auth-catalogue/quickstart.md).

Reviewer checklist
- [ ] No secrets or `.env` files in the diff
- [ ] The six pending items and the PARTIAL payment status are stated, not hidden
- [ ] Tests and lint pass locally

## 3. Three-minute demo script

Setup before recording: both servers running, database seeded, one sample member password copied from the seed output, browser at 1280 px wide, a second window at phone width ready. Do not show `.env` or any password on screen.

| Time | Show | Say |
|------|------|-----|
| 0:00-0:15 | README top and the architecture diagram | One line on what Book Worm is; six modules from the diagram; payment is a mock and six items await Admin approval |
| 0:15-0:45 | Home page as a guest; click a genre; search; apply a filter and a sort | Guests browse freely; filtering is done by the server |
| 0:45-1:00 | Open a book; add it to the cart as a guest | Guest cart works without an account |
| 1:00-1:20 | Sign in with a sample member; cart merges; add a book to the wishlist; follow a writer | Cart survives sign-in; wishlist and writers belong to the member |
| 1:20-2:00 | Checkout: address, shipping and estimated date, coupon `WELCOME10`, gift points, pay by UPI with the mock | Prices are computed on the server; the date is an estimate; no card data is collected |
| 2:00-2:30 | My Orders: open the new order, show tracking; cancel it and show the refund | 48-hour cancellation goes through the payment module |
| 2:30-2:45 | Phone-width window and the keyboard: Tab through the login dialog | Responsive; keyboard and focus work |
| 2:45-3:00 | Terminal: test results, then `/api/openapi.yaml` | 214 backend and 95 frontend tests pass; the API is documented; payment stays PARTIAL |

Tips: practise once, keep each step short, and cut anything that runs over three minutes. If a step fails live, show the test results instead of retrying.
