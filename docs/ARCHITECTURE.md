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
ops can see exactly what was sent to whom. `/api/cron/reminders` queues reminders for jobs in the
next 24 hours — one per assigned crew member plus the site contact — and flushes the queue.
Delivery stays in dry-run mode unless `NOTIFICATIONS_ENABLED=true`.

**The sweep runs once a day** (05:00 UTC / 08:00 EAT, before crews head out), because its window
*is* 24 hours: running it hourly would queue the same reminder ~24 times per job. It is also
idempotent — `alreadyQueued()` skips any job/template/recipient combination already in the outbox
— so a manual trigger, a retry or a cron misfire cannot double-send.

This also keeps the project inside Vercel's Hobby plan, which permits at most one run per day per
cron. On Pro you could raise the frequency, but there is no reason to: narrow the lookahead
window first if you want reminders closer to the visit.

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

## 8. Where stock is held

`inventory_movements.site_id` names the location a movement affects, with NULL meaning the central
warehouse. The balance held anywhere is the sum of that location's deltas, and
`inventoryItems.quantityOnHand` is the company-wide total across every location. Nothing stores a
per-site balance: a second running total is a second number to drift.

Two rules keep the ledger honest:

- **A transfer writes two rows** — out of the source, into the destination. Moving a drum from the
  warehouse to a client's chemical store changes *where* stock is without changing how much the
  company holds, so the total is untouched. Writing one row made the totals drift every time stock
  was deployed.
- **Job usage draws from wherever the stock actually sits.** Some clients keep our chemicals in
  their own store, so the crew draws that site down; elsewhere the crew carries drums from the
  warehouse and the job site never holds stock at all. Charging every job to its own site drove
  those sites permanently negative.

Seeded data satisfies the same invariant: opening stock is booked in as a movement rather than set
on the item, and every item's total is recomputed from its ledger once the movements are written.
The result reconciles exactly — no item whose total differs from its ledger, and no negative
balance anywhere.

## 9. Payroll

Employees live in their own table rather than in `users`: the two sets only partly overlap — a
technician has both, a cleaner may have payroll and no login, a client contact has a login and no
payroll.

**Payslips snapshot their employee.** Name, designation, bank account and salary are copied onto
the payslip when the run is created, not joined at read time. A payslip is a statement of what was
paid on a date; giving someone a raise next month must not change what last month's payslip says.

**Rates snapshot onto the run.** `payrollRuns.ratesJson` holds the NSSF, SDL, WCF and PAYE bands in
force when the run was created, for the same reason.

**PAYE is assessed on gross pay less the employee's NSSF contribution** — a pension contribution is
not taxable income — and the bands are progressive, so each one taxes only the slice of income
inside it. The rest of `src/lib/payroll/calculate.ts` reproduces the company's existing spreadsheet
to the shilling; that sheet banded PAYE on gross, which taxes the NSSF deduction and comes out
slightly high.

Where a month's figure has to match a return filed elsewhere exactly, `payslips.paye_override` takes
a typed figure verbatim. It is stored separately from `paye` so that editing anything else on the
payslip re-runs the calculation without silently discarding the override, and the run page marks
those payslips **Manual** so an overridden figure is never mistaken for a computed one.

### Loans and advances

Money lent to staff is recovered through the payroll. A loan carries a principal and a monthly
instalment; **the outstanding balance is not stored** — it is the principal less the repayments
booked against it, for the same reason per-site stock balances are not stored.

A repayment counts when it is real:

- **Booked directly** (cash, a transfer) — counts immediately.
- **Recovered by a payslip** — counts once its run leaves draft. A draft run is a proposal that can
  still be edited or deleted, so its deductions must not reduce a balance yet. That is a join to the
  run's status rather than a flag on the repayment, so nothing can fall out of step: reopening a
  finalised run hands the balance straight back, and deleting a draft cascades its scheduled
  repayments away.

Generating a run adds each employee's instalment to their payslip automatically, capped at what is
still owed and allocated oldest loan first. Editing the figure down rewrites that allocation, so the
ledger and the payslip can never disagree. Finalising re-checks that the run's deductions still fit
— a repayment recorded in cash after the run was generated can leave it trying to over-collect — and
refuses with the employee, the loan and both figures named rather than quietly taking too much.

## 10. Documents

Invoices, certificates and payslips render as PDFs on demand rather than being written to object
storage. There is no stale copy to invalidate when an invoice is part-paid, and no bucket to
configure before the feature works. Each route resolves its record through the normal repository
call, so tenant scoping and permissions apply exactly as they do in the UI — a client can fetch
their own invoice PDF and nobody else's, and payslips refuse a portal scope outright.

Documents are black-on-white with brand green reserved for rules and headings: the dark UI theme
would waste toner and read poorly on paper.

## 11. Server/client boundary

Repository modules import `server-only`, so a client component that reaches for one fails the
build rather than leaking database code into the browser bundle. Two consequences worth knowing:

- Shared display labels live in `src/lib/labels.ts`, not in the repository modules.
- React components (Lucide icons included) cannot cross the RSC boundary as props. The server
  filters navigation by permission and passes the **hrefs**; `AppSidebar` imports the nav
  definition itself and resolves the icons client-side.

## 12. Creating and editing records

Every module owns its records end to end: each entity that can be listed can also be created and
edited from the page that lists it, behind the same permission that governs reading it.

| Module | Create | Edit |
|---|---|---|
| Clients | New client, add site | Edit client, edit site |
| Jobs | New job | Reschedule, reassign, checklist, sign-off |
| Inventory | Add item, add supplier, register equipment, raise a purchase order | Edit item, supplier, equipment; log a service |
| Compliance | Issue a certificate | — (a certificate is a statement of a date) |
| Incidents | Report | Status |
| Finance | Generate an invoice | Status, record a payment |
| Payroll | Employee, run, loan, advance | Employee, payslip, loan; record a repayment |
| Admin | Invite a user, add a service type | Edit a user, edit a service type, permissions |

Two rules shape what an edit form is allowed to touch:

- **Quantity is never edited.** Stock changes through `recordMovement` and nothing else, so the item
  form has no quantity field. Opening stock on a new item is booked in as a movement rather than
  written to the column — set directly, it would be invisible to the per-location balances and the
  item's total would stop reconciling with its ledger.
- **A loan's principal is fixed** once recorded: repayments are measured against it. Write it off
  and record a new one if the figure was wrong.

Deletion is rarer than editing and deliberately so. A supplier can be deleted only while no item
points at it; a loan only while nothing has been repaid; a payroll run only while it is a draft. An
inventory item is retired rather than deleted, because the movements referencing it are ledger rows
that must keep resolving.

## 13. Keeping the deployed schema in step

A deploy carrying new tables fails on every page that reads them until the migrations have run, and
the failure surfaces as an opaque *Something went wrong*. Two routes apply them, both idempotent:

- `npm run db:migrate` with the production credentials exported.
- **Settings → Database → Apply pending migrations**, for a Super Admin with no terminal to hand.
  The same work is available at `POST /api/admin/migrate` with `CRON_SECRET` as a bearer token —
  which is the path that still works when the missing table is the one holding sessions.

Applied files are recorded in `__ecohygiene_migrations`. A statement that fails because its table or
column already exists is treated as done rather than fatal, so a database part-built with
`db:push` can still be brought forward.

## 14. Testing the isolation yourself

```bash
npm run db:seed && npm run build && npm start
```

Sign in as `admin@pepsi.example`, copy a job id from the Sayona portal (or the internal
dashboard), and request `/portal/services/<that-id>` — it returns *Not found*, because
`assertTenant` rejected it in the repository, not because a template hid it.
