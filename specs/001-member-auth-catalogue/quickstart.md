# Quickstart: Validating Phases 1-8

Run these once each phase is built. They describe checks, not implementation.

## Prerequisites

- Node 24, npm 11, a running PostgreSQL instance and an empty database for Book Worm.
- Copy `backend/.env.example` to `backend/.env` (git-ignored) and set the database URL and a long random session secret.

## Setup (commands will be fixed by tasks.md)

1. Install dependencies in `backend/` and `frontend/`.
2. Apply database migrations, then run the seed. Run the seed a second time to confirm no duplicates.
3. Start the backend on 127.0.0.1:4000 and the frontend dev server on 127.0.0.1:5173.

## Validation Scenarios

| # | Scenario | Expected result | Spec |
|---|----------|-----------------|------|
| 1 | Open `/api/health` | 200 OK; frontend shows it can reach the API | Phase 1 |
| 2 | Run seed twice; count categories and books | 19 stored genres (+ UI-only All = 20 options); same counts both times | FR-042, SC-005, SC-012 |
| 3 | Register, sign out, sign in by email, sign out, sign in by mobile | All succeed; duplicate registration rejected; wrong password gives a generic message | US3 |
| 4 | Call `/api/members/me` without signing in | 401 | FR-012, FR-013 |
| 5 | Continue as Guest, open home page | Three sections with real books; "All" highlighted | US1, US4 |
| 6 | Select each of the 20 genres | Only that genre's books; empty state if none; no page reload | FR-021..FR-027 |
| 7 | Combine genre + language + format + price + search + sort + page 2 | Every result meets all criteria | US2, SC-006 |
| 8 | Open a book, then an unknown book id | Details shown; unknown id shows not-found message | US5 |
| 9 | Recommended for You as guest, member without orders, member with seeded orders | Popular (not "personalised"), popular, order-based | US4 |
| 10 | Click Wishlist / Writers | Superseded in Phase 7.5: guests are asked to sign in; see scenarios 28-35 | US7 |
| 11 | As a guest add a book twice, change its quantity, remove it, add another, then sign in | Cart header count updates; totals are server-calculated; the guest item is still there after sign-in | US8, FR-047, FR-051 |
| 12 | Ask for more copies than are in stock; change a price or stock in the database and reopen the cart | Quantity limited with a message; price or availability change is warned about; unavailable books cannot be bought | FR-049, FR-050 |
| 13 | Sign in, save an address with PIN 012345, then with a valid PIN; open checkout | PIN rejected with a message; valid address saved; checkout shows an estimated delivery date labelled as an estimate, the shipping charge and the total | US9, FR-053..FR-060 |
| 14 | Pay with Card, UPI and Net Banking (mock); press the pay button twice quickly | Order Confirmed once with an order number and payment reference; cart emptied; one payment only | US10, SC-014, SC-015 |
| 15 | Use the test-mode decline option, then retry | Order stays unconfirmed with a clear message; stock, coupon and points are given back; retry works without re-entering the cart | FR-075 |
| 16 | Pay Cash on Delivery for physical books, then try it for an eBook or a mixed cart | Confirmed after accepting the terms, shown as Pay on Delivery - Pending; refused for eBooks and mixed carts | FR-072a, SC-015a |
| 17 | Apply an expired coupon, a valid coupon and gift points | Clear rejection message; discount and points shown in the total; ledger entry created; balance never negative | FR-078, FR-079 |
| 18 | Send a payment request containing a card number | 400, value not echoed, nothing stored | FR-073, SC-021 |
| 19 | As another member, open someone else's order or payment | 404 | FR-071, SC-020 |
| 20 | Open My Orders after two purchases | Both listed, newest first, with status, date, items and total; another member never sees them | US11, FR-063 |
| 21 | Open an order before and after dispatch | Before: "Estimated delivery" labelled as an estimate. After: a confirmed date and a tracking reference | FR-064, SC-018 |
| 22 | Cancel a Confirmed order inside the window; try again, and try an order past 48 hours or already dispatched | Cancelled once, stock, coupon and points returned, refund status shown. The others are declined with a clear reason | FR-065, FR-066, SC-016 |
| 23 | Call the admin shipment override as a guest, a member and an admin | 401, 403, then success. Forward only; a cancelled order cannot be dispatched; the change shows in the shipment history | FR-059a |
| 24 | Let an order reach Delivered (timers or admin override) | Gift points earned once and in the ledger; Cash on Delivery payment becomes Paid | FR-078, FR-072a |
| 25 | Return a delivered order, then let the return be Received | Return shipment shown; refund only after the books are received; the refund status is visible | FR-067, FR-077 |
| 26 | Press Buy again on an old order, including a book that is now unavailable | Available books added at today's price, unavailable ones listed | US12, FR-068 |
| 27 | Run backend and frontend test suites | All pass | Constitution VII |
| 28 | As a guest press Add to wishlist, then open My Wishlist and My Writers | Asked to sign in; nothing is saved; direct calls return 401 | FR-081, SC-022 |
| 29 | Sign in, add a book to the wishlist twice, add an out-of-stock book, sign out and in | One entry per book; the out-of-stock book is labelled unavailable; the same list returns after sign-in | FR-082, FR-083, SC-023 |
| 30 | Deactivate a wishlisted book in the database and open My Wishlist | The book stays, shows only title, cover and "No longer available"; no price, authors or stock; it can be removed | FR-084, SC-024 |
| 31 | Press Add to cart on a wishlist book, then Add all available | Available books go to the cart at today's price and stay on the wishlist; unavailable ones are listed with reasons and never fail the request | FR-086, SC-024 |
| 32 | Open a book, press Follow, open My Writers, then Unfollow | Writer appears with their active book count, newest first; unfollowing removes it; repeating either is harmless | FR-087, FR-088 |
| 33 | Open a writer page as a guest and as a member | Public name and books for both; the member also sees Follow or Following; an unknown writer shows not found | FR-089 |
| 34 | Sign in as a second member and open both lists | Never sees the first member's wishlist or followed writers; cannot change them | FR-090, SC-022 |
| 35 | Wishlist a book, add it to the cart, check out and pay with the mock gateway | Normal checkout rules apply; the book stays on the wishlist (Payment remains PARTIAL, mock only) | FR-086, SC-025 |
| 36 | Open `GET /api/openapi.yaml` (also through the Vite proxy) | 200 with the API description as YAML; no secrets in it; no card fields described | FR-080, T074 |
| 37 | POST a JSON body of about 200 KB to `/api/auth/login` | 413 `PAYLOAD_TOO_LARGE` "Request is too large"; never a 500 | T072 |
| 38 | Open Login and Register dialogs; press Tab, Shift+Tab and Escape | Focus stays inside the dialog; Escape closes it and focus returns to the Login button | T073 |
| 39 | With both servers running, run `$env:SMOKE_PW="<a password you choose>"; node scripts/browser-audit.mjs` in `frontend/` (needs Edge or Chrome) | 9 pages at 375, 768 and 1280 px and both dialogs: 0 axe-core WCAG 2 A/AA violations, no sideways scroll, all controls reachable by keyboard. It creates an `audit8*@example.com` member; remove it afterwards | T073 |

References: [contracts/openapi.yaml](contracts/openapi.yaml), [data-model.md](data-model.md).
