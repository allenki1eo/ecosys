import { Receipt } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
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
        <DataList
          rows={invoices}
          rowKey={(invoice) => invoice.id}
          columns={[
            {
              key: "number",
              header: "Number",
              role: "primary",
              className: "font-data",
              cell: (invoice) => invoice.number,
            },
            {
              key: "amount",
              header: "Amount",
              role: "secondary",
              className: "font-data",
              cell: (invoice) => formatCurrency(invoice.amount),
            },
            {
              key: "status",
              header: "Status",
              role: "trailing",
              cell: (invoice) => <InvoiceStatusBadge status={invoice.status} />,
            },
            {
              key: "issued",
              header: "Issued",
              className: "text-muted-foreground",
              cell: (invoice) => formatDate(invoice.issuedAt),
            },
            {
              key: "due",
              header: "Due",
              className: "text-muted-foreground",
              cell: (invoice) => formatDate(invoice.dueDate),
            },
            {
              key: "paid",
              header: "Paid",
              className: "font-data text-muted-foreground",
              cell: (invoice) => formatCurrency(invoice.paidAmount),
            },
          ]}
        />
      )}
    </>
  );
}
