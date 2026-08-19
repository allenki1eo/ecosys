import "server-only";

import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clients,
  invoices,
  jobs,
  sites,
  type ClientStatus,
} from "@db/schema";
import { newId } from "@/lib/ids";
import { recordAudit } from "@/lib/data/audit";
import { assertTenant, tenantFilter, type Scope } from "@/lib/data/scope";

export type ClientSummary = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  status: ClientStatus;
  contractEnd: Date | null;
  siteCount: number;
  openJobs: number;
  outstandingAmount: number;
};

export async function listClients(scope: Scope): Promise<ClientSummary[]> {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      slug: clients.slug,
      industry: clients.industry,
      status: clients.status,
      contractEnd: clients.contractEnd,
      siteCount: sql<number>`(select count(*) from ${sites} where ${sites.clientId} = ${clients.id})`,
      openJobs: sql<number>`(select count(*) from ${jobs} where ${jobs.clientId} = ${clients.id} and ${jobs.status} in ('scheduled','en_route','in_progress'))`,
      outstandingAmount: sql<number>`coalesce((select sum(${invoices.amount}) from ${invoices} where ${invoices.clientId} = ${clients.id} and ${invoices.status} in ('issued','part_paid','overdue')), 0)`,
    })
    .from(clients)
    .where(and(tenantFilter(clients.id, scope)))
    .orderBy(asc(clients.name));

  return rows as ClientSummary[];
}

export async function getClient(scope: Scope, clientId: string) {
  const [row] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!row) return undefined;
  return assertTenant(scope, { ...row, clientId: row.id }, "client");
}

export async function listSites(scope: Scope, clientId?: string) {
  return db
    .select({
      id: sites.id,
      clientId: sites.clientId,
      clientName: clients.name,
      name: sites.name,
      address: sites.address,
      region: sites.region,
      contactName: sites.contactName,
      contactPhone: sites.contactPhone,
      isActive: sites.isActive,
      gpsLat: sites.gpsLat,
      gpsLng: sites.gpsLng,
    })
    .from(sites)
    .innerJoin(clients, eq(sites.clientId, clients.id))
    .where(
      and(
        tenantFilter(sites.clientId, scope),
        clientId ? eq(sites.clientId, clientId) : undefined,
      ),
    )
    .orderBy(asc(clients.name), asc(sites.name));
}

export async function getSite(scope: Scope, siteId: string) {
  const [row] = await db
    .select({
      id: sites.id,
      clientId: sites.clientId,
      clientName: clients.name,
      name: sites.name,
      address: sites.address,
      region: sites.region,
      gpsLat: sites.gpsLat,
      gpsLng: sites.gpsLng,
      contactName: sites.contactName,
      contactPhone: sites.contactPhone,
      notes: sites.notes,
      isActive: sites.isActive,
      specNotes: clients.specNotes,
    })
    .from(sites)
    .innerJoin(clients, eq(sites.clientId, clients.id))
    .where(eq(sites.id, siteId))
    .limit(1);

  return assertTenant(scope, row, "site");
}

export type ClientInput = {
  name: string;
  slug: string;
  industry?: string | null;
  contractStart?: Date | null;
  contractEnd?: Date | null;
  billingContact?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  paymentTermsDays?: number;
  status?: ClientStatus;
  specNotes?: string | null;
};

export async function createClient(scope: Scope, input: ClientInput) {
  const id = newId("cli");
  await db.insert(clients).values({ id, ...input });
  await recordAudit(scope, "client.create", "client", id, { name: input.name });
  return id;
}

export async function updateClient(scope: Scope, clientId: string, input: Partial<ClientInput>) {
  await db.update(clients).set(input).where(eq(clients.id, clientId));
  await recordAudit(scope, "client.update", "client", clientId, input as Record<string, unknown>);
}

export type SiteInput = {
  clientId: string;
  name: string;
  address?: string | null;
  region?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
};

export async function createSite(scope: Scope, input: SiteInput) {
  const id = newId("site");
  await db.insert(sites).values({ id, ...input });
  await recordAudit(scope, "site.create", "site", id, { name: input.name, clientId: input.clientId });
  return id;
}

export async function updateSite(scope: Scope, siteId: string, input: Partial<SiteInput>) {
  const existing = await getSite(scope, siteId);
  if (!existing) throw new Error("Site not found");
  await db.update(sites).set(input).where(eq(sites.id, siteId));
  await recordAudit(scope, "site.update", "site", siteId, input as Record<string, unknown>);
}

/** Contracts expiring within `days` — drives the renewal alerts (30/14/7). */
export async function listExpiringContracts(scope: Scope, days = 30) {
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return db
    .select({
      id: clients.id,
      name: clients.name,
      contractEnd: clients.contractEnd,
      status: clients.status,
    })
    .from(clients)
    .where(
      and(
        tenantFilter(clients.id, scope),
        gte(clients.contractEnd, now),
        lte(clients.contractEnd, horizon),
        inArray(clients.status, ["active", "prospect"]),
      ),
    )
    .orderBy(asc(clients.contractEnd));
}

export async function countClients(scope: Scope) {
  const [row] = await db
    .select({ value: count() })
    .from(clients)
    .where(and(tenantFilter(clients.id, scope), eq(clients.status, "active")));
  return row?.value ?? 0;
}

/** Timeline of everything that happened at a site, newest first. */
export async function siteServiceHistory(scope: Scope, siteId: string, limit = 25) {
  const site = await getSite(scope, siteId);
  if (!site) return [];
  return db
    .select({
      id: jobs.id,
      reference: jobs.reference,
      status: jobs.status,
      scheduledAt: jobs.scheduledAt,
      completedAt: jobs.completedAt,
      reportSummary: jobs.reportSummary,
    })
    .from(jobs)
    .where(eq(jobs.siteId, siteId))
    .orderBy(desc(jobs.scheduledAt))
    .limit(limit);
}
