import "server-only";

import { and, count, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clients,
  incidents,
  inventoryMovements,
  invoices,
  jobs,
  serviceTypes,
  sites,
} from "@db/schema";
import { tenantFilter, type Scope } from "@/lib/data/scope";

export function startOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function jobsToday(scope: Scope) {
  const [row] = await db
    .select({ value: count() })
    .from(jobs)
    .where(
      and(
        tenantFilter(jobs.clientId, scope),
        gte(jobs.scheduledAt, startOfDay()),
        lte(jobs.scheduledAt, endOfDay()),
      ),
    );
  return row?.value ?? 0;
}

export async function activeSiteCount(scope: Scope) {
  const [row] = await db
    .select({ value: count() })
    .from(sites)
    .where(and(tenantFilter(sites.clientId, scope), eq(sites.isActive, true)));
  return row?.value ?? 0;
}

export async function openIncidentCount(scope: Scope) {
  const [row] = await db
    .select({ value: count() })
    .from(incidents)
    .where(
      and(
        tenantFilter(incidents.clientId, scope),
        inArray(incidents.status, ["open", "investigating"]),
        scope.clientId ? eq(incidents.clientVisible, true) : undefined,
      ),
    );
  return row?.value ?? 0;
}

/** Completed jobs per month for the last `months` months. */
export async function jobsCompletedTrend(scope: Scope, months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  const from = startOfMonth(since);

  const rows = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${jobs.completedAt} / 1000, 'unixepoch')`,
      value: count(),
    })
    .from(jobs)
    .where(
      and(
        tenantFilter(jobs.clientId, scope),
        inArray(jobs.status, ["completed", "signed_off"]),
        gte(jobs.completedAt, from),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return fillMonths(rows, months);
}

/** Invoiced revenue per month (issued or better), for the revenue chart. */
export async function revenueTrend(scope: Scope, months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  const from = startOfMonth(since);

  const rows = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${invoices.issuedAt} / 1000, 'unixepoch')`,
      value: sql<number>`coalesce(sum(${invoices.amount}), 0)`,
    })
    .from(invoices)
    .where(
      and(
        tenantFilter(invoices.clientId, scope),
        inArray(invoices.status, ["issued", "part_paid", "paid", "overdue"]),
        gte(invoices.issuedAt, from),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return fillMonths(rows, months);
}

/** Revenue split by service type this month — powers the mix chart. */
export async function revenueByServiceType(scope: Scope) {
  const rows = await db
    .select({
      name: serviceTypes.name,
      value: sql<number>`coalesce(sum(${serviceTypes.defaultRate}), 0)`,
      jobCount: count(),
    })
    .from(jobs)
    .innerJoin(serviceTypes, eq(jobs.serviceTypeId, serviceTypes.id))
    .where(
      and(
        tenantFilter(jobs.clientId, scope),
        inArray(jobs.status, ["completed", "signed_off"]),
        gte(jobs.completedAt, startOfMonth()),
      ),
    )
    .groupBy(serviceTypes.name)
    .orderBy(sql`2 desc`);
  return rows;
}

/** Chemical burn rate: litres consumed per month across all jobs. */
export async function inventoryBurnRate(scope: Scope, months = 6) {
  if (scope.clientId) return [];
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));

  const rows = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${inventoryMovements.createdAt} / 1000, 'unixepoch')`,
      value: sql<number>`coalesce(abs(sum(${inventoryMovements.quantityDelta})), 0)`,
    })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.reason, "job_usage"),
        gte(inventoryMovements.createdAt, startOfMonth(since)),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return fillMonths(rows, months);
}

/** Per-crew productivity for the current month. */
export async function crewProductivity(scope: Scope) {
  if (scope.clientId) return [];
  const rows = await db
    .select({
      crewId: sql<string>`json_each.value`,
      jobCount: count(),
    })
    .from(sql`${jobs}, json_each(${jobs.assignedCrewJson})`)
    .where(
      and(
        inArray(jobs.status, ["completed", "signed_off"]),
        gte(jobs.completedAt, startOfMonth()),
      ),
    )
    .groupBy(sql`json_each.value`)
    .orderBy(sql`2 desc`);
  return rows;
}

export async function clientMix(scope: Scope) {
  if (scope.clientId) return [];
  return db
    .select({
      name: clients.name,
      value: count(jobs.id),
    })
    .from(clients)
    .leftJoin(jobs, and(eq(jobs.clientId, clients.id), gte(jobs.scheduledAt, startOfMonth())))
    .groupBy(clients.id)
    .orderBy(sql`2 desc`);
}

type MonthRow = { month: string; value: number };

/** Ensures a continuous month axis so charts do not skip quiet months. */
function fillMonths(rows: MonthRow[], months: number): MonthRow[] {
  const byMonth = new Map(rows.map((r) => [r.month, Number(r.value ?? 0)]));
  const out: MonthRow[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  cursor.setMonth(cursor.getMonth() - (months - 1));

  for (let i = 0; i < months; i++) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, value: byMonth.get(key) ?? 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}
