import { NextResponse } from "next/server";

import { InvoiceDocument } from "@/lib/pdf/invoice";
import { pdfResponse, slugForFile } from "@/lib/pdf/render";
import { getCurrentUser } from "@/lib/auth/session";
import { getInvoice } from "@/lib/data/finance";
import { scopeFor } from "@/lib/data/scope";

// @react-pdf/renderer needs the Node runtime, not the edge one.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Invoice PDF. `getInvoice` applies the caller's tenant scope, so a client user
 * can download their own invoices and nobody else's — the same rule the UI uses.
 */
export async function GET(_request: Request, { params }: { params: { invoiceId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.permissions.has("invoices.view") && !user.permissions.has("portal.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoice = await getInvoice(scopeFor(user), params.invoiceId);
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return pdfResponse(
    InvoiceDocument({
      invoice: {
        number: invoice.number,
        clientName: invoice.clientName,
        billingContact: invoice.billingContact,
        billingEmail: invoice.billingEmail,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        issuedAt: invoice.issuedAt,
        dueDate: invoice.dueDate,
        notes: invoice.notes,
        lines: invoice.lines,
        payments: invoice.payments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          method: payment.method,
          receivedAt: payment.receivedAt,
          reference: payment.reference,
        })),
      },
    }),
    `${slugForFile(invoice.number)}.pdf`,
  );
}
