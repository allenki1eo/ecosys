import "server-only";

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  certificates,
  clients,
  incidents,
  jobs,
  serviceRequests,
  serviceTypes,
  sites,
  users,
  type CertificateType,
  type IncidentStatus,
} from "@db/schema";
import { newId, newReference } from "@/lib/ids";
import { recordAudit } from "@/lib/data/audit";
import { assertTenant, tenantFilter, type Scope } from "@/lib/data/scope";

export const CERTIFICATE_LABELS: Record<CertificateType, string> = {
  pest_control: "Pest control",
  fumigation: "Fumigation",
  wastewater_discharge: "Wastewater discharge",
  sanitation: "Sanitation",
};

/* ------------------------------ certificates ------------------------------ */

export async function listCertificates(scope: Scope, clientId?: string) {
  return db
    .select({
      id: certificates.id,
      reference: certificates.reference,
      type: certificates.type,
      issuedAt: certificates.issuedAt,
      expiresAt: certificates.expiresAt,
      pdfUrl: certificates.pdfUrl,
      authority: certificates.authority,
      clientId: certificates.clientId,
      clientName: clients.name,
      siteName: sites.name,
      jobReference: jobs.reference,
    })
    .from(certificates)
    .innerJoin(clients, eq(certificates.clientId, clients.id))
    .innerJoin(sites, eq(certificates.siteId, sites.id))
    .leftJoin(jobs, eq(certificates.jobId, jobs.id))
    .where(
      and(
        tenantFilter(certificates.clientId, scope),
        clientId ? eq(certificates.clientId, clientId) : undefined,
      ),
    )
    .orderBy(desc(certificates.issuedAt));
}

/** Certificates lapsing within `days` — feeds the renewal alert list. */
export async function expiringCertificates(scope: Scope, days = 30) {
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return db
    .select({
      id: certificates.id,
      reference: certificates.reference,
      type: certificates.type,
      expiresAt: certificates.expiresAt,
      clientName: clients.name,
      siteName: sites.name,
    })
    .from(certificates)
    .innerJoin(clients, eq(certificates.clientId, clients.id))
    .innerJoin(sites, eq(certificates.siteId, sites.id))
    .where(
      and(
        tenantFilter(certificates.clientId, scope),
        gte(certificates.expiresAt, now),
        lte(certificates.expiresAt, horizon),
      ),
    )
    .orderBy(asc(certificates.expiresAt));
}

/** One certificate with everything its PDF needs, tenant-scoped. */
export async function getCertificate(scope: Scope, certificateId: string) {
  const [row] = await db
    .select({
      id: certificates.id,
      reference: certificates.reference,
      type: certificates.type,
      issuedAt: certificates.issuedAt,
      expiresAt: certificates.expiresAt,
      authority: certificates.authority,
      pdfUrl: certificates.pdfUrl,
      clientId: certificates.clientId,
      clientName: clients.name,
      siteName: sites.name,
      siteAddress: sites.address,
      jobReference: jobs.reference,
      reportSummary: jobs.reportSummary,
      serviceName: serviceTypes.name,
      issuedByName: users.name,
    })
    .from(certificates)
    .innerJoin(clients, eq(certificates.clientId, clients.id))
    .innerJoin(sites, eq(certificates.siteId, sites.id))
    .leftJoin(jobs, eq(certificates.jobId, jobs.id))
    .leftJoin(serviceTypes, eq(jobs.serviceTypeId, serviceTypes.id))
    .leftJoin(users, eq(certificates.issuedBy, users.id))
    .where(eq(certificates.id, certificateId))
    .limit(1);

  return assertTenant(scope, row, "certificate");
}

export async function issueCertificate(
  scope: Scope,
  input: {
    siteId: string;
    jobId?: string | null;
    type: CertificateType;
    validityDays: number;
    authority?: string | null;
    pdfUrl?: string | null;
  },
) {
  const [site] = await db
    .select({ clientId: sites.clientId })
    .from(sites)
    .where(eq(sites.id, input.siteId))
    .limit(1);
  if (!site) throw new Error("Site not found");

  const now = new Date();
  const id = newId("cert");
  await db.insert(certificates).values({
    id,
    reference: newReference("CERT"),
    clientId: site.clientId,
    siteId: input.siteId,
    jobId: input.jobId ?? null,
    type: input.type,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + input.validityDays * 24 * 60 * 60 * 1000),
    authority: input.authority ?? null,
    pdfUrl: input.pdfUrl ?? null,
    issuedBy: scope.userId === "system" ? null : scope.userId,
  });
  await recordAudit(scope, "certificate.issue", "certificate", id, { type: input.type });
  return id;
}

/* -------------------------------- incidents ------------------------------- */

export async function listIncidents(scope: Scope, status?: IncidentStatus[]) {
  return db
    .select({
      id: incidents.id,
      reference: incidents.reference,
      title: incidents.title,
      description: incidents.description,
      severity: incidents.severity,
      status: incidents.status,
      photoUrl: incidents.photoUrl,
      createdAt: incidents.createdAt,
      resolvedAt: incidents.resolvedAt,
      resolutionNotes: incidents.resolutionNotes,
      clientId: incidents.clientId,
      clientName: clients.name,
      siteName: sites.name,
      assignedToName: users.name,
    })
    .from(incidents)
    .innerJoin(clients, eq(incidents.clientId, clients.id))
    .innerJoin(sites, eq(incidents.siteId, sites.id))
    .leftJoin(users, eq(incidents.assignedTo, users.id))
    .where(
      and(
        tenantFilter(incidents.clientId, scope),
        // Internal-only reviews stay out of the client portal entirely.
        scope.clientId ? eq(incidents.clientVisible, true) : undefined,
        status?.length ? inArray(incidents.status, status) : undefined,
      ),
    )
    .orderBy(desc(incidents.createdAt));
}

export async function getIncident(scope: Scope, incidentId: string) {
  const [row] = await db
    .select({
      id: incidents.id,
      reference: incidents.reference,
      title: incidents.title,
      description: incidents.description,
      severity: incidents.severity,
      status: incidents.status,
      photoUrl: incidents.photoUrl,
      createdAt: incidents.createdAt,
      resolvedAt: incidents.resolvedAt,
      resolutionNotes: incidents.resolutionNotes,
      clientVisible: incidents.clientVisible,
      clientId: incidents.clientId,
      clientName: clients.name,
      siteName: sites.name,
    })
    .from(incidents)
    .innerJoin(clients, eq(incidents.clientId, clients.id))
    .innerJoin(sites, eq(incidents.siteId, sites.id))
    .where(eq(incidents.id, incidentId))
    .limit(1);

  const scoped = assertTenant(scope, row, "incident");
  if (scoped && scope.clientId && !scoped.clientVisible) return undefined;
  return scoped;
}

export async function reportIncident(
  scope: Scope,
  input: {
    siteId: string;
    title: string;
    description: string;
    severity?: "low" | "medium" | "high" | "critical";
    photoUrl?: string | null;
    clientVisible?: boolean;
  },
) {
  const [site] = await db
    .select({ clientId: sites.clientId })
    .from(sites)
    .where(eq(sites.id, input.siteId))
    .limit(1);
  if (!site) throw new Error("Site not found");
  if (scope.clientId && site.clientId !== scope.clientId) {
    throw new Error("Cross-tenant incident report rejected");
  }

  const id = newId("inc");
  await db.insert(incidents).values({
    id,
    reference: newReference("INC"),
    clientId: site.clientId,
    siteId: input.siteId,
    reportedBy: scope.userId === "system" ? null : scope.userId,
    title: input.title,
    description: input.description,
    severity: input.severity ?? "medium",
    photoUrl: input.photoUrl ?? null,
    clientVisible: input.clientVisible ?? true,
  });
  await recordAudit(scope, "incident.report", "incident", id, { siteId: input.siteId });
  return id;
}

export async function updateIncidentStatus(
  scope: Scope,
  incidentId: string,
  status: IncidentStatus,
  resolutionNotes?: string,
) {
  const incident = await getIncident(scope, incidentId);
  if (!incident) throw new Error("Incident not found");

  await db
    .update(incidents)
    .set({
      status,
      resolutionNotes: resolutionNotes ?? incident.resolutionNotes,
      resolvedAt: status === "resolved" || status === "closed" ? new Date() : null,
    })
    .where(eq(incidents.id, incidentId));
  await recordAudit(scope, `incident.${status}`, "incident", incidentId, {});
}

/* ---------------------------- service requests ---------------------------- */

export async function listServiceRequests(scope: Scope) {
  return db
    .select({
      id: serviceRequests.id,
      description: serviceRequests.description,
      urgency: serviceRequests.urgency,
      status: serviceRequests.status,
      preferredDate: serviceRequests.preferredDate,
      createdAt: serviceRequests.createdAt,
      clientId: serviceRequests.clientId,
      clientName: clients.name,
      siteName: sites.name,
      siteId: serviceRequests.siteId,
      serviceTypeName: serviceTypes.name,
      requestedByName: users.name,
    })
    .from(serviceRequests)
    .innerJoin(clients, eq(serviceRequests.clientId, clients.id))
    .innerJoin(sites, eq(serviceRequests.siteId, sites.id))
    .leftJoin(serviceTypes, eq(serviceRequests.serviceTypeId, serviceTypes.id))
    .leftJoin(users, eq(serviceRequests.requestedBy, users.id))
    .where(tenantFilter(serviceRequests.clientId, scope))
    .orderBy(desc(serviceRequests.createdAt));
}

export async function createServiceRequest(
  scope: Scope,
  input: {
    siteId: string;
    serviceTypeId?: string | null;
    description: string;
    urgency?: "routine" | "urgent" | "emergency";
    preferredDate?: Date | null;
  },
) {
  const [site] = await db
    .select({ clientId: sites.clientId })
    .from(sites)
    .where(eq(sites.id, input.siteId))
    .limit(1);
  if (!site) throw new Error("Site not found");
  if (scope.clientId && site.clientId !== scope.clientId) {
    throw new Error("Cross-tenant service request rejected");
  }

  const id = newId("sreq");
  await db.insert(serviceRequests).values({
    id,
    clientId: site.clientId,
    siteId: input.siteId,
    serviceTypeId: input.serviceTypeId ?? null,
    description: input.description,
    urgency: input.urgency ?? "routine",
    preferredDate: input.preferredDate ?? null,
    requestedBy: scope.userId === "system" ? null : scope.userId,
  });
  await recordAudit(scope, "service_request.create", "service_request", id, {
    siteId: input.siteId,
  });
  return id;
}
