import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  FileWarning,
  PackageX,
  Receipt,
  ShieldAlert,
  Truck,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CompositionBar, TrendChart } from "@/components/charts";
import { JobStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { countClients, listExpiringContracts } from "@/lib/data/clients";
import { expiringCertificates } from "@/lib/data/compliance";
import { financeSummary } from "@/lib/data/finance";
import { lowStockItems } from "@/lib/data/inventory";
import { overdueJobs, recentlyCompleted } from "@/lib/data/jobs";
import {
  jobsCompletedTrend,
  jobsToday,
  openIncidentCount,
  revenueByServiceType,
  revenueTrend,
} from "@/lib/data/metrics";
import { scopeFor } from "@/lib/data/scope";
import { daysUntil, formatCompactCurrency, formatDate, formatSchedule, formatNumber } from "@/lib/format";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const user = await requireStaff();
  const scope = scopeFor(user);

  const canSeeFinance = user.permissions.has("invoices.view");
  const canSeeInventory = user.permissions.has("inventory.view");

  const [
    todayCount,
    activeClients,
    incidentCount,
    completedTrend,
    contracts,
    certificates,
    overdue,
    completed,
    finance,
    lowStock,
    revenue,
    serviceMix,
  ] = await Promise.all([
    jobsToday(scope),
    countClients(scope),
    openIncidentCount(scope),
    jobsCompletedTrend(scope),
    listExpiringContracts(scope, 30),
    expiringCertificates(scope, 30),
    overdueJobs(scope),
    recentlyCompleted(scope, 6),
    canSeeFinance ? financeSummary(scope) : null,
    canSeeInventory ? lowStockItems(scope) : [],
    canSeeFinance ? revenueTrend(scope) : [],
    canSeeFinance ? revenueByServiceType(scope) : [],
  ]);

  return (
    <>
      <PageHeader
        title={`Good day, ${user.name.split(" ")[0]}`}
        description="Company-wide picture across every client, crew and site."
        actions={
          <Button asChild size="sm">
            <Link href="/schedule">Open schedule</Link>
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Jobs today"
          value={formatNumber(todayCount)}
          caption={overdue.length ? `${overdue.length} past their slot` : "All on schedule"}
          icon={Truck}
          href="/schedule"
          tone={overdue.length ? "warning" : "neutral"}
        />
        <StatCard
          label="Active contracts"
          value={formatNumber(activeClients)}
          caption={
            contracts.length ? `${contracts.length} expiring within 30 days` : "None expiring soon"
          }
          icon={Building2}
          href="/clients"
          tone={contracts.length ? "warning" : "neutral"}
        />
        {canSeeFinance && finance ? (
          <StatCard
            label="Outstanding"
            value={formatCompactCurrency(finance.outstanding)}
            caption={
              finance.overdueCount
                ? `${finance.overdueCount} overdue · ${formatCompactCurrency(finance.overdue)}`
                : "Nothing overdue"
            }
            icon={Receipt}
            href="/finance"
            tone={finance.overdueCount ? "critical" : "neutral"}
          />
        ) : null}
        <StatCard
          label="Open incidents"
          value={formatNumber(incidentCount)}
          caption={incidentCount ? "Awaiting resolution" : "No open issues"}
          icon={ShieldAlert}
          href="/incidents"
          tone={incidentCount ? "warning" : "positive"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Jobs completed</CardTitle>
            <p className="text-xs text-muted-foreground">Last 6 months, all clients</p>
          </CardHeader>
          <CardContent>
            <TrendChart data={completedTrend} seriesName="Jobs completed" colorIndex={0} />
          </CardContent>
        </Card>

        {canSeeFinance ? (
          <Card>
            <CardHeader>
              <CardTitle>Invoiced revenue</CardTitle>
              <p className="text-xs text-muted-foreground">Last 6 months, TZS</p>
            </CardHeader>
            <CardContent>
              <TrendChart data={revenue} seriesName="Revenue" colorIndex={1} format="currency" />
            </CardContent>
          </Card>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Needs attention</CardTitle>
            <Badge variant="muted">{overdue.length + certificates.length + lowStock.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            <AttentionGroup
              icon={CalendarClock}
              title="Jobs past their scheduled slot"
              empty="Every scheduled job is on track."
              items={overdue.map((job) => ({
                key: job.id,
                href: `/jobs/${job.id}`,
                primary: `${job.reference} · ${job.serviceTypeName}`,
                secondary: `${job.clientName} — ${job.siteName}`,
                trailing: formatSchedule(job.scheduledAt),
              }))}
            />
            <AttentionGroup
              icon={FileWarning}
              title="Certificates expiring within 30 days"
              empty="No certificates lapse this month."
              items={certificates.map((certificate) => ({
                key: certificate.id,
                href: "/compliance",
                primary: `${certificate.reference} · ${certificate.siteName}`,
                secondary: certificate.clientName,
                trailing: `${daysUntil(certificate.expiresAt)}d left`,
              }))}
            />
            {canSeeInventory ? (
              <AttentionGroup
                icon={PackageX}
                title="Stock at or below reorder level"
                empty="All stock above reorder thresholds."
                items={lowStock.map((item) => ({
                  key: item.id,
                  href: "/inventory",
                  primary: `${item.name} (${item.sku})`,
                  secondary: item.supplierName ?? "No supplier set",
                  trailing: `${formatNumber(item.quantityOnHand, 1)} ${item.unit}`,
                }))}
              />
            ) : null}
            <AttentionGroup
              icon={AlertTriangle}
              title="Contracts expiring within 30 days"
              empty="No renewals due this month."
              items={contracts.map((client) => ({
                key: client.id,
                href: `/clients/${client.id}`,
                primary: client.name,
                secondary: `Ends ${formatDate(client.contractEnd)}`,
                trailing: `${daysUntil(client.contractEnd)}d left`,
              }))}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {canSeeFinance ? (
            <Card>
              <CardHeader>
                <CardTitle>Service mix this month</CardTitle>
              </CardHeader>
              <CardContent>
                <CompositionBar
                  segments={serviceMix.map((row) => ({ label: row.name, value: Number(row.value) }))}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Recently completed</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {completed.length === 0 ? (
                <EmptyState
                  className="m-4 border-0"
                  icon={Truck}
                  title="No completed jobs yet"
                  description="Completed jobs and their field reports appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completed.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <Link href={`/jobs/${job.id}`} className="hover:underline">
                            <span className="font-data">{job.reference}</span>
                            <span className="block text-xs text-muted-foreground">
                              {job.clientName} — {job.siteName}
                            </span>
                          </Link>
                        </TableCell>
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
        </div>
      </section>
    </>
  );
}

function AttentionGroup({
  icon: Icon,
  title,
  items,
  empty,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: { key: string; href: string; primary: string; secondary: string; trailing: string }[];
  empty: string;
}) {
  return (
    <div className="border-b px-5 py-4 last:border-b-0">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">{title}</p>
        <Badge variant="muted" className="ml-auto">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 5).map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
              >
                <span className="min-w-0 flex-1 truncate">
                  {item.primary}
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.secondary}
                  </span>
                </span>
                <span className="font-data shrink-0 text-muted-foreground">{item.trailing}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
