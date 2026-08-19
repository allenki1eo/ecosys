import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { JobStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireClientUser } from "@/lib/auth/guards";
import { getJob, getJobPhotos } from "@/lib/data/jobs";
import { scopeFor } from "@/lib/data/scope";
import { formatDateTime } from "@/lib/format";

/**
 * The client-facing job report. Deliberately narrower than the internal view:
 * no crew names, no costs, no inventory — the tenant scope in `getJob` is what
 * stops another client's job being fetched by id.
 */
export default async function PortalJobReportPage({ params }: { params: { jobId: string } }) {
  const user = await requireClientUser();
  const scope = scopeFor(user);

  const job = await getJob(scope, params.jobId);
  if (!job) notFound();

  const photos = await getJobPhotos(job.id);
  const checklist = job.checklistJson ?? [];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/portal/services">
          <ArrowLeft /> Service history
        </Link>
      </Button>

      <PageHeader
        title={`${job.serviceTypeName} · ${job.siteName}`}
        description={formatDateTime(job.completedAt ?? job.scheduledAt)}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="muted" className="font-data">
              {job.reference}
            </Badge>
            <JobStatusBadge status={job.status} />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Findings</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {job.reportSummary ? (
                <p className="text-muted-foreground">{job.reportSummary}</p>
              ) : (
                <p className="text-muted-foreground">
                  No written summary was recorded for this visit.
                </p>
              )}
            </CardContent>
          </Card>

          {checklist.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Work carried out</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {checklist.map((item) => (
                    <li key={item.id} className="flex items-start gap-2">
                      <CheckCircle2
                        className={
                          item.done ? "mt-0.5 size-4 text-brand-green" : "mt-0.5 size-4 text-muted-foreground"
                        }
                      />
                      <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {photos.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Photos</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {photos.map((photo) => (
                    <li key={photo.id} className="rounded-md border p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.url}
                        alt={photo.caption ?? "Service evidence"}
                        className="aspect-video w-full rounded object-cover"
                      />
                      <p className="mt-2 text-xs">{photo.caption ?? "Untitled"}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Visit details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-xs text-muted-foreground">
              <p>Scheduled · {formatDateTime(job.scheduledAt)}</p>
              {job.completedAt ? <p>Completed · {formatDateTime(job.completedAt)}</p> : null}
              {job.signedOffAt ? (
                <p>
                  Signed off · {formatDateTime(job.signedOffAt)} by {job.signedOffBy}
                </p>
              ) : (
                <p>Awaiting sign-off from your site representative.</p>
              )}
            </CardContent>
          </Card>

          {job.signatureUrl ? (
            <Card>
              <CardHeader>
                <CardTitle>Signature</CardTitle>
              </CardHeader>
              <CardContent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={job.signatureUrl} alt="Client signature" className="w-full rounded border" />
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
