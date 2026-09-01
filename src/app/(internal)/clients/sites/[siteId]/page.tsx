import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wrench } from "lucide-react";

import { SiteFormSheet } from "../../client-forms";
import { PageHeader } from "@/components/page-header";
import { JobStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth/guards";
import { getSite, siteServiceHistory } from "@/lib/data/clients";
import { scopeFor } from "@/lib/data/scope";
import { formatDate, formatSchedule } from "@/lib/format";

export default async function SiteDetailPage({ params }: { params: { siteId: string } }) {
  const user = await requireStaff();
  const scope = scopeFor(user);

  const site = await getSite(scope, params.siteId);
  if (!site) notFound();

  const history = await siteServiceHistory(scope, site.id, 40);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href={`/clients/${site.clientId}`}>
          <ArrowLeft /> {site.clientName}
        </Link>
      </Button>

      <PageHeader
        title={site.name}
        description={[site.address, site.region].filter(Boolean).join(" · ") || "No address recorded"}
        actions={
          user.permissions.has("clients.manage") ? (
            <SiteFormSheet
              site={{
                id: site.id,
                name: site.name,
                address: site.address,
                region: site.region,
                gpsLat: site.gpsLat,
                gpsLng: site.gpsLng,
                contactName: site.contactName,
                contactPhone: site.contactPhone,
                notes: site.notes,
              }}
            />
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader>
            <CardTitle>Service timeline</CardTitle>
            <p className="text-xs text-muted-foreground">
              Every visit to this site, newest first.
            </p>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Wrench}
                title="No visits yet"
                description="Schedule a job against this site to start the record."
              />
            ) : (
              <ol className="relative space-y-4 border-l pl-5">
                {history.map((job) => (
                  <li key={job.id} className="relative">
                    <span
                      className="absolute -left-[1.4rem] top-1.5 size-2 rounded-full bg-border"
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/jobs/${job.id}`} className="font-data text-sm hover:underline">
                        {job.reference}
                      </Link>
                      <JobStatusBadge status={job.status} />
                      <span className="text-xs text-muted-foreground">
                        {formatSchedule(job.scheduledAt)}
                      </span>
                    </div>
                    {job.reportSummary ? (
                      <p className="mt-1 text-sm text-muted-foreground">{job.reportSummary}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Site contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{site.contactName ?? "Not recorded"}</p>
              <p className="text-muted-foreground">{site.contactPhone ?? "No phone"}</p>
            </CardContent>
          </Card>

          {site.gpsLat && site.gpsLng ? (
            <Card>
              <CardHeader>
                <CardTitle>Coordinates</CardTitle>
              </CardHeader>
              <CardContent className="font-data text-sm text-muted-foreground">
                {site.gpsLat.toFixed(5)}, {site.gpsLng.toFixed(5)}
              </CardContent>
            </Card>
          ) : null}

          {site.specNotes ? (
            <Card>
              <CardHeader>
                <CardTitle>Client spec notes</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{site.specNotes}</CardContent>
            </Card>
          ) : null}

          {site.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Access notes</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{site.notes}</CardContent>
            </Card>
          ) : null}

          {history.length > 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              First recorded visit {formatDate(history.at(-1)?.scheduledAt ?? null)}
            </p>
          ) : null}
        </aside>
      </div>
    </>
  );
}
