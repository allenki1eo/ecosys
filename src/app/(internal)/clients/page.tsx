import Link from "next/link";
import { Building2 } from "lucide-react";

import { NewClientSheet } from "./client-forms";
import { PageHeader } from "@/components/page-header";
import { ClientStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { listClients } from "@/lib/data/clients";
import { scopeFor } from "@/lib/data/scope";
import { daysUntil, formatCompactCurrency, formatDate } from "@/lib/format";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const user = await requireStaff();
  const clients = await listClients(scopeFor(user));
  const canManage = user.permissions.has("clients.manage");

  return (
    <>
      <PageHeader
        title="Clients"
        description="Every sub-company Ecohygiene serves, with their sites and contract position."
        actions={canManage ? <NewClientSheet /> : null}
      />

      {clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Add your first client company to start scheduling work and issuing certificates."
          action={canManage ? <NewClientSheet /> : undefined}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Sites</TableHead>
                <TableHead>Open jobs</TableHead>
                <TableHead>Outstanding</TableHead>
                <TableHead>Contract ends</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => {
                const remaining = daysUntil(client.contractEnd);
                return (
                  <TableRow key={client.id}>
                    <TableCell>
                      <Link href={`/clients/${client.id}`} className="font-medium hover:underline">
                        {client.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {client.industry ?? "Industry not set"}
                      </span>
                    </TableCell>
                    <TableCell className="font-data">{client.siteCount}</TableCell>
                    <TableCell className="font-data">{client.openJobs}</TableCell>
                    <TableCell className="font-data">
                      {formatCompactCurrency(client.outstandingAmount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-muted-foreground">{formatDate(client.contractEnd)}</span>
                      {remaining !== null && remaining <= 30 && remaining >= 0 ? (
                        <Badge variant="warning" className="ml-2">
                          {remaining}d
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <ClientStatusBadge status={client.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
