import "server-only";

import { asc, count, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  jobs,
  recurringJobTemplates,
  serviceTypes,
  type CertificateType,
  type ChecklistItem,
} from "@db/schema";
import { newId } from "@/lib/ids";
import { recordAudit } from "@/lib/data/audit";
import { hasPermission, type Scope } from "@/lib/data/scope";

/** The service catalogue is Ecohygiene's own; client portals never edit it. */
function assertInternal(scope: Scope) {
  if (scope.clientId) throw new Error("The service catalogue is not editable from client portals");
}

export async function listServiceCatalogue(scope: Scope) {
  assertInternal(scope);
  return db
    .select({
      id: serviceTypes.id,
      name: serviceTypes.name,
      slug: serviceTypes.slug,
      description: serviceTypes.description,
      defaultFrequency: serviceTypes.defaultFrequency,
      defaultDurationMinutes: serviceTypes.defaultDurationMinutes,
      defaultRate: serviceTypes.defaultRate,
      issuesCertificate: serviceTypes.issuesCertificate,
      certificateType: serviceTypes.certificateType,
      certificateValidityDays: serviceTypes.certificateValidityDays,
      checklistTemplateJson: serviceTypes.checklistTemplateJson,
      // Table-qualified literal SQL — see the note in data/clients.ts.
      jobCount: sql<number>`(select count(*) from "jobs" where "jobs"."service_type_id" = "service_types"."id")`,
      activeSchedules: sql<number>`(select count(*) from "recurring_job_templates" where "recurring_job_templates"."service_type_id" = "service_types"."id" and "recurring_job_templates"."is_active" = 1)`,
    })
    .from(serviceTypes)
    .orderBy(asc(serviceTypes.name));
}

export async function getServiceType(scope: Scope, serviceTypeId: string) {
  assertInternal(scope);
  const [row] = await db
    .select()
    .from(serviceTypes)
    .where(eq(serviceTypes.id, serviceTypeId))
    .limit(1);
  return row;
}

export type ServiceTypeInput = {
  name: string;
  slug: string;
  description?: string | null;
  defaultFrequency?: string | null;
  defaultDurationMinutes: number;
  defaultRate: number;
  issuesCertificate: boolean;
  certificateType?: CertificateType | null;
  certificateValidityDays?: number | null;
  checklist: string[];
};

/** Checklist labels are stored with stable ids so a job's copy stays matchable. */
function toChecklist(labels: string[]): ChecklistItem[] {
  return labels
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label, index) => ({ id: `c${index + 1}`, label }));
}

export async function createServiceType(scope: Scope, input: ServiceTypeInput) {
  assertInternal(scope);
  if (!hasPermission(scope, "settings.manage")) {
    throw new Error("Missing permission: settings.manage");
  }

  const id = newId("svc");
  await db.insert(serviceTypes).values({
    id,
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    defaultFrequency: input.defaultFrequency ?? null,
    defaultDurationMinutes: input.defaultDurationMinutes,
    defaultRate: input.defaultRate,
    issuesCertificate: input.issuesCertificate,
    certificateType: input.issuesCertificate ? (input.certificateType ?? null) : null,
    certificateValidityDays: input.issuesCertificate ? (input.certificateValidityDays ?? 90) : null,
    checklistTemplateJson: toChecklist(input.checklist),
  });

  await recordAudit(scope, "service_type.create", "service_type", id, { name: input.name });
  return id;
}

export async function updateServiceType(
  scope: Scope,
  serviceTypeId: string,
  input: ServiceTypeInput,
) {
  assertInternal(scope);
  if (!hasPermission(scope, "settings.manage")) {
    throw new Error("Missing permission: settings.manage");
  }

  await db
    .update(serviceTypes)
    .set({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      defaultFrequency: input.defaultFrequency ?? null,
      defaultDurationMinutes: input.defaultDurationMinutes,
      defaultRate: input.defaultRate,
      issuesCertificate: input.issuesCertificate,
      certificateType: input.issuesCertificate ? (input.certificateType ?? null) : null,
      certificateValidityDays: input.issuesCertificate ? (input.certificateValidityDays ?? 90) : null,
      checklistTemplateJson: toChecklist(input.checklist),
    })
    .where(eq(serviceTypes.id, serviceTypeId));

  // Existing jobs keep the checklist they were created with — editing the
  // catalogue must never rewrite work a crew has already started.
  await recordAudit(scope, "service_type.update", "service_type", serviceTypeId, {
    name: input.name,
  });
}

/**
 * Service types are referenced by jobs, so they are never hard-deleted; the
 * caller is told what still points at it.
 */
export async function serviceTypeUsage(scope: Scope, serviceTypeId: string) {
  assertInternal(scope);
  const [jobRow] = await db
    .select({ value: count() })
    .from(jobs)
    .where(eq(jobs.serviceTypeId, serviceTypeId));
  const [scheduleRow] = await db
    .select({ value: count() })
    .from(recurringJobTemplates)
    .where(eq(recurringJobTemplates.serviceTypeId, serviceTypeId));
  return { jobs: jobRow?.value ?? 0, schedules: scheduleRow?.value ?? 0 };
}
