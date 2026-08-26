import Link from "next/link";
import { Download, Receipt } from "lucide-react";

import { GenerateInvoiceDialog, InvoiceStatusControl, SweepOverdueButton } from "./finance-controls";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CompositionBar, TrendChart } from "@/components/charts";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
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
        <DataList
          rows={invoices}
          rowKey={(invoice) => invoice.id}
          columns={[
            {
              key: "number",
              header: "Number",
              role: "primary",
              cell: (invoice) => (
                <Link href={`/finance/${invoice.id}`} className="font-data hover:underline">
                  {invoice.number}
                </Link>
              ),
            },
            {
              key: "client",
              header: "Client",
              role: "secondary",
              cell: (invoice) => invoice.clientName,
            },
            {
              key: "status",
              header: "Status",
              role: "trailing",
              cell: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
            },
            {
              key: "amount",
              header: "Amount",
              className: "font-data",
              cell: (invoice) => formatCurrency(invoice.amount),
            },
            {
              key: "paid",
              header: "Paid",
              className: "font-data text-muted-foreground",
              cell: (invoice) => formatCurrency(invoice.paidAmount),
            },
            {
              key: "due",
              header: "Due",
              className: "text-muted-foreground",
              cell: (invoice) => formatDate(invoice.dueDate),
            },
            {
              key: "pdf",
              header: "PDF",
              cell: (invoice) => (
                <a
                  href={`/api/documents/invoice/${invoice.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-brand-blue hover:underline"
                >
                  <Download className="size-3.5" /> Download
                </a>
              ),
            },
            ...(canManage
              ? [
                  {
                    key: "action",
                    header: "Action",
                    headerClassName: "text-right",
                    className: "text-right",
                    desktopOnly: true,
                    cell: (invoice: (typeof invoices)[number]) => (
                      <InvoiceStatusControl invoiceId={invoice.id} status={invoice.status} />
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
