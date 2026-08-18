# Ecohygiene Operations

Internal operations platform for **Ecohygiene Company Limited** (Shinyanga, Tanzania) — field
service scheduling, chemical inventory, compliance certification, invoicing, and an isolated
portal for each client sub-company.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, Server Components, Server Actions) |
| Database | Turso / libSQL |
| ORM | Drizzle ORM |
| Auth | Session-based (scrypt password hashing, DB-backed sessions, httpOnly cookie) |
| UI | shadcn-style components on Radix primitives + Tailwind CSS |
| Charts | Recharts |
| Forms | react-hook-form-ready + zod validation in server actions |
| Notifications | Africa's Talking SMS via an outbox table |
| Deployment | Vercel (with Cron for reminders and overdue sweeps) |

## Getting started

```bash
npm install
cp .env.example .env.local     # leave TURSO_* unset to use a local SQLite file
npm run db:push                # create the schema
npm run db:seed                # demo data: 3 clients, 6 months of jobs, stock, invoices
npm run dev
```

Then sign in at <http://localhost:3000/login>. Every seeded account uses the password
`ecohygiene2024`:

| Role | Email |
|---|---|
| Super Admin | `allen@ecohygiene.co.tz` |
| Operations Manager | `ops@ecohygiene.co.tz` |
| Inventory Manager | `stores@ecohygiene.co.tz` |
| Finance / Accounts | `finance@ecohygiene.co.tz` |
| Site Supervisor | `supervisor@ecohygiene.co.tz` |
| Field Technician | `joseph@ecohygiene.co.tz` |
| Client Admin (Pepsi) | `admin@pepsi.example` |
| Client Viewer (Pepsi) | `viewer@pepsi.example` |

Signing in as a client account lands on that company's portal and nothing else — internal
routes redirect away, and their queries cannot reach another tenant's rows.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run db:generate` | Generate a SQL migration from the schema |
| `npm run db:push` | Apply the schema directly (dev) |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | Reset and reseed demo data |

## Environment

See `.env.example`. With no `TURSO_DATABASE_URL` set, the app uses `./local.db` so it runs
offline. In production set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; optionally set
`TURSO_REPLICA_PATH` to serve reads from an embedded replica (useful for the Shinyanga office's
uplink).

`CRON_SECRET` protects the two cron routes; Vercel sends it automatically as a bearer token.
SMS stays in dry-run mode until `NOTIFICATIONS_ENABLED=true` plus Africa's Talking credentials
are present.

## What's built

**Internal dashboard** (`/dashboard`, `/schedule`, `/jobs`, `/clients`, `/inventory`,
`/compliance`, `/incidents`, `/finance`, `/admin/*`)

- KPI overview with a needs-attention queue: overdue jobs, expiring certificates and contracts,
  stock below reorder level
- Week calendar with drag-to-reschedule, recurring job templates, crew assignment
- Job pipeline `scheduled → en route → in progress → completed → client signed-off`, with
  per-service checklists, photo evidence and sign-off capture
- Completing a job deducts the chemicals it consumed from stock and issues the compliance
  certificate its service type calls for
- Inventory ledger (every stock change is a movement row), suppliers, purchase-order approval
  flow, equipment location and maintenance
- Invoices generated from completed, unbilled jobs; payments, overdue sweep, revenue charts
- User management, a live role-permission matrix, and a full audit log

**Client portal** (`/portal/*`) — per-client overview, service history and job reports,
downloadable certificates, incidents, invoices, ad-hoc service requests, and a site switcher for
clients with multiple factories.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the tenant-isolation model, the RBAC
design, the job/stock/certificate flow, and the design-system decisions.

## Not yet built

Phase 4 items from the spec remain open: route optimisation, offline-first PWA for field crews,
WhatsApp Business integration, QR scan-to-log on equipment, and PDF rendering for certificates
(the records and expiry tracking exist; `certificates.pdf_url` is populated by whatever generator
you wire in). Photo upload currently takes a URL rather than performing the R2/Supabase upload —
the storage envs are stubbed in `.env.example`.
