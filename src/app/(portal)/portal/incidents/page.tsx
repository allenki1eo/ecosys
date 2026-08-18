import { ShieldCheck } from "lucide-react";

import { RaiseIssueSheet } from "../services/request-service";
import { PageHeader } from "@/components/page-header";
import { IncidentStatusBadge, SeverityBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireClientUser } from "@/lib/auth/guards";
import { listSites } from "@/lib/data/clients";
import { listIncidents } from "@/lib/data/compliance";
import { scopeFor } from "@/lib/data/scope";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Incidents" };

export default async function PortalIncidentsPage() {
  const user = await requireClientUser();
  const scope = scopeFor(user);

  const [incidents, sites] = await Promise.all([listIncidents(scope), listSites(scope)]);
  const canRaise = user.permissions.has("portal.request_service");

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Issues raised at your sites and how they were resolved."
        actions={
          canRaise ? <RaiseIssueSheet sites={sites.map((s) => ({ id: s.id, name: s.name }))} /> : null
        }
      />

      {incidents.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No issues on record"
          description="Nothing has been raised at your sites. If you spot something, raise it here and the ops team is notified."
          action={
            canRaise ? <RaiseIssueSheet sites={sites.map((s) => ({ id: s.id, name: s.name }))} /> : undefined
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Raised</TableHead>
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
                        Resolved: {incident.resolutionNotes}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top text-muted-foreground">
                    {incident.siteName}
                  </TableCell>
                  <TableCell className="align-top">
                    <SeverityBadge severity={incident.severity} />
                  </TableCell>
                  <TableCell className="align-top">
                    <IncidentStatusBadge status={incident.status} />
                  </TableCell>
                  <TableCell className="align-top text-xs text-muted-foreground">
                    {formatDate(incident.createdAt)}
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
