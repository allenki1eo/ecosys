import "server-only";

import { and, asc, between, count, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  certificates,
  clients,
  inventoryItems,
  inventoryMovements,
  jobPhotos,
  jobs,
  serviceTypes,
  sites,
  users,
  type ChecklistItem,
  type JobStatus,
} from "@db/schema";
import { newId, newReference } from "@/lib/ids";
import { recordAudit } from "@/lib/data/audit";
import { assertTenant, tenantFilter, type Scope } from "@/lib/data/scope";

/** Legal forward transitions in the job pipeline. */
const STATUS_FLOW: Record<JobStatus, JobStatus[]> = {
  scheduled: ["en_route", "in_progress", "cancelled"],
  en_route: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["signed_off"],
  signed_off: [],
  cancelled: ["scheduled"],
};

export type JobFilters = {
  from?: Date;
  to?: Date;
  status?: JobStatus[];
  clientId?: string;
  siteId?: string;
  serviceTypeId?: string;
  crewMemberId?: string;
  limit?: number;
};

const jobSelection = {
  id: jobs.id,
  reference: jobs.reference,
  status: jobs.status,
  scheduledAt: jobs.scheduledAt,
  durationMinutes: jobs.durationMinutes,
  completedAt: jobs.completedAt,
  signedOffAt: jobs.signedOffAt,
  notes: jobs.notes,
  reportSummary: jobs.reportSummary,
  assignedCrewJson: jobs.assignedCrewJson,
  clientId: jobs.clientId,
  clientName: clients.name,
  siteId: jobs.siteId,
  siteName: sites.name,
  siteRegion: sites.region,
  serviceTypeId: jobs.serviceTypeId,
  serviceTypeName: serviceTypes.name,
} as const;

export async function listJobs(scope: Scope, filters: JobFilters = {}) {
  const conditions = [
    tenantFilter(jobs.clientId, scope),
    filters.from && filters.to
      ? between(jobs.scheduledAt, filters.from, filters.to)
      : filters.from
        ? gte(jobs.scheduledAt, filters.from)
        : filters.to
          ? lte(jobs.scheduledAt, filters.to)
          : undefined,
    filters.status?.length ? inArray(jobs.status, filters.status) : undefined,
    filters.clientId ? eq(jobs.clientId, filters.clientId) : undefined,
    filters.siteId ? eq(jobs.siteId, filters.siteId) : undefined,
    filters.serviceTypeId ? eq(jobs.serviceTypeId, filters.serviceTypeId) : undefined,
    // assigned_crew_json is a JSON array of user ids.
    filters.crewMemberId
      ? sql`exists (select 1 from json_each(${jobs.assignedCrewJson}) where json_each.value = ${filters.crewMemberId})`
      : undefined,
  ];

  return db
    .select(jobSelection)
    .from(jobs)
    .innerJoin(sites, eq(jobs.siteId, sites.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .innerJoin(serviceTypes, eq(jobs.serviceTypeId, serviceTypes.id))
    .where(and(...conditions))
    .orderBy(asc(jobs.scheduledAt))
    .limit(filters.limit ?? 500);
}

export type JobListItem = Awaited<ReturnType<typeof listJobs>>[number];

export async function getJob(scope: Scope, jobId: string) {
  const [row] = await db
    .select({
      ...jobSelection,
      checklistJson: jobs.checklistJson,
      signatureUrl: jobs.signatureUrl,
      signedOffBy: jobs.signedOffBy,
      startedAt: jobs.startedAt,
      supervisorId: jobs.supervisorId,
      siteAddress: sites.address,
      siteContactName: sites.contactName,
      siteContactPhone: sites.contactPhone,
      specNotes: clients.specNotes,
      issuesCertificate: serviceTypes.issuesCertificate,
      certificateType: serviceTypes.certificateType,
      certificateValidityDays: serviceTypes.certificateValidityDays,
      defaultRate: serviceTypes.defaultRate,
    })
    .from(jobs)
    .innerJoin(sites, eq(jobs.siteId, sites.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .innerJoin(serviceTypes, eq(jobs.serviceTypeId, serviceTypes.id))
    .where(eq(jobs.id, jobId))
    .limit(1);

  return assertTenant(scope, row, "job");
}

export async function getJobPhotos(jobId: string) {
  return db
    .select({
      id: jobPhotos.id,
      url: jobPhotos.url,
      caption: jobPhotos.caption,
      uploadedAt: jobPhotos.uploadedAt,
      uploadedByName: users.name,
    })
    .from(jobPhotos)
    .leftJoin(users, eq(jobPhotos.uploadedBy, users.id))
    .where(eq(jobPhotos.jobId, jobId))
    .orderBy(asc(jobPhotos.uploadedAt));
}

export type CreateJobInput = {
  siteId: string;
  serviceTypeId: string;
  scheduledAt: Date;
  durationMinutes?: number;
  assignedCrew?: string[];
  supervisorId?: string | null;
  notes?: string | null;
  recurringTemplateId?: string | null;
};

export async function createJob(scope: Scope, input: CreateJobInput) {
  const [site] = await db
    .select({ clientId: sites.clientId })
    .from(sites)
    .where(eq(sites.id, input.siteId))
    .limit(1);
  if (!site) throw new Error("Site not found");

  const [serviceType] = await db
    .select({
      duration: serviceTypes.defaultDurationMinutes,
      checklist: serviceTypes.checklistTemplateJson,
    })
    .from(serviceTypes)
    .where(eq(serviceTypes.id, input.serviceTypeId))
    .limit(1);

  const id = newId("job");
  await db.insert(jobs).values({
    id,
    reference: newReference("JOB"),
    siteId: input.siteId,
    clientId: site.clientId,
    serviceTypeId: input.serviceTypeId,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes ?? serviceType?.duration ?? 120,
    assignedCrewJson: input.assignedCrew ?? [],
    supervisorId: input.supervisorId ?? null,
    notes: input.notes ?? null,
    // Snapshot the template so later edits to the service type do not rewrite
    // the checklist a crew already worked through.
    checklistJson: (serviceType?.checklist ?? []).map((item) => ({ ...item, done: false })),
    recurringTemplateId: input.recurringTemplateId ?? null,
    createdBy: scope.userId === "system" ? null : scope.userId,
  });

  await recordAudit(scope, "job.create", "job", id, { siteId: input.siteId });
  return id;
}

export async function reassignCrew(scope: Scope, jobId: string, crew: string[]) {
  const job = await getJob(scope, jobId);
  if (!job) throw new Error("Job not found");
  await db.update(jobs).set({ assignedCrewJson: crew }).where(eq(jobs.id, jobId));
  await recordAudit(scope, "job.reassign", "job", jobId, { crew });
}

export async function rescheduleJob(scope: Scope, jobId: string, scheduledAt: Date) {
  const job = await getJob(scope, jobId);
  if (!job) throw new Error("Job not found");
  await db.update(jobs).set({ scheduledAt }).where(eq(jobs.id, jobId));
  await recordAudit(scope, "job.reschedule", "job", jobId, { scheduledAt: scheduledAt.toISOString() });
}

export async function updateChecklist(scope: Scope, jobId: string, checklist: ChecklistItem[]) {
  const job = await getJob(scope, jobId);
  if (!job) throw new Error("Job not found");
  await db.update(jobs).set({ checklistJson: checklist }).where(eq(jobs.id, jobId));
}

export class InvalidTransitionError extends Error {
  constructor(from: JobStatus, to: JobStatus) {
    super(`Cannot move a job from "${from}" to "${to}"`);
    this.name = "InvalidTransitionError";
  }
}

export type CompletionInput = {
  reportSummary?: string | null;
  /** Chemicals consumed, deducted from stock as part of the same operation. */
  consumption?: { itemId: string; quantity: number }[];
};

/**
 * Advances the job pipeline. Completing a job also:
 *  - writes inventory movements and decrements stock for consumed chemicals
 *  - issues a compliance certificate when the service type calls for one
 */
export async function advanceJobStatus(
  scope: Scope,
  jobId: string,
  next: JobStatus,
  input: CompletionInput = {},
) {
  const job = await getJob(scope, jobId);
  if (!job) throw new Error("Job not found");

  if (!STATUS_FLOW[job.status].includes(next)) {
    throw new InvalidTransitionError(job.status, next);
  }

  const now = new Date();
  const patch: Partial<typeof jobs.$inferInsert> = { status: next };
  if (next === "in_progress") patch.startedAt = now;
  if (next === "completed") {
    patch.completedAt = now;
    patch.reportSummary = input.reportSummary ?? job.reportSummary;
  }

  await db.update(jobs).set(patch).where(eq(jobs.id, jobId));

  if (next === "completed") {
    for (const line of input.consumption ?? []) {
      if (!line.quantity) continue;
      await db.insert(inventoryMovements).values({
        id: newId("mov"),
        itemId: line.itemId,
        jobId,
        siteId: job.siteId,
        quantityDelta: -Math.abs(line.quantity),
        reason: "job_usage",
        performedBy: scope.userId === "system" ? null : scope.userId,
      });
      await db
        .update(inventoryItems)
        .set({
          quantityOnHand: sql`${inventoryItems.quantityOnHand} - ${Math.abs(line.quantity)}`,
        })
        .where(eq(inventoryItems.id, line.itemId));
    }

    if (job.issuesCertificate && job.certificateType) {
      const validity = job.certificateValidityDays ?? 90;
      await db.insert(certificates).values({
        id: newId("cert"),
        reference: newReference("CERT"),
        clientId: job.clientId,
        siteId: job.siteId,
        jobId,
        type: job.certificateType,
        issuedAt: now,
        expiresAt: new Date(now.getTime() + validity * 24 * 60 * 60 * 1000),
        issuedBy: scope.userId === "system" ? null : scope.userId,
      });
    }
  }

  await recordAudit(scope, `job.${next}`, "job", jobId, {});
  return next;
}

export async function signOffJob(scope: Scope, jobId: string, signedOffBy: string, signatureUrl?: string) {
  const job = await getJob(scope, jobId);
  if (!job) throw new Error("Job not found");
  if (job.status !== "completed") throw new InvalidTransitionError(job.status, "signed_off");

  await db
    .update(jobs)
    .set({
      status: "signed_off",
      signedOffBy,
      signedOffAt: new Date(),
      signatureUrl: signatureUrl ?? job.signatureUrl,
    })
    .where(eq(jobs.id, jobId));

  await recordAudit(scope, "job.signed_off", "job", jobId, { signedOffBy });
}

export async function addJobPhoto(
  scope: Scope,
  jobId: string,
  url: string,
  caption?: string | null,
) {
  const job = await getJob(scope, jobId);
  if (!job) throw new Error("Job not found");
  const id = newId("pho");
  await db.insert(jobPhotos).values({
    id,
    jobId,
    url,
    caption: caption ?? null,
    uploadedBy: scope.userId === "system" ? null : scope.userId,
  });
  return id;
}

/* ------------------------------ aggregates ------------------------------- */

export async function jobCountsByStatus(scope: Scope, from?: Date, to?: Date) {
  const rows = await db
    .select({ status: jobs.status, value: count() })
    .from(jobs)
    .where(
      and(
        tenantFilter(jobs.clientId, scope),
        from ? gte(jobs.scheduledAt, from) : undefined,
        to ? lte(jobs.scheduledAt, to) : undefined,
      ),
    )
    .groupBy(jobs.status);

  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = r.value;
    return acc;
  }, {});
}

/** Jobs whose scheduled slot has passed while still not started. */
export async function overdueJobs(scope: Scope) {
  return db
    .select(jobSelection)
    .from(jobs)
    .innerJoin(sites, eq(jobs.siteId, sites.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .innerJoin(serviceTypes, eq(jobs.serviceTypeId, serviceTypes.id))
    .where(
      and(
        tenantFilter(jobs.clientId, scope),
        lt(jobs.scheduledAt, new Date()),
        inArray(jobs.status, ["scheduled", "en_route"]),
      ),
    )
    .orderBy(asc(jobs.scheduledAt))
    .limit(20);
}

export async function recentlyCompleted(scope: Scope, limit = 8) {
  return db
    .select(jobSelection)
    .from(jobs)
    .innerJoin(sites, eq(jobs.siteId, sites.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .innerJoin(serviceTypes, eq(jobs.serviceTypeId, serviceTypes.id))
    .where(and(tenantFilter(jobs.clientId, scope), inArray(jobs.status, ["completed", "signed_off"])))
    .orderBy(desc(jobs.completedAt))
    .limit(limit);
}

export async function listServiceTypes() {
  return db.select().from(serviceTypes).orderBy(asc(serviceTypes.name));
}

export async function listCrew() {
  return db
    .select({ id: users.id, name: users.name, role: users.role, phone: users.phone })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        inArray(users.role, ["field_technician", "site_supervisor", "operations_manager"]),
      ),
    )
    .orderBy(asc(users.name));
}
