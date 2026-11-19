# Book Worm

An online bookstore built for the IBM AI Specialist capstone with Spec Kit (spec-driven development). Guests can browse and search 228 seeded books in 19 genres. Members can also keep a cart, wishlist and followed writers, check out with gift points and coupons, pay with a **mock** gateway, track shipments, cancel, return and buy again.

> **Payment is PARTIAL.** Only a temporary mock gateway exists. No real card, UPI or bank data is collected or stored. Six decisions are still **PENDING ADMIN APPROVAL**. See [documents/architecture-and-decisions.md](documents/architecture-and-decisions.md).

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router (JavaScript) |
| Backend | Node 24, Express 5, modular monolith (JavaScript) |
| Database | PostgreSQL via `pg`, plain parameterized SQL, numbered migrations (no ORM) |
| Tests | Vitest, Supertest, React Testing Library |

## Requirements

- Node 24 and npm 11
- A running PostgreSQL and an empty database (for example `bookworm`)

## Setup

1. **Install**
   ```
   cd backend
   npm install
   cd ../frontend
   npm install
   ```
2. **Configure the backend.** Copy `backend/.env.example` to `backend/.env` (git-ignored) and set:
   - `DATABASE_URL`: your own connection string for the empty database.
   - `SESSION_SECRET`: at least 32 random characters. Generate one with
     `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

   Never commit `.env`. Only the `.env.example` templates (placeholders) are committed. `frontend/.env.example` needs no change for local use.
3. **Prepare the database** (from `backend/`)
   ```
   npm run db:check      # confirms the connection
   npm run db:migrate    # applies migrations 001-007
   npm run db:covers     # generates local SVG book covers (no external images)
   npm run db:seed       # idempotent; safe to run twice
   ```
   The first seed run prints a generated password for each new sample member **once**. Copy the one you need; it is not stored anywhere in clear text. Sample members use `@example.com` addresses and one of them has the Admin role (used only for the shipment override).
4. **Run** (two terminals; both bind to 127.0.0.1 only)
   ```
   cd backend  && npm run dev      # http://127.0.0.1:4000
   cd frontend && npm run dev      # http://127.0.0.1:5173
   ```
   Open http://127.0.0.1:5173. The dev server proxies `/api` to the backend.

## Useful commands

| Where | Command | Purpose |
|-------|---------|---------|
| `backend/` | `npm test` | All backend tests (each run uses a throw-away database schema) |
| `backend/` | `npm run lint` | ESLint |
| `backend/` | `npm run db:rollback` | Roll back the latest migration |
| `frontend/` | `npm test` | Frontend tests |
| `frontend/` | `npm run lint` | oxlint |
| `frontend/` | `npm run build` | Production build |
| `frontend/` | `node scripts/browser-audit.mjs` | Accessibility and responsive audit in headless Edge or Chrome (needs both servers and a run-time `SMOKE_PW` variable; it creates an `audit8*@example.com` member to remove afterwards) |

## API documentation

With the backend running: `GET http://127.0.0.1:4000/api/openapi.yaml` (also at `/api/openapi.yaml` on the frontend dev server). The source is [specs/001-member-auth-catalogue/contracts/openapi.yaml](specs/001-member-auth-catalogue/contracts/openapi.yaml).

## Project layout

```
backend/    Express API: src/modules/{member,store,catalog,order,payment,shipping}, db/ (migrations, seed), tests/
frontend/   React app: src/{components,pages,context,lib}, tests/, scripts/
documents/  architecture-diagram.png (authoritative) and architecture-and-decisions.md
specs/      Spec Kit: spec.md, plan.md, tasks.md, data-model.md, quickstart.md, contracts/
```

The six backend modules mirror [documents/architecture-diagram.png](documents/architecture-diagram.png). The cart lives in Order, and the wishlist and followed writers live in Member.

## Spec Kit documents

[Constitution](.specify/memory/constitution.md), [spec](specs/001-member-auth-catalogue/spec.md), [plan](specs/001-member-auth-catalogue/plan.md), [tasks](specs/001-member-auth-catalogue/tasks.md) (with a report per phase), [data model](specs/001-member-auth-catalogue/data-model.md) and [quickstart](specs/001-member-auth-catalogue/quickstart.md) (39 validation scenarios).

## Security notes

- Passwords are bcrypt hashes. The session is a JWT in an httpOnly, sameSite cookie.
- All queries are parameterized, all input is validated on the server, and error responses are generic.
- Services bind to 127.0.0.1. No secrets, tokens or card data are logged or stored.
- `npm audit`: backend production dependencies show 0 findings. Both apps show 1 high finding in the dev toolchain (`picomatch` through Vite and Vitest, GHSA-fc5q-39xc-vjpf) with no patched version published yet. Re-check regularly.

## Delivery links

| Item | Link |
|------|------|
| GitHub pull request | _Not created yet. Add the link here._ |
| 3-minute demo video | _Not recorded yet. Add the link here._ |

A draft pull request description and a demo script are in [documents/pr-and-demo.md](documents/pr-and-demo.md).
