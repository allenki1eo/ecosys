import { ShieldAlert, ShieldCheck } from "lucide-react";

import { IncidentStatusControl, ReportIncidentSheet } from "./incident-panel";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { IncidentStatusBadge, SeverityBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Client / site</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Raised</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.map((incident) => (
                <TableRow key={incident.id}>
                  <TableCell className="font-data align-top">{incident.reference}</TableCell>
                  <TableCell className="align-top">
                    <span className="font-medium">{incident.title}</span>
                    <span className="mt-0.5 block max-w-md text-xs text-muted-foreground">
                      {incident.description}
                    </span>
                    {incident.resolutionNotes ? (
                      <span className="mt-1 block max-w-md text-xs text-brand-green">
                        Resolution: {incident.resolutionNotes}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    {incident.clientName}
                    <span className="block text-xs text-muted-foreground">{incident.siteName}</span>
                  </TableCell>
                  <TableCell className="align-top">
                    <SeverityBadge severity={incident.severity} />
                  </TableCell>
                  <TableCell className="align-top">
                    <IncidentStatusBadge status={incident.status} />
                  </TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">
                    {formatRelative(incident.createdAt)}
                    {incident.assignedToName ? (
                      <Badge variant="muted" className="ml-2">
                        {incident.assignedToName}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    {user.permissions.has("incidents.resolve") ? (
                      <IncidentStatusControl incidentId={incident.id} status={incident.status} />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
