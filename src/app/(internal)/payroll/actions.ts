"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import {
  adjustPayslip,
  createEmployee,
  createPayrollRun,
  deletePayrollRun,
  getPayrollRun,
  getPayslip,
  markPayslipSent,
  setEmployeeActive,
  setPayrollRunStatus,
  updateEmployee,
} from "@/lib/data/payroll";
import { queueNotification } from "@/lib/notifications";
import { formatPeriod } from "@/lib/payroll/calculate";
import { EMPLOYMENT_MODES, PAYROLL_RUN_STATUSES } from "@db/schema";

const employeeSchema = z.object({
  employeeNo: z.string().min(1, "Enter an employee number"),
  name: z.string().min(2, "Enter the employee's name"),
  designation: z.string().optional(),
  department: z.string().optional(),
  employmentMode: z.enum(EMPLOYMENT_MODES).default("specified"),
  nidaNumber: z.string().optional(),
  nssfNumber: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNo: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  basicSalary: z.coerce.number().int().min(0, "Salary cannot be negative"),
  untaxableAllowance: z.coerce.number().int().min(0).default(0),
  responsibilityAllowance: z.coerce.number().int().min(0).default(0),
  monthlyHours: z.coerce.number().int().min(1).max(744).default(195),
  notes: z.string().max(500).optional(),
});

function toEmployeeInput(data: z.infer<typeof employeeSchema>) {
  return {
    ...data,
    designation: data.designation || null,
    department: data.department || null,
    nidaNumber: data.nidaNumber || null,
    nssfNumber: data.nssfNumber || null,
    bankName: data.bankName || null,
    bankAccountNo: data.bankAccountNo || null,
    phone: data.phone || null,
    email: data.email || null,
    notes: data.notes || null,
  };
}

export async function createEmployeeAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("payroll.manage");
    const parsed = employeeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }
    const id = await createEmployee(scope, toEmployeeInput(parsed.data));
    revalidatePath("/payroll/employees");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateEmployeeAction(
  employeeId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("payroll.manage");
    const parsed = employeeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }
    await updateEmployee(scope, employeeId, toEmployeeInput(parsed.data));
    revalidatePath("/payroll/employees");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function setEmployeeActiveAction(
  employeeId: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("payroll.manage");
    await setEmployeeActive(scope, employeeId, isActive);
    revalidatePath("/payroll/employees");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

const runSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Choose the month this run pays for"),
  label: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
});

export async function createPayrollRunAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("payroll.manage");
    const parsed = runSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }
    const id = await createPayrollRun(scope, {
      period: parsed.data.period,
      label: parsed.data.label,
      notes: parsed.data.notes || null,
    });
    revalidatePath("/payroll");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

/** An empty number field means "leave it alone", not zero. */
const optionalInt = z
  .union([z.literal(""), z.coerce.number().int().min(0)])
  .optional()
  .transform((value) => (value === "" || value === undefined ? undefined : value));

const adjustmentSchema = z.object({
  daysWorked: z.coerce.number().int().min(0).max(31).optional(),
  earnedLeaveDays: z.coerce.number().int().min(0).max(31).optional(),
  sickLeaveDays: z.coerce.number().int().min(0).max(31).optional(),
  overtimeNormalHours: z.coerce.number().min(0).max(400).optional(),
  publicHolidayHours: z.coerce.number().min(0).max(400).optional(),
  responsibilityAllowance: optionalInt,
  untaxableAllowance: optionalInt,
  loanDeduction: optionalInt,
  otherDeductions: optionalInt,
  /** Blank returns PAYE to the bands; a figure overrides them. */
  payeOverride: optionalInt,
  notes: z.string().max(300).optional(),
});

export async function adjustPayslipAction(
  payslipId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("payroll.manage");
    const parsed = adjustmentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }
    await adjustPayslip(scope, payslipId, {
      ...parsed.data,
      // Distinguish "left blank" from "not submitted": the form always posts the
      // field, so a blank one is an instruction to clear the override.
      payeOverride: formData.has("payeOverride") ? (parsed.data.payeOverride ?? null) : undefined,
      notes: parsed.data.notes || null,
    });
    revalidatePath("/payroll");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function setRunStatusAction(runId: string, status: string): Promise<ActionResult> {
  try {
    const parsed = z.enum(PAYROLL_RUN_STATUSES).parse(status);
    const { scope } = await withScope("payroll.manage");
    await setPayrollRunStatus(scope, runId, parsed);
    revalidatePath("/payroll");
    revalidatePath(`/payroll/${runId}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deletePayrollRunAction(runId: string): Promise<ActionResult> {
  try {
    const { scope } = await withScope("payroll.manage");
    await deletePayrollRun(scope, runId);
    revalidatePath("/payroll");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

/**
 * Queues a payslip to one employee through the notification outbox, so a failed
 * send is retried and visible rather than lost. The payslip PDF is fetched from
 * its own link — the message carries the link, not an attachment, because SMS
 * cannot carry one and email delivery here is queue-first.
 */
export async function sendPayslipAction(payslipId: string): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("payroll.send");
    const payslip = await getPayslip(scope, payslipId);
    if (!payslip) return { ok: false, error: "Payslip not found" };
    if (payslip.run.status === "draft") {
      return { ok: false, error: "Finalise the run before sending payslips." };
    }

    const { employees } = await import("@db/schema");
    const { db } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    const [employee] = await db
      .select({ email: employees.email, phone: employees.phone })
      .from(employees)
      .where(eq(employees.id, payslip.employeeId))
      .limit(1);

    const recipient = employee?.email || employee?.phone;
    if (!recipient) {
      return {
        ok: false,
        error: `No email or phone on record for ${payslip.employeeName}. Add one on their employee record.`,
      };
    }

    const channel = employee?.email ? "email" : "sms";
    const period = formatPeriod(payslip.run.period);

    await queueNotification({
      channel,
      recipient,
      template: "payslip",
      body:
        channel === "email"
          ? `Dear ${payslip.employeeName},\n\nYour payslip for ${period} is ready. Net salary payable: TZS ${payslip.totalEarning.toLocaleString("en-GB")}.\n\nEcohygiene Company Limited`
          : `Ecohygiene: your ${period} payslip is ready. Salary payable TZS ${payslip.totalEarning.toLocaleString("en-GB")}.`,
    });

    await markPayslipSent(payslipId, recipient);
    revalidatePath(`/payroll/${payslip.payrollRunId}`);
    return { ok: true, data: recipient };
  } catch (error) {
    return actionError(error);
  }
}

/** Sends every unsent payslip on a finalised run. */
export async function sendAllPayslipsAction(runId: string): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("payroll.send");
    const run = await getPayrollRun(scope, runId);
    if (!run) return { ok: false, error: "Payroll run not found" };
    if (run.status === "draft") {
      return { ok: false, error: "Finalise the run before sending payslips." };
    }

    let sent = 0;
    const skipped: string[] = [];
    for (const payslip of run.payslips) {
      if (payslip.sentAt) continue;
      const result = await sendPayslipAction(payslip.id);
      if (result.ok) sent++;
      else skipped.push(payslip.employeeName);
    }

    revalidatePath(`/payroll/${runId}`);
    return {
      ok: true,
      data:
        skipped.length === 0
          ? `${sent} payslip(s) queued.`
          : `${sent} queued. No contact details for: ${skipped.join(", ")}.`,
    };
  } catch (error) {
    return actionError(error);
  }
}
