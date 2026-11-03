# Rotaract WWCB Charity Transparency Platform

A runnable MVP for the Rotaract Club of World Without Childhood Blindness. It includes a public storytelling website, admin-only management portal, admin-created private donor accounts, manual donation entry, expense records, proportional donor attribution, community inbox, editable public content and an audit log.

## Stack
- React + Vite, responsive custom UI, scroll reveal animations and reduced-motion support
- Node.js + Express REST API
- PostgreSQL database
- bcrypt password hashing, short-lived signed JWT in HttpOnly cookie, server-side role checks, Helmet, rate limiting and input validation

## Prerequisites
- Node.js 20+
- PostgreSQL 14+

## Local setup
1. Create a PostgreSQL database, for example `wwcb_platform`.
2. Copy `.env.example` to `server/.env` (or place `.env` at the repository root and load it from server execution). Recommended: create `server/.env` and copy the values from `.env.example` there.
3. Set `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters, and a strong `ADMIN_PASSWORD` (12+ characters). Change the default admin email and password before running.
4. Install dependencies and initialise data:

```bash
npm install
cd server && npm install
cp ../.env.example .env
# Edit server/.env with your actual database credentials and secrets
npm run db:init
npm run db:seed
cd ../client && npm install
cd ..
npm run dev
```

The API runs at `http://localhost:4000` and the frontend at `http://localhost:5173`.

**Environment note:** the server loads `server/.env` when started from the `server` directory. The root `npm run dev` starts the API with the server directory as its working directory through npm. For database scripts, run them from `server` as shown.

## First admin login
Use the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values set in `server/.env`. The seed script creates an admin only if that email is not already in the database. It never resets an existing admin password. Keep production credentials out of source control.

## Core workflows
### Admin
- Overview: reporting-year totals and basic reconciliation warning.
- Donors: create accounts with admin-issued passwords and disable/restore access.
- Donations: manually record a donor, amount, date, reference and reporting year.
- Expenses: record category, amount, date, receipt reference and status. Only approved expenses count toward attribution.
- Website content: edit JSON-backed content sections (`brand`, `programmes`, `leadership`, `stories`, `partners`, `gallery`, `impact`).
- Inbox: review public feedback and update status.
- Activity log: view recent logged administrative actions.

### Donor
- Admin-created accounts only. Donors cannot register themselves.
- A donor sees only their own contributions and statement, plus category-level proportional attribution for the selected reporting year.

### Public
- Public pages are readable without login.
- The contact form supports feedback, complaints, volunteer enquiries and partnership enquiries.
- Public transparency API exposes aggregate totals and approved category expenses only, never donor identities or individual statements.

## Attribution model
For a selected reporting period:
- `D_total = sum(donations)`
- `W_i = donor_contribution / D_total`
- `Attributed_i,k = W_i * approved_expense_k`
- `Remaining_pool = D_total - total_approved_expenses`
- `Donor_remaining_i = W_i * Remaining_pool`

The API currently reports a negative remaining balance if approved spending exceeds recorded donations in the admin overview, and marks reconciliation as false. Donor statement remaining share is clamped to zero in this MVP so a negative balance is not presented as a positive donor balance. This does **not** replace accounting policy for opening balances, restricted gifts, refunds, in-kind contributions, or multi-period funds. Confirm those rules with the club before real-world reporting. The attribution represents a proportional allocation, not tracing physical currency to a particular expense.

## API summary
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/public/content`, `GET /api/public/transparency`, `POST /api/public/feedback`
- `GET /api/donor/statement` (donor role only)
- Admin endpoints under `/api/admin/*` for overview, donors, donations, expenses, content, feedback and audit.

## Production deployment outline
1. Provision managed PostgreSQL (Neon or Supabase are options) and run `npm run db:init` from `server` against its connection string.
2. Deploy the Express API to Render, Railway or another Node host. Set `NODE_ENV=production`, `CLIENT_ORIGIN` to the exact frontend origin, `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECURE=true`, and admin seed variables. Use HTTPS.
3. Deploy `client` to Vercel or another static hosting provider. Set `VITE_API_URL` to the deployed API base plus `/api` (e.g. `https://api.example.org/api`) and build with `npm run build`.
4. Run the admin seed once. Do not publish seed credentials; change the admin password through a controlled operational process before inviting users.
5. Ensure the API and frontend share a compatible cookie domain/origin arrangement. If frontend and API are on different sites, cookie policy may need `SameSite=None; Secure` plus a CSRF defence. Do not simply loosen cookie settings without adding CSRF protection.
6. Configure backups, monitoring, log retention, database access restrictions and a process for restoring access. Add automated tests and review before storing real donor data.

## Important MVP limitations
- The JSON content editor is intended for administrators comfortable editing structured content. A field-based CMS editor is a sensible next iteration.
- Receipt references are stored as text URLs/notes. Production should use private object storage with signed links and upload scanning.
- PDF generation, email invitations/password reset, password change, CSRF tokens, multi-factor authentication, donation editing/void workflows, and automated reconciliation tests are not implemented yet.
- This MVP uses a signed cookie session with an eight-hour expiry. For production, implement CSRF protection and account recovery, add tests, and conduct a security review before using actual financial data.
- Public aggregate figures come from recorded ledger rows. They should not be represented as audited accounts unless the club has verified and approved them.

## Deployment notes
`server/.env` and `client/.env` are not committed. `client/.env.example` is optional and only needed when the API is hosted away from localhost.
