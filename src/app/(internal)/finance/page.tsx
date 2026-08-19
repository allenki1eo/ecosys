import Link from "next/link";
import { Receipt } from "lucide-react";

import { GenerateInvoiceDialog, InvoiceStatusControl, SweepOverdueButton } from "./finance-controls";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CompositionBar, TrendChart } from "@/components/charts";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { listClients } from "@/lib/data/clients";
import { financeSummary, listInvoices } from "@/lib/data/finance";
import { revenueByServiceType, revenueTrend } from "@/lib/data/metrics";
import { scopeFor } from "@/lib/data/scope";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";

export const metadata = { title: "Finance" };

export default async function FinancePage() {
  const user = await requireStaff();
  const scope = scopeFor(user);

  if (!user.permissions.has("invoices.view")) {
    return (
      <EmptyState
        icon={Receipt}
        title="Finance is restricted"
        description="Your role does not include access to invoices and payments."
      />
    );
  }

  const [invoices, summary, clients, revenue, serviceMix] = await Promise.all([
    listInvoices(scope),
    financeSummary(scope),
    listClients(scope),
    revenueTrend(scope),
    revenueByServiceType(scope),
  ]);

  const canManage = user.permissions.has("invoices.manage");

  return (
    <>
      <PageHeader
        title="Finance"
        description="Invoices generated from completed jobs, payments and revenue trend."
        actions={
          canManage ? (
            <div className="flex gap-2">
              <SweepOverdueButton />
              <GenerateInvoiceDialog clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
            </div>
          ) : null
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={formatCompactCurrency(summary.outstanding)}
          caption="Issued but unpaid"
          icon={Receipt}
        />
        <StatCard
          label="Overdue"
          value={formatCompactCurrency(summary.overdue)}
          caption={`${summary.overdueCount} invoice(s)`}
          tone={summary.overdueCount ? "critical" : "positive"}
        />
        <StatCard
          label="Collected this month"
          value={formatCompactCurrency(summary.paidThisMonth)}
          tone="positive"
        />
        <StatCard label="Invoices" value={invoices.length} caption="All time" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Invoiced revenue</CardTitle>
            <p className="text-xs text-muted-foreground">Last 6 months, TZS</p>
          </CardHeader>
          <CardContent>
            <TrendChart data={revenue} seriesName="Revenue" colorIndex={1} format="currency" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Revenue by service type</CardTitle>
            <p className="text-xs text-muted-foreground">Completed jobs this month</p>
          </CardHeader>
          <CardContent>
            <CompositionBar
              segments={serviceMix.map((row) => ({ label: row.name, value: Number(row.value) }))}
            />
          </CardContent>
        </Card>
      </section>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Generate an invoice from a client's completed, unbilled jobs."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="text-right">Action</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link href={`/finance/${invoice.id}`} className="font-data hover:underline">
                      {invoice.number}
                    </Link>
                  </TableCell>
                  <TableCell>{invoice.clientName}</TableCell>
                  <TableCell className="font-data">{formatCurrency(invoice.amount)}</TableCell>
                  <TableCell className="font-data text-muted-foreground">
                    {formatCurrency(invoice.paidAmount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(invoice.dueDate)}</TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={invoice.status} />
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <InvoiceStatusControl invoiceId={invoice.id} status={invoice.status} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
