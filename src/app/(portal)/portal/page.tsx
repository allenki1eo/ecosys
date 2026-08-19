import Link from "next/link";
import { CalendarDays, FileCheck2, MapPin, Receipt, ShieldAlert } from "lucide-react";

import { RequestServiceSheet } from "./services/request-service";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { TrendChart } from "@/components/charts";
import { IncidentStatusBadge, JobStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireClientUser } from "@/lib/auth/guards";
import { getClient, listSites } from "@/lib/data/clients";
import { expiringCertificates, listCertificates, listIncidents } from "@/lib/data/compliance";
import { financeSummary } from "@/lib/data/finance";
import { listJobs } from "@/lib/data/jobs";
import { jobsCompletedTrend } from "@/lib/data/metrics";
import { scopeFor } from "@/lib/data/scope";
import { formatCompactCurrency, formatDate, formatSchedule } from "@/lib/format";

export const metadata = { title: "Portal" };

export default async function PortalOverviewPage() {
  const user = await requireClientUser();
  const scope = scopeFor(user);

  const [client, sites, upcoming, recent, certificates, expiring, incidents, finance, trend] =
    await Promise.all([
      getClient(scope, user.clientId),
      listSites(scope),
      listJobs(scope, { from: new Date(), status: ["scheduled", "en_route", "in_progress"], limit: 6 }),
      listJobs(scope, { status: ["completed", "signed_off"], limit: 6 }),
      listCertificates(scope),
      expiringCertificates(scope, 30),
      listIncidents(scope, ["open", "investigating"]),
      financeSummary(scope),
      jobsCompletedTrend(scope),
    ]);

  const canRequest = user.permissions.has("portal.request_service");

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description={`Your service position with Ecohygiene across ${sites.length} site${sites.length === 1 ? "" : "s"}.`}
        actions={canRequest ? <RequestServiceSheet sites={sites} /> : null}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Upcoming visits"
          value={upcoming.length}
          caption={upcoming[0] ? formatSchedule(upcoming[0].scheduledAt) : "Nothing scheduled"}
          icon={CalendarDays}
          href="/portal/services"
        />
        <StatCard
          label="Valid certificates"
          value={certificates.filter((c) => c.expiresAt.getTime() > Date.now()).length}
          caption={expiring.length ? `${expiring.length} expiring in 30 days` : "All current"}
          icon={FileCheck2}
          href="/portal/certificates"
          tone={expiring.length ? "warning" : "positive"}
        />
        <StatCard
          label="Open issues"
          value={incidents.length}
          caption={incidents.length ? "Being worked on" : "Nothing outstanding"}
          icon={ShieldAlert}
          href="/portal/incidents"
          tone={incidents.length ? "warning" : "positive"}
        />
        <StatCard
          label="Outstanding invoices"
          value={formatCompactCurrency(finance.outstanding)}
          caption={finance.overdueCount ? `${finance.overdueCount} overdue` : "Up to date"}
          icon={Receipt}
          href="/portal/invoices"
          tone={finance.overdueCount ? "critical" : "neutral"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Next scheduled visits</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {upcoming.length === 0 ? (
              <EmptyState
                className="m-4 border-0"
                icon={CalendarDays}
                title="No visits scheduled"
                description="Request an ad-hoc service if you need attention before the next cycle."
                action={canRequest ? <RequestServiceSheet sites={sites} /> : undefined}
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

        <Card>
          <CardHeader>
            <CardTitle>Services completed</CardTitle>
            <p className="text-xs text-muted-foreground">Last 6 months at your sites</p>
          </CardHeader>
          <CardContent>
            <TrendChart data={trend} seriesName="Services completed" colorIndex={0} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Latest reports</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <EmptyState className="m-4 border-0" title="No completed services yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <Link
                          href={`/portal/services/${job.id}`}
                          className="font-data hover:underline"
                        >
                          {job.reference}
                        </Link>
                      </TableCell>
                      <TableCell>{job.serviceTypeName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(job.completedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your sites</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sites.map((site) => (
              <div key={site.id} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{site.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {site.address ?? "No address recorded"}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {incidents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Open issues at your sites</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell className="font-data">{incident.reference}</TableCell>
                    <TableCell>{incident.title}</TableCell>
                    <TableCell className="text-muted-foreground">{incident.siteName}</TableCell>
                    <TableCell>
                      <IncidentStatusBadge status={incident.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {client?.contractEnd ? (
        <p className="text-xs text-muted-foreground">
          Service contract runs to {formatDate(client.contractEnd)}.
        </p>
      ) : null}
    </>
  );
}
