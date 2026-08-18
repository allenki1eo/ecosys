import { Receipt } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireClientUser } from "@/lib/auth/guards";
import { financeSummary, listInvoices } from "@/lib/data/finance";
import { scopeFor } from "@/lib/data/scope";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";

export const metadata = { title: "Invoices" };

export default async function PortalInvoicesPage() {
  const user = await requireClientUser();
  const scope = scopeFor(user);

  const [invoices, summary] = await Promise.all([listInvoices(scope), financeSummary(scope)]);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Statements for services delivered at your sites."
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Outstanding"
          value={formatCompactCurrency(summary.outstanding)}
          icon={Receipt}
          tone={summary.outstanding ? "warning" : "positive"}
        />
        <StatCard
          label="Overdue"
          value={formatCompactCurrency(summary.overdue)}
          caption={`${summary.overdueCount} invoice(s)`}
          tone={summary.overdueCount ? "critical" : "positive"}
        />
        <StatCard label="Invoices" value={invoices.length} caption="All time" />
      </section>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Invoices appear here once Ecohygiene issues them for completed work."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-data">{invoice.number}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(invoice.issuedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(invoice.dueDate)}
                  </TableCell>
                  <TableCell className="font-data">{formatCurrency(invoice.amount)}</TableCell>
                  <TableCell className="font-data text-muted-foreground">
                    {formatCurrency(invoice.paidAmount)}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={invoice.status} />
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
