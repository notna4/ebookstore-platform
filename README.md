# Book Worm — E-Bookstore Platform

Online bookstore built with **React 19**, **TypeScript**, **Vite** and the **IBM Carbon Design System** (`@carbon/react`, dark `g100` theme).

## Status

| Area                                                                                     | State                                                                                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Frontend (`frontend/`)                                                                   | Implemented. Runs against the backend (API mode) or on local demo data (demo mode)                             |
| PostgreSQL schema / data model (`database/`, [`docs/data-model.md`](docs/data-model.md)) | Done, verified against a real PostgreSQL engine                                                                |
| OpenAPI 3.1 spec (`api/openapi.yaml`)                                                    | Done, passes Redocly `recommended` lint                                                                        |
| Backend services (`backend/`)                                                            | Implemented: Express 5 + TypeScript REST API, local OpenID Connect server, simulated payment gateway, 81 tests |
| Deployment                                                                               | Local only (see below)                                                                                         |

## Run everything locally

Prerequisites: Node.js 22 or newer. No PostgreSQL install is needed: `db:dev` serves an embedded PostgreSQL-compatible database (PGlite) on `127.0.0.1:5432`. Everything binds to `127.0.0.1` only.

```bash
# 1. Backend configuration (one time). Set IDP_DEMO_PASSWORD to a password of your choice.
cd backend
npm install
cp .env.example .env.local        # then edit IDP_DEMO_PASSWORD

# 2. Start the three backend processes, each in its own terminal (from backend/)
npm run db:dev                    # database, loads database/schema.sql and seed.sql on first start
npm run idp                       # local OpenID Connect server  http://127.0.0.1:9000
npm start                         # REST API                     http://127.0.0.1:8080/api/v1

# 3. Frontend, in a fourth terminal
cd frontend
npm install
cp .env.example .env.local        # points the app at the API and the identity provider
npm run dev                       # http://127.0.0.1:5173
```

Sign in with `maria.popescu@example.com` or `andrei.ionescu@example.com` and the `IDP_DEMO_PASSWORD` you chose. The first sign-in creates the account with a 200 RON wallet and 50 gift points.

Without `frontend/.env.local` (or with an empty `VITE_API_URL`) the frontend runs in **demo mode**: simulated login and payments with data saved in `localStorage`, no backend needed.

To start from a clean database, stop `db:dev` and delete `backend/.data/pgdata`.

## Tests and checks

```bash
cd backend  && npm run typecheck && npm test     # 81 tests, in-process database
cd frontend && npm run typecheck && npm test     # 45 tests, demo mode
cd frontend && npm run build
```

## Use-case coverage

| #     | Step                                                                        | Where                                      |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------ |
| 1–2   | Login with OpenID Connect (local server); demo mode uses a client-side form | `AuthCallback`, `LoginModal`, header       |
| 3–5   | Catalogue, 20 categories, search + language/format/price/sort filters       | `HomePage`, `FilterBar`, `CategorySidebar` |
| 6     | Browse writers/brands                                                       | `WritersPage` (`/writers`)                 |
| 7     | Product page with delivery date, reviews, related reads                     | `BookPage` (`/book/:id`)                   |
| 8     | Add to basket, history-based recommendations                                | `BookActions`, `CheckoutPage`              |
| 9     | Delivery address (new or saved)                                             | `AddressForm`                              |
| 10    | Payment (card, cash on delivery, wallet), coupon + gift points              | `PaymentModal`, `OrderSummary`             |
| 11–12 | Payment + purchase confirmation                                             | `PaymentModal`, `ConfirmationModal`        |
| —     | Order history, **Buy It Again**, 48-hour cancellation                       | `OrdersPage`                               |

## Database and API contract

```bash
psql bookworm -v ON_ERROR_STOP=1 -f database/schema.sql -f database/seed.sql   # only with your own PostgreSQL 16+
npx @redocly/cli lint api/openapi.yaml
```

`database/seed.sql` is generated from the frontend mock catalogue (`node database/generate-seed.mjs > database/seed.sql`).

## Structure

```
frontend/src
├── components/   reusable UI (BookCard, BookCover, FilterBar, PaymentModal, …)
├── pages/        route components
├── lib/          pure logic: pricing, catalogue filters/recommendations, validation, formatting
├── api/          REST client, OpenID Connect, API-backed checkout
├── store/        reducer + demo store (localStorage) + API store + UI context
├── data/         catalogue (authors, categories, books)
└── styles/       single shared Carbon-based SCSS

backend/src       Express API (routes/, orders, pricing, auth), idp/ (local OpenID Connect server), dev-db
database/         schema.sql, seed.sql      api/  openapi.yaml      docs/  data-model.md
```

## Notes

- **Authentication:** the API accepts only access tokens issued by the OpenID Connect server in `OIDC_ISSUER` (signature, issuer, audience and expiry are checked). Locally that is `backend/src/idp/server.ts` (`node-oidc-provider`, authorization code flow with PKCE, demo users). To use a real provider, change `OIDC_ISSUER`, `OIDC_AUDIENCE` and the frontend `VITE_OIDC_*` values.
- **Payments are simulated.** The browser exchanges card details for a token and only the token reaches the API. The simulated gateway declines the test card `4000 0000 0000 0002`; any other card, such as `4111 1111 1111 1111` with a future expiry (`MM/YYYY`) and any 3-digit CVV, succeeds. A declined payment keeps the order unpaid so you can retry or choose another method. Unpaid orders expire after 30 minutes.
- **Transport security:** the local setup uses plain HTTP on the loopback interface only, which is a documented development exception. To enable TLS 1.2+, set `TLS_KEY_FILE` and `TLS_CERT_FILE` (PEM) in `backend/.env.local` and use `https://` URLs. Secrets come from environment variables; `.env.local` and `backend/.data/` are git-ignored.
- **Known gap:** the catalogue (books and writers) is bundled in the frontend, identical to `database/seed.sql`. The backend catalogue endpoints exist and are tested but the UI does not call them yet. Cart, wishlist, followed writers, addresses, wallet, gift points, reviews and orders do go through the API in API mode.
- The interface text is English. Currency is RON; prices include 11% VAT (TVA) on top of the book price. Delivery is 15 RON, free from 100 RON and for eBooks. Cash on delivery (ramburs) is available. Addresses use county (județ), a 6-digit postal code and a `+40` phone with 9 national digits.
- Coupons: `BOOKWORM20` (20 RON off orders ≥ 80 RON), `READ10` (10% off, max 30 RON). Gift points: 1 point = 1 RON; 1 point earned per 10 RON paid. Cancelling within 48 hours refunds the wallet and restores redeemed points.
- In demo mode two past orders are seeded so "Buy It Again" and recommendations work immediately.
- The header has a light/dark theme toggle (saved in `localStorage`, `bookworm:theme`).
