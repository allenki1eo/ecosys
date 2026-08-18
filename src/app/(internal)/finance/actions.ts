"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import {
  generateInvoiceFromJobs,
  markOverdueInvoices,
  recordPayment,
  setInvoiceStatus,
} from "@/lib/data/finance";
import { INVOICE_STATUSES } from "@db/schema";

export async function generateInvoiceAction(clientId: string): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("invoices.manage");
    const id = await generateInvoiceFromJobs(scope, clientId);
    revalidatePath("/finance");
    if (!id) return { ok: false, error: "No completed, unbilled jobs for that client." };
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

export async function setInvoiceStatusAction(
  invoiceId: string,
  status: string,
): Promise<ActionResult> {
  try {
    const parsed = z.enum(INVOICE_STATUSES).parse(status);
    const { scope } = await withScope("invoices.manage");
    await setInvoiceStatus(scope, invoiceId, parsed);
    revalidatePath("/finance");
    revalidatePath(`/finance/${invoiceId}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Enter the amount received"),
  method: z.enum(["bank_transfer", "mobile_money", "cash", "cheque"]),
  reference: z.string().optional(),
});

export async function recordPaymentAction(
  invoiceId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("invoices.record_payment");
    const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    await recordPayment(scope, invoiceId, parsed.data.amount, parsed.data.method, parsed.data.reference);
    revalidatePath("/finance");
    revalidatePath(`/finance/${invoiceId}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

/** Sweeps issued invoices past their due date into `overdue`. */
export async function sweepOverdueAction(): Promise<ActionResult> {
  try {
    const { scope } = await withScope("invoices.manage");
    await markOverdueInvoices(scope);
    revalidatePath("/finance");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
