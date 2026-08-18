import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { RequestServiceSheet } from "./request-service";
import { SiteSwitcher } from "../site-switcher";
import { PageHeader } from "@/components/page-header";
import { JobStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireClientUser } from "@/lib/auth/guards";
import { listSites } from "@/lib/data/clients";
import { listServiceRequests } from "@/lib/data/compliance";
import { listJobs, listServiceTypes } from "@/lib/data/jobs";
import { scopeFor } from "@/lib/data/scope";
import { formatDate, formatSchedule, titleCase } from "@/lib/format";

export const metadata = { title: "Service history" };

export default async function PortalServicesPage({
  searchParams,
}: {
  searchParams: { site?: string };
}) {
  const user = await requireClientUser();
  const scope = scopeFor(user);

  const [sites, jobs, serviceTypes, requests] = await Promise.all([
    listSites(scope),
    listJobs(scope, { siteId: searchParams.site, limit: 200 }),
    listServiceTypes(),
    listServiceRequests(scope),
  ]);

  const upcoming = jobs.filter((job) => ["scheduled", "en_route", "in_progress"].includes(job.status));
  const history = jobs
    .filter((job) => ["completed", "signed_off"].includes(job.status))
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));

  const canRequest = user.permissions.has("portal.request_service");

  return (
    <>
      <PageHeader
        title="Service history"
        description="Every visit Ecohygiene has made — and what is coming next."
        actions={
          <div className="flex items-center gap-2">
            <SiteSwitcher sites={sites.map((site) => ({ id: site.id, name: site.name }))} />
            {canRequest ? (
              <RequestServiceSheet
                sites={sites.map((site) => ({ id: site.id, name: site.name }))}
                serviceTypes={serviceTypes.map((type) => ({ id: type.id, name: type.name }))}
              />
            ) : null}
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {upcoming.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              icon={CalendarDays}
              title="Nothing scheduled"
              description="Your next visit will appear here as soon as it is booked."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatSchedule(job.scheduledAt)}
                    </TableCell>
                    <TableCell>{job.serviceTypeName}</TableCell>
                    <TableCell className="text-muted-foreground">{job.siteName}</TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {requests.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Your requests</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raised</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(request.createdAt)}
                    </TableCell>
                    <TableCell>{request.siteName}</TableCell>
                    <TableCell className="max-w-sm truncate">{request.description}</TableCell>
                    <TableCell>
                      <Badge variant={request.urgency === "routine" ? "muted" : "warning"}>
                        {titleCase(request.urgency)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={request.status === "scheduled" ? "success" : "info"}>
                        {titleCase(request.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Completed services</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              title="No completed services yet"
              description="Job reports with photos and sign-off appear here once a visit is finished."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <Link href={`/portal/services/${job.id}`} className="font-data hover:underline">
                        {job.reference}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(job.completedAt)}
                    </TableCell>
                    <TableCell>{job.serviceTypeName}</TableCell>
                    <TableCell className="text-muted-foreground">{job.siteName}</TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
