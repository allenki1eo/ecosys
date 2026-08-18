import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { RecordPaymentForm } from "../finance-controls";
import { PageHeader } from "@/components/page-header";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { getInvoice } from "@/lib/data/finance";
import { scopeFor } from "@/lib/data/scope";
import { formatCurrency, formatDate, formatDateTime, titleCase } from "@/lib/format";

export default async function InvoiceDetailPage({ params }: { params: { invoiceId: string } }) {
  const user = await requireStaff();
  if (!user.permissions.has("invoices.view")) notFound();

  const invoice = await getInvoice(scopeFor(user), params.invoiceId);
  if (!invoice) notFound();

  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(invoice.amount - paid, 0);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/finance">
          <ArrowLeft /> All invoices
        </Link>
      </Button>

      <PageHeader
        title={invoice.number}
        description={`${invoice.clientName} · due ${formatDate(invoice.dueDate)}`}
        actions={<InvoiceStatusBadge status={invoice.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.description}</TableCell>
                      <TableCell className="font-data text-muted-foreground">
                        {line.jobReference ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-data">{line.quantity}</TableCell>
                      <TableCell className="text-right font-data text-muted-foreground">
                        {formatCurrency(line.unitAmount)}
                      </TableCell>
                      <TableCell className="text-right font-data">
                        {formatCurrency(line.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {invoice.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing received yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {invoice.payments.map((payment) => (
                    <li key={payment.id} className="flex items-center gap-3">
                      <span className="font-data">{formatCurrency(payment.amount)}</span>
                      <span className="text-muted-foreground">{titleCase(payment.method)}</span>
                      {payment.reference ? (
                        <span className="font-data text-xs text-muted-foreground">
                          {payment.reference}
                        </span>
                      ) : null}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatDateTime(payment.receivedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {user.permissions.has("invoices.record_payment") && balance > 0 ? (
                <RecordPaymentForm invoiceId={invoice.id} balance={balance} />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Invoice total" value={formatCurrency(invoice.amount)} />
              <Row label="Received" value={formatCurrency(paid)} />
              <Row label="Balance" value={formatCurrency(balance)} strong />
              <Row label="Issued" value={formatDate(invoice.issuedAt)} />
              <Row label="Due" value={formatDate(invoice.dueDate)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{invoice.billingContact ?? "Not recorded"}</p>
              <p className="text-muted-foreground">{invoice.billingEmail ?? "No email"}</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-data font-semibold" : "font-data"}>{value}</span>
    </div>
  );
}
