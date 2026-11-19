# Research: Book Worm

All items below were resolved without needing further clarification.

| Topic | Decision | Rationale | Alternatives considered |
|-------|----------|-----------|-------------------------|
| Language | JavaScript (ES modules) on Node 24 | Required by the approved stack; no TypeScript | TypeScript (rejected: explicitly not wanted) |
| Frontend | React 19 + Vite 8 + Tailwind CSS 4 | Approved stack; Tailwind suits the dark theme and responsive layout | CSS modules, MUI |
| Backend | Express 5 | Approved stack; native async error handling in v5 | Fastify, NestJS |
| Database access | `pg` driver, hand-written parameterized SQL and numbered SQL migrations (no ORM). Prisma removed 2026-11-16 because the project uses the PostgreSQL already installed locally and no Prisma | Simple, no extra tooling; parameterized queries meet the constitution | Prisma, Knex |
| Database | PostgreSQL 18 (already running locally) | Approved; supports full-text/ILIKE and transactions needed for stock and payments | SQLite |
| Auth | JWT stored in an httpOnly, sameSite cookie; bcrypt (cost 12) | Meets constitution session rules; avoids token theft via script access | JWT in localStorage (rejected: XSS risk), server sessions |
| Validation | zod schemas in middleware | One place for server-side validation; consistent error shape | express-validator, Joi |
| Search | Case-insensitive partial match on title and author name (ILIKE), indexes on foreign keys and price/date | Sufficient for 200-1000 books; upgrade to trigram index later if needed | Full-text search engine |
| Recommendations | Genres/authors of the member's own past order lines, excluding already bought, fallback to popular | Meets FR-018/FR-019; no cross-customer data used | Collaborative filtering (rejected: leaks and over-scope) |
| Popularity / bestsellers | `popularityScore` on Book plus order counts in last 30 days | Works before real orders exist | Pure order counts |
| Payment | Temporary mock gateway behind a swappable `PaymentGateway` interface; idempotency key unique per attempt. Provider and lifecycle remain PENDING ADMIN APPROVAL and payment requirements are not marked fully satisfied | Constitution allows sandbox; swap later | Real provider (pending admin approval) |
| Secrets | Git-ignored `.env` files; committed `.env.example` templates with placeholder values only | Constitution section 4 | Committed config files |
| Architecture | `documents/architecture-diagram.png` is authoritative; module folders mirror it (member, store, catalog, order, payment, shipping) | Admin instruction | Redesign (needs Admin approval) |
| Shipment status | In-process timer job with configurable delays plus Admin-only override endpoint | Clarification Q1 | External scheduler |
| API docs | OpenAPI 3.1 file served by swagger-ui-express | Required by the project | Auto-generated docs |
| Logging | pino structured JSON logs; passwords, tokens and card data redacted | Constitution section on logging | console.log |
| Security headers / limits | helmet, express-rate-limit on login/register | Meets FR-007 and constitution | None |
| Testing | Vitest everywhere; Supertest for API; React Testing Library for UI | Approved stack | Jest |
| Network binding | `127.0.0.1` for backend and Vite dev server | Constitution network rule | 0.0.0.0 |

