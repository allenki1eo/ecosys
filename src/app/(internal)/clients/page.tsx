import Link from "next/link";
import { Building2, MapPin, Receipt, Truck } from "lucide-react";

import { ClientFormSheet } from "./client-forms";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ClientStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth/guards";
import { listClients } from "@/lib/data/clients";
import { scopeFor } from "@/lib/data/scope";
import { daysUntil, formatCompactCurrency, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const user = await requireStaff();
  const clients = await listClients(scopeFor(user));
  const canManage = user.permissions.has("clients.manage");
  const canSeeFinance = user.permissions.has("invoices.view");

  const totals = clients.reduce(
    (acc, client) => ({
      sites: acc.sites + client.siteCount,
      openJobs: acc.openJobs + client.openJobs,
      outstanding: acc.outstanding + client.outstandingAmount,
      expiring:
        acc.expiring +
        (() => {
          const days = daysUntil(client.contractEnd);
          return days !== null && days >= 0 && days <= 30 ? 1 : 0;
        })(),
    }),
    { sites: 0, openJobs: 0, outstanding: 0, expiring: 0 },
  );

  return (
    <>
      <PageHeader
        title="Clients"
        description="Every company Ecohygiene serves, with their sites, workload and contract position."
        actions={canManage ? <ClientFormSheet /> : null}
      />

      {clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Add your first client company to start scheduling work and issuing certificates."
          action={canManage ? <ClientFormSheet /> : undefined}
        />
      ) : (
        <>
          {/* The portfolio in one line, before the per-company detail. */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Companies" value={clients.length} icon={Building2} />
            <StatCard label="Sites served" value={totals.sites} icon={MapPin} />
            <StatCard
              label="Jobs in flight"
              value={totals.openJobs}
              icon={Truck}
              caption="Scheduled, en route or in progress"
            />
            {canSeeFinance ? (
              <StatCard
                label="Outstanding"
                value={formatCompactCurrency(totals.outstanding)}
                icon={Receipt}
                tone={totals.outstanding > 0 ? "warning" : "positive"}
                caption="Across all clients"
              />
            ) : (
              <StatCard
                label="Contracts expiring"
                value={totals.expiring}
                tone={totals.expiring ? "warning" : "positive"}
                caption="Within 30 days"
              />
            )}
          </section>

          {/* One card per company: everything a director asks about, together
              and legible at any width. */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((client) => {
              const remaining = daysUntil(client.contractEnd);
              const expiringSoon = remaining !== null && remaining >= 0 && remaining <= 30;
              const expired = remaining !== null && remaining < 0;

              return (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="group rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Card className="h-full transition-colors group-hover:border-brand-green/40 group-hover:bg-accent/20">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate font-medium">{client.name}</h2>
                          <p className="truncate text-xs text-muted-foreground">
                            {client.industry ?? "Industry not set"}
                          </p>
                        </div>
                        <ClientStatusBadge status={client.status} />
                      </div>

                      <dl className="grid grid-cols-3 gap-3">
                        <Metric label="Sites" value={formatNumber(client.siteCount)} />
                        <Metric label="Open jobs" value={formatNumber(client.openJobs)} />
                        {canSeeFinance ? (
                          <Metric
                            label="Owed"
                            value={formatCompactCurrency(client.outstandingAmount)}
                            tone={client.outstandingAmount > 0 ? "warning" : undefined}
                          />
                        ) : (
                          <Metric label="Contract" value={remaining !== null ? `${remaining}d` : "—"} />
                        )}
                      </dl>

                      <div className="flex items-center justify-between gap-2 border-t pt-3">
                        <span className="text-xs text-muted-foreground">
                          Contract ends {formatDate(client.contractEnd)}
                        </span>
                        {expired ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : expiringSoon ? (
                          <Badge variant="warning">{remaining}d left</Badge>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("truncate font-data text-sm", tone === "warning" && "text-amber-500")}>
        {value}
      </dd>
    </div>
  );
}
