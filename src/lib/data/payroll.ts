import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  employees,
  payrollRuns,
  payslips,
  type EmploymentMode,
  type PayrollRates,
  type PayrollRunStatus,
} from "@db/schema";
import { newId, newReference } from "@/lib/ids";
import { recordAudit } from "@/lib/data/audit";
import { allocateRepayments, assertRunRepaymentsFit, loansDueFor } from "@/lib/data/loans";
import { hasPermission, type Scope } from "@/lib/data/scope";
import { calculatePayslip, DEFAULT_RATES, formatPeriod } from "@/lib/payroll/calculate";

/** Payroll is Ecohygiene-internal and never reachable from a client portal. */
function assertInternal(scope: Scope) {
  if (scope.clientId) throw new Error("Payroll is not accessible from client portals");
}

function assertCanManage(scope: Scope) {
  assertInternal(scope);
  if (!hasPermission(scope, "payroll.manage")) {
    throw new Error("Missing permission: payroll.manage");
  }
}

function assertCanView(scope: Scope) {
  assertInternal(scope);
  if (!hasPermission(scope, "payroll.view")) {
    throw new Error("Missing permission: payroll.view");
  }
}

/* -------------------------------- employees ------------------------------- */

export async function listEmployees(scope: Scope, includeInactive = false) {
  assertCanView(scope);
  return db
    .select()
    .from(employees)
    .where(includeInactive ? undefined : eq(employees.isActive, true))
    .orderBy(asc(employees.employeeNo));
}

export async function getEmployee(scope: Scope, employeeId: string) {
  assertCanView(scope);
  const [row] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  return row;
}

export type EmployeeInput = {
  employeeNo: string;
  name: string;
  designation?: string | null;
  department?: string | null;
  employmentMode: EmploymentMode;
  nidaNumber?: string | null;
  nssfNumber?: string | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  phone?: string | null;
  email?: string | null;
  basicSalary: number;
  untaxableAllowance: number;
  responsibilityAllowance: number;
  monthlyHours: number;
  isActive?: boolean;
  notes?: string | null;
};

export async function createEmployee(scope: Scope, input: EmployeeInput) {
  assertCanManage(scope);
  const id = newId("emp");
  await db.insert(employees).values({ id, ...input });
  await recordAudit(scope, "employee.create", "employee", id, { name: input.name });
  return id;
}

export async function updateEmployee(scope: Scope, employeeId: string, input: EmployeeInput) {
  assertCanManage(scope);
  await db.update(employees).set(input).where(eq(employees.id, employeeId));
  // Payslips already issued keep their own snapshot, so this never rewrites history.
  await recordAudit(scope, "employee.update", "employee", employeeId, { name: input.name });
}

export async function setEmployeeActive(scope: Scope, employeeId: string, isActive: boolean) {
  assertCanManage(scope);
  await db.update(employees).set({ isActive }).where(eq(employees.id, employeeId));
  await recordAudit(scope, isActive ? "employee.activate" : "employee.deactivate", "employee", employeeId, {});
}

/* ------------------------------ payroll runs ------------------------------ */

export async function listPayrollRuns(scope: Scope) {
  assertCanView(scope);
  return db.select().from(payrollRuns).orderBy(desc(payrollRuns.period));
}

export async function getPayrollRun(scope: Scope, runId: string) {
  assertCanView(scope);
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1);
  if (!run) return undefined;

  const lines = await db
    .select({
      payslip: payslips,
      // Needed to preview the recalculation while editing — hours live on the
      // employee, not on the payslip snapshot.
      monthlyHours: employees.monthlyHours,
      /** What this payslip's loan deduction is recovering, as a label. */
      loanReferences: sql<string | null>`(
        select group_concat("l"."reference", ', ')
        from "loan_repayments" "r"
        join "employee_loans" "l" on "l"."id" = "r"."loan_id"
        where "r"."payslip_id" = "payslips"."id"
      )`,
    })
    .from(payslips)
    .innerJoin(employees, eq(payslips.employeeId, employees.id))
    .where(eq(payslips.payrollRunId, runId))
    .orderBy(asc(payslips.employeeNo));

  return {
    ...run,
    payslips: lines.map((line) => ({
      ...line.payslip,
      monthlyHours: line.monthlyHours,
      loanReferences: line.loanReferences,
    })),
  };
}

export async function getPayslip(scope: Scope, payslipId: string) {
  assertCanView(scope);
  const [row] = await db
    .select({
      payslip: payslips,
      run: payrollRuns,
    })
    .from(payslips)
    .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
    .where(eq(payslips.id, payslipId))
    .limit(1);
  if (!row) return undefined;
  return { ...row.payslip, run: row.run };
}

/**
 * Creates a run for `period` and generates one payslip per active employee from
 * their current salary details. Amounts stay editable until the run is
 * finalised.
 */
export async function createPayrollRun(
  scope: Scope,
  input: { period: string; label?: string; notes?: string | null; rates?: PayrollRates },
) {
  assertCanManage(scope);

  const [clash] = await db
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(eq(payrollRuns.period, input.period))
    .limit(1);
  if (clash) {
    throw new Error(`A payroll run already exists for ${formatPeriod(input.period)}.`);
  }

  const staff = await db.select().from(employees).where(eq(employees.isActive, true));
  if (staff.length === 0) {
    throw new Error("No active employees to pay. Add employees first.");
  }

  const rates = input.rates ?? DEFAULT_RATES;
  const runId = newId("run");

  await db.insert(payrollRuns).values({
    id: runId,
    reference: newReference("PAY"),
    period: input.period,
    label: input.label || `Payroll: ${formatPeriod(input.period)}`,
    ratesJson: rates,
    notes: input.notes ?? null,
    createdBy: scope.userId === "system" ? null : scope.userId,
  });

  for (const employee of staff) {
    // Loans and advances are recovered automatically: whatever is due this
    // month, capped at what is still owed. Payroll can edit it down afterwards.
    const due = await loansDueFor(employee.id, input.period);
    const loanDeduction = due.reduce((sum, loan) => sum + loan.due, 0);

    const result = calculatePayslip(
      {
        basicSalary: employee.basicSalary,
        untaxableAllowance: employee.untaxableAllowance,
        responsibilityAllowance: employee.responsibilityAllowance,
        monthlyHours: employee.monthlyHours,
        loanDeduction,
      },
      rates,
    );

    const payslipId = newId("slip");
    await db.insert(payslips).values({
      id: payslipId,
      payrollRunId: runId,
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      employeeName: employee.name,
      designation: employee.designation,
      employmentMode: employee.employmentMode,
      nidaNumber: employee.nidaNumber,
      nssfNumber: employee.nssfNumber,
      bankName: employee.bankName,
      bankAccountNo: employee.bankAccountNo,
      basicSalary: employee.basicSalary,
      ...result,
    });

    await allocateRepayments(payslipId, employee.id, input.period, loanDeduction);
  }

  await recalculateRunTotals(runId);
  await recordAudit(scope, "payroll_run.create", "payroll_run", runId, {
    period: input.period,
    employees: staff.length,
  });
  return runId;
}

export type PayslipAdjustment = {
  daysWorked?: number;
  earnedLeaveDays?: number;
  sickLeaveDays?: number;
  overtimeNormalHours?: number;
  publicHolidayHours?: number;
  responsibilityAllowance?: number;
  untaxableAllowance?: number;
  loanDeduction?: number;
  otherDeductions?: number;
  /** `null` clears a previous override and returns PAYE to the bands. */
  payeOverride?: number | null;
  notes?: string | null;
};

/** Re-runs the calculation for one payslip after an adjustment. */
export async function adjustPayslip(
  scope: Scope,
  payslipId: string,
  adjustment: PayslipAdjustment,
) {
  assertCanManage(scope);

  const existing = await getPayslip(scope, payslipId);
  if (!existing) throw new Error("Payslip not found");
  if (existing.run.status !== "draft") {
    throw new Error("This run is finalised — reopen it before editing payslips.");
  }

  const [employee] = await db
    .select({ monthlyHours: employees.monthlyHours })
    .from(employees)
    .where(eq(employees.id, existing.employeeId))
    .limit(1);

  const loanDeduction = adjustment.loanDeduction ?? existing.loanDeduction;

  const result = calculatePayslip(
    {
      basicSalary: existing.basicSalary,
      monthlyHours: employee?.monthlyHours ?? 195,
      overtimeNormalHours: adjustment.overtimeNormalHours ?? existing.overtimeNormalHours,
      publicHolidayHours: adjustment.publicHolidayHours ?? existing.publicHolidayHours,
      responsibilityAllowance:
        adjustment.responsibilityAllowance ?? existing.responsibilityAllowance,
      untaxableAllowance: adjustment.untaxableAllowance ?? existing.untaxableAllowance,
      loanDeduction,
      otherDeductions: adjustment.otherDeductions ?? existing.otherDeductions,
      // `undefined` leaves the override alone; `null` clears it deliberately.
      payeOverride:
        adjustment.payeOverride === undefined ? existing.payeOverride : adjustment.payeOverride,
    },
    existing.run.ratesJson,
  );

  // Keep the loan ledger in step with the figure on the payslip.
  await allocateRepayments(payslipId, existing.employeeId, existing.run.period, loanDeduction);

  await db
    .update(payslips)
    .set({
      daysWorked: adjustment.daysWorked ?? existing.daysWorked,
      earnedLeaveDays: adjustment.earnedLeaveDays ?? existing.earnedLeaveDays,
      sickLeaveDays: adjustment.sickLeaveDays ?? existing.sickLeaveDays,
      overtimeNormalHours: adjustment.overtimeNormalHours ?? existing.overtimeNormalHours,
      publicHolidayHours: adjustment.publicHolidayHours ?? existing.publicHolidayHours,
      notes: adjustment.notes ?? existing.notes,
      ...result,
    })
    .where(eq(payslips.id, payslipId));

  await recalculateRunTotals(existing.payrollRunId);
  await recordAudit(scope, "payslip.adjust", "payslip", payslipId, adjustment as Record<string, unknown>);
}

/** Materialises the run's totals from its payslips. */
async function recalculateRunTotals(runId: string) {
  const [totals] = await db
    .select({
      gross: sql<number>`coalesce(sum("payslips"."gross_earnings"), 0)`,
      deductions: sql<number>`coalesce(sum("payslips"."total_deductions"), 0)`,
      net: sql<number>`coalesce(sum("payslips"."total_earning"), 0)`,
      employer: sql<number>`coalesce(sum("payslips"."employer_total_cost"), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(payslips)
    .where(eq(payslips.payrollRunId, runId));

  await db
    .update(payrollRuns)
    .set({
      totalGross: Number(totals?.gross ?? 0),
      totalDeductions: Number(totals?.deductions ?? 0),
      totalNetPay: Number(totals?.net ?? 0),
      totalEmployerCost: Number(totals?.employer ?? 0),
      employeeCount: Number(totals?.count ?? 0),
    })
    .where(eq(payrollRuns.id, runId));
}

export async function setPayrollRunStatus(
  scope: Scope,
  runId: string,
  status: PayrollRunStatus,
) {
  assertCanManage(scope);
  // Finalising is what turns this run's deductions into repayments, so check
  // they still fit before they count.
  if (status === "finalised") await assertRunRepaymentsFit(runId);

  await db
    .update(payrollRuns)
    .set({
      status,
      finalisedAt: status === "finalised" ? new Date() : status === "draft" ? null : undefined,
      paidAt: status === "paid" ? new Date() : undefined,
    })
    .where(eq(payrollRuns.id, runId));
  await recordAudit(scope, `payroll_run.${status}`, "payroll_run", runId, {});
}

export async function deletePayrollRun(scope: Scope, runId: string) {
  assertCanManage(scope);
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1);
  if (!run) throw new Error("Payroll run not found");
  if (run.status !== "draft") {
    throw new Error("Only draft runs can be deleted.");
  }

  // Cascades to the payslips and, through them, to the loan repayments they had
  // scheduled — so deleting a draft leaves no balance quietly reduced.
  await db.delete(payrollRuns).where(eq(payrollRuns.id, runId));
  await recordAudit(scope, "payroll_run.delete", "payroll_run", runId, { period: run.period });
}

export async function markPayslipSent(payslipId: string, recipient: string) {
  await db
    .update(payslips)
    .set({ sentAt: new Date(), sentTo: recipient })
    .where(eq(payslips.id, payslipId));
}

/** Payroll cost per month, for the finance dashboard. */
export async function payrollCostTrend(scope: Scope, months = 6) {
  assertCanView(scope);
  const rows = await db
    .select({
      period: payrollRuns.period,
      value: payrollRuns.totalEmployerCost,
      net: payrollRuns.totalNetPay,
    })
    .from(payrollRuns)
    .where(and(sql`"payroll_runs"."status" != 'draft'`))
    .orderBy(desc(payrollRuns.period))
    .limit(months);
  return rows.reverse();
}
