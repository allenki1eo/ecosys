import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, MapPin, Users } from "lucide-react";

import { JobExecution } from "./job-execution";
import { PageHeader } from "@/components/page-header";
import { JobStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { inventoryItems } from "@db/schema";
import { getJob, getJobPhotos, listCrew } from "@/lib/data/jobs";
import { scopeFor } from "@/lib/data/scope";
import { formatDateTime, formatSchedule } from "@/lib/format";

export default async function JobDetailPage({ params }: { params: { jobId: string } }) {
  const user = await requireStaff();
  const scope = scopeFor(user);

  const job = await getJob(scope, params.jobId);
  if (!job) notFound();

  const [photos, crew, consumables] = await Promise.all([
    getJobPhotos(job.id),
    listCrew(),
    user.permissions.has("inventory.view")
      ? db
          .select({ id: inventoryItems.id, name: inventoryItems.name, unit: inventoryItems.unit })
          .from(inventoryItems)
          .where(eq(inventoryItems.category, "chemical"))
      : Promise.resolve([]),
  ]);

  const crewNames = new Map(crew.map((member) => [member.id, member.name]));
  const assigned = (job.assignedCrewJson ?? []).map((id) => crewNames.get(id) ?? "Unknown");

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/jobs">
          <ArrowLeft /> All jobs
        </Link>
      </Button>

      <PageHeader
        title={`${job.serviceTypeName} · ${job.siteName}`}
        description={`${job.clientName} — ${formatSchedule(job.scheduledAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="muted" className="font-data">
              {job.reference}
            </Badge>
            <JobStatusBadge status={job.status} />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <JobExecution
            jobId={job.id}
            status={job.status}
            checklist={job.checklistJson ?? []}
            consumables={consumables}
            canExecute={user.permissions.has("jobs.execute")}
            canSignOff={user.permissions.has("jobs.sign_off")}
          />

          {job.reportSummary ? (
            <Card>
              <CardHeader>
                <CardTitle>Report summary</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{job.reportSummary}</CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Evidence photos</CardTitle>
            </CardHeader>
            <CardContent>
              {photos.length === 0 ? (
                <EmptyState
                  className="border-0"
                  title="No photos attached"
                  description="Field crews attach before/after evidence from the job view."
                />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {photos.map((photo) => (
                    <li key={photo.id} className="rounded-md border p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.caption ?? "Job evidence"}
                        className="aspect-video w-full rounded object-cover"
                      />
                      <p className="mt-2 text-xs">{photo.caption ?? "Untitled"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {photo.uploadedByName ?? "Unknown"} · {formatDateTime(photo.uploadedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Site</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  {job.siteName}
                  <span className="block text-xs text-muted-foreground">
                    {job.siteAddress ?? "No address recorded"}
                  </span>
                </span>
              </p>
              {job.siteContactName ? (
                <p className="text-xs text-muted-foreground">
                  Contact: {job.siteContactName} · {job.siteContactPhone ?? "no phone"}
                </p>
              ) : null}
              <Button asChild variant="outline" size="sm" className="mt-2 w-full">
                <Link href={`/clients/sites/${job.siteId}`}>Open site</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Crew</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {assigned.length === 0 ? (
                <p className="text-xs text-muted-foreground">No crew assigned yet.</p>
              ) : (
                assigned.map((name) => (
                  <p key={name} className="flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    {name}
                  </p>
                ))
              )}
            </CardContent>
          </Card>

          {job.specNotes ? (
            <Card>
              <CardHeader>
                <CardTitle>Client spec notes</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{job.specNotes}</CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs text-muted-foreground">
              <p>Scheduled · {formatDateTime(job.scheduledAt)}</p>
              {job.startedAt ? <p>Started · {formatDateTime(job.startedAt)}</p> : null}
              {job.completedAt ? <p>Completed · {formatDateTime(job.completedAt)}</p> : null}
              {job.signedOffAt ? (
                <p>
                  Signed off · {formatDateTime(job.signedOffAt)} by {job.signedOffBy}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
