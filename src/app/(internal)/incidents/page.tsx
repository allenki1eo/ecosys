import { ShieldAlert, ShieldCheck } from "lucide-react";

import { IncidentStatusControl, ReportIncidentSheet } from "./incident-panel";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { IncidentStatusBadge, SeverityBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth/guards";
import { listSites } from "@/lib/data/clients";
import { listIncidents } from "@/lib/data/compliance";
import { scopeFor } from "@/lib/data/scope";
import { formatRelative } from "@/lib/format";

export const metadata = { title: "Incidents" };

export default async function IncidentsPage() {
  const user = await requireStaff();
  const scope = scopeFor(user);

  const [incidents, sites] = await Promise.all([listIncidents(scope), listSites(scope)]);

  const open = incidents.filter((incident) => incident.status === "open").length;
  const investigating = incidents.filter((incident) => incident.status === "investigating").length;
  const resolved = incidents.filter(
    (incident) => incident.status === "resolved" || incident.status === "closed",
  ).length;

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Site issues raised by crews, supervisors and clients — with the resolution trail."
        actions={
          user.permissions.has("incidents.create") ? <ReportIncidentSheet sites={sites} /> : null
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Open" value={open} icon={ShieldAlert} tone={open ? "critical" : "positive"} />
        <StatCard label="Investigating" value={investigating} tone={investigating ? "warning" : "neutral"} />
        <StatCard label="Resolved" value={resolved} icon={ShieldCheck} tone="positive" />
      </section>

      {incidents.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No incidents logged"
          description="Nothing has been raised at any client site. Crews can log issues from the job view."
        />
      ) : (
        <DataList
          rows={incidents}
          rowKey={(incident) => incident.id}
          columns={[
            {
              key: "issue",
              header: "Issue",
              role: "primary",
              className: "align-top",
              cell: (incident) => (
                <>
                  <span className="font-medium">{incident.title}</span>
                  <span className="mt-0.5 block max-w-md whitespace-normal text-xs text-muted-foreground">
                    {incident.description}
                  </span>
                  {incident.resolutionNotes ? (
                    <span className="mt-1 block max-w-md whitespace-normal text-xs text-brand-green">
                      Resolution: {incident.resolutionNotes}
                    </span>
                  ) : null}
                </>
              ),
            },
            {
              key: "site",
              header: "Client / site",
              role: "secondary",
              className: "align-top",
              cell: (incident) => `${incident.clientName} — ${incident.siteName}`,
            },
            {
              key: "status",
              header: "Status",
              role: "trailing",
              className: "align-top",
              cell: (incident) => <IncidentStatusBadge status={incident.status} />,
            },
            {
              key: "reference",
              header: "Reference",
              className: "font-data align-top",
              cell: (incident) => incident.reference,
            },
            {
              key: "severity",
              header: "Severity",
              className: "align-top",
              cell: (incident) => <SeverityBadge severity={incident.severity} />,
            },
            {
              key: "raised",
              header: "Raised",
              className: "align-top text-xs text-muted-foreground",
              cell: (incident) => (
                <>
                  {formatRelative(incident.createdAt)}
                  {incident.assignedToName ? (
                    <Badge variant="muted" className="ml-2">
                      {incident.assignedToName}
                    </Badge>
                  ) : null}
                </>
              ),
            },
            ...(user.permissions.has("incidents.resolve")
              ? [
                  {
                    key: "action",
                    header: "Action",
                    headerClassName: "text-right",
                    className: "text-right align-top",
                    cell: (incident: (typeof incidents)[number]) => (
                      <IncidentStatusControl incidentId={incident.id} status={incident.status} />
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
    </>
  );
}
