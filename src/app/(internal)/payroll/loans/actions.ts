"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import {
  createLoan,
  deleteLoan,
  deleteManualRepayment,
  recordManualRepayment,
  updateLoan,
  writeOffLoan,
} from "@/lib/data/loans";
import { LOAN_KINDS } from "@db/schema";

const periodPattern = /^\d{4}-\d{2}$/;

const loanSchema = z.object({
  employeeId: z.string().min(1, "Choose the employee"),
  kind: z.enum(LOAN_KINDS).default("loan"),
  principal: z.coerce.number().int().positive("Enter the amount advanced"),
  monthlyDeduction: z.coerce.number().int().positive("Enter the monthly deduction"),
  startPeriod: z.string().regex(periodPattern, "Choose the month deductions start"),
  reason: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

function revalidateLoans(loanId?: string) {
  revalidatePath("/payroll");
  revalidatePath("/payroll/loans");
  if (loanId) revalidatePath(`/payroll/loans/${loanId}`);
}

export async function createLoanAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("payroll.manage");
    const parsed = loanSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }
    const id = await createLoan(scope, {
      ...parsed.data,
      reason: parsed.data.reason || null,
      notes: parsed.data.notes || null,
    });
    revalidateLoans();
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

const editSchema = loanSchema.pick({
  monthlyDeduction: true,
  startPeriod: true,
  reason: true,
  notes: true,
});

export async function updateLoanAction(
  loanId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("payroll.manage");
    const parsed = editSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }
    await updateLoan(scope, loanId, {
      ...parsed.data,
      reason: parsed.data.reason || null,
      notes: parsed.data.notes || null,
    });
    revalidateLoans(loanId);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function writeOffLoanAction(loanId: string, reinstate = false): Promise<ActionResult> {
  try {
    const { scope } = await withScope("payroll.manage");
    await writeOffLoan(scope, loanId, reinstate);
    revalidateLoans(loanId);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteLoanAction(loanId: string): Promise<ActionResult> {
  try {
    const { scope } = await withScope("payroll.manage");
    await deleteLoan(scope, loanId);
    revalidateLoans();
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

const repaymentSchema = z.object({
  amount: z.coerce.number().int().positive("Enter the amount repaid"),
  period: z.string().regex(periodPattern, "Choose the month this repayment belongs to"),
  note: z.string().max(200).optional(),
});

export async function recordRepaymentAction(
  loanId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("payroll.manage");
    const parsed = repaymentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }
    await recordManualRepayment(scope, loanId, {
      ...parsed.data,
      note: parsed.data.note || null,
    });
    revalidateLoans(loanId);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteRepaymentAction(
  loanId: string,
  repaymentId: string,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("payroll.manage");
    await deleteManualRepayment(scope, repaymentId);
    revalidateLoans(loanId);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
