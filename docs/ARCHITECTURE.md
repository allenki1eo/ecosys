# Architecture

How the Ecohygiene operations platform is put together, and why.

---

## 1. Two audiences, one codebase

The system serves Ecohygiene staff and their clients from the same deployment, separated by
route group:

```
src/app/
├── (auth)/login/          public
├── (internal)/            Ecohygiene staff  — requireStaff()
│   ├── dashboard, schedule, jobs, clients,
│   ├── inventory, compliance, incidents, finance
│   └── admin/{users,settings}
├── (portal)/portal/       client sub-companies — requireClientUser()
├── profile/               either audience
└── api/cron/              scheduled jobs, bearer-token protected
```

Each group's `layout.tsx` calls its guard first, so a client user who types `/inventory` is
redirected to `/portal` before any page code runs, and a staff member who types `/portal` is sent
back to `/dashboard`.

## 2. Tenant isolation

> Every client-facing query is scoped by `client_id` at the repository layer — never by hiding
> things in the UI.

The mechanism is a `Scope` value (`src/lib/data/scope.ts`) built from the session and threaded
explicitly through every repository call:

```ts
type Scope = {
  userId: string;
  role: UserRole;
  clientId: string | null;   // non-null ONLY for client-portal users
  permissions: Set<string>;
};
```

Three rules keep it honest:

1. **List queries** call `tenantFilter(table.clientId, scope)` and spread the result into
   `and(...)`. It returns `eq(column, scope.clientId)` for portal users and `undefined` for
   staff — and `and()` ignores `undefined`, so staff queries stay unfiltered while a portal query
   physically cannot omit the predicate.
2. **Single-record reads** pass their row through `assertTenant(scope, row, entity)`, which
   throws `TenantIsolationError` if the row belongs to another client. This is what stops a
   portal user from fetching another company's job by guessing its id — verified: a Pepsi user
   requesting a Sayona job id gets a 404, not the record.
3. **Internal-only modules** (`data/inventory.ts`) call `assertInternal(scope)` on every entry
   point, so client portals can never reach cost, margin or stock data at all.

`jobs`, `incidents`, `certificates` and `invoices` all carry a denormalised `client_id` (mirroring
`sites.client_id`) so scoping is a single indexed predicate rather than a join chain.

## 3. Auth & RBAC

**Sessions.** Passwords are scrypt-hashed with a per-password salt (`scrypt$salt$hash`). A
successful sign-in inserts a `sessions` row and sets an opaque, `httpOnly`, `sameSite=lax`
cookie. `getCurrentUser()` is wrapped in React's `cache()`, so the dozen server components on a
page share one round trip. Sessions slide: within 15 days of expiry they are extended, which
keeps field devices signed in.

**Permissions** resolve in three layers (`src/lib/auth/permissions.ts`):

```
ROLE_DEFAULTS[role]                 hard-coded baseline in the repo
  ⟶ overlaid with role_permissions  Super Admin's per-role switches (Settings → Permissions)
  ⟶ overlaid with users.permissions_json   per-user exceptions
  = the effective Set<string> on the session
```

That is what makes "toggle *Inventory Manager can approve purchase orders* on/off" a database
write rather than a deploy. Server actions all start with `withScope("some.permission")`, which
throws before any repository call; pages additionally use the permission set to decide what to
render, and `visibleNav()` filters the sidebar so users are not shown doors they cannot open.

Enforcement is defence-in-depth: navigation hiding, page-level checks, action-level checks, and
repository-level checks are independent. Removing any one of them does not open a hole.

## 4. Data model notes

Schema lives in `drizzle/schema.ts` (single file, matching the spec).

- **IDs** are prefixed random strings (`job_…`, `cli_…`) generated in the app, so records can be
  created on a technician's device offline and synced later without id collisions. Human-facing
  references (`JOB-0042`, `CERT-8F2K`) are separate short codes crews can read over the radio.
- **Money** is stored as whole Tanzanian Shillings in `integer` columns — TZS has no minor unit
  in practice, and floats have no business near money. **Quantities** are `real` because
  chemicals are measured in litres and kilograms.
- **Timestamps** are unix-ms integers via Drizzle's `timestamp_ms` mode.
- **`inventory_movements` is an append-only ledger.** `inventory_items.quantity_on_hand` is a
  materialised running total; both are written together by `recordMovement()`, which is the only
  supported way to change stock. The two can therefore always be reconciled.
- **Checklists are snapshotted onto the job** at creation time, so editing a service type later
  never rewrites the checklist a crew already worked through.

## 5. The job → stock → certificate → invoice flow

This is the spine of the system:

```
create job          checklist copied from the service type; crew assigned
   ↓
en route / start    technician's mobile view; checklist ticked as they go
   ↓
complete            ├─ writes inventory_movements + decrements stock for chemicals used
                    ├─ issues a certificate if the service type certifies (with expiry)
                    └─ records a client-visible report summary
   ↓
client sign-off     name captured on site; signature URL optional
   ↓
invoice             generateInvoiceFromJobs() sweeps completed, unbilled jobs into a draft
                    invoice, one line per job, priced from the service type's default rate
```

`advanceJobStatus()` validates transitions against an explicit `STATUS_FLOW` map, so a job cannot
skip from `scheduled` to `signed_off`.

## 6. Notifications

SMS and email go through an outbox (`notifications` table): the row is written synchronously, and
delivery is attempted after. A failed Africa's Talking call therefore never loses a reminder, and
ops can see exactly what was sent to whom. `/api/cron/reminders` (hourly on Vercel Cron) queues
reminders for jobs in the next 24 hours — one per assigned crew member plus the site contact —
and flushes the queue. Delivery stays in dry-run mode unless `NOTIFICATIONS_ENABLED=true`.

## 7. Design system

The target is a premium internal tool — Vercel dashboard, Linear, Cal.com — not a marketing site.

- **Neutral base, accent-only brand.** Zinc greys carry the interface; Ecohygiene's green and
  blue appear only on buttons, active nav states, badges and charts. No large colour blocks.
- **Dark mode is the default.** The theme class is set by an inline script in `<head>` before
  hydration, so there is no light flash; users can switch to light or system.
- **Geist Sans for UI, Geist Mono for data.** The `.font-data` utility (mono + tabular numerals)
  is used for every reference, quantity and amount, so columns of numbers line up.
- **Density.** Compact tables (`.table-dense`); whitespace is spent on page headers, not rows.
- **Sheets over page navigation** for quick create/edit, so you keep your place in the calendar
  or table you were reading.
- **Skeletons, never spinners** — the shape of the page is known before its data, so the layout
  does not jump. Empty states are written deliberately: what would be here, and the one action
  that fills it.

### Chart colours are validated, not eyeballed

The five categorical series colours in `globals.css` are chosen per mode, not flipped, and both
sets pass the six standard checks — OKLCH lightness band, chroma floor, colour-vision-deficiency
separation on adjacent pairs, normal-vision separation, and ≥ 3:1 contrast against their own
surface:

| Slot | Light | Dark |
|---|---|---|
| 1 | `hsl(152 55% 38%)` | `hsl(152 48% 43.5%)` |
| 2 | `hsl(205 75% 45%)` | `hsl(205 72% 49.5%)` |
| 3 | `hsl(43 84% 38%)` | `hsl(43 80% 40.5%)` |
| 4 | `hsl(262 52% 55%)` | `hsl(262 55% 62%)` |
| 5 | `hsl(12 72% 52%)` | `hsl(12 70% 53.5%)` |

Series are assigned in fixed order and never cycled. Composition is drawn as a stacked bar rather
than a pie — lengths compare, angles do not — and no chart uses two y-axes.

## 8. Server/client boundary

Repository modules import `server-only`, so a client component that reaches for one fails the
build rather than leaking database code into the browser bundle. Two consequences worth knowing:

- Shared display labels live in `src/lib/labels.ts`, not in the repository modules.
- React components (Lucide icons included) cannot cross the RSC boundary as props. The server
  filters navigation by permission and passes the **hrefs**; `AppSidebar` imports the nav
  definition itself and resolves the icons client-side.

## 9. Testing the isolation yourself

```bash
npm run db:seed && npm run build && npm start
```

Sign in as `admin@pepsi.example`, copy a job id from the Sayona portal (or the internal
dashboard), and request `/portal/services/<that-id>` — it returns *Not found*, because
`assertTenant` rejected it in the repository, not because a template hid it.
