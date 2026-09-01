import "server-only";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  employeeLoans,
  employees,
  loanRepayments,
  payrollRuns,
  payslips,
  type LoanKind,
} from "@db/schema";
import { newId, newReference } from "@/lib/ids";
import { recordAudit } from "@/lib/data/audit";
import { hasPermission, type Scope } from "@/lib/data/scope";

/** Loans sit inside payroll, so they are internal-only and permission-gated. */
function assertCanView(scope: Scope) {
  if (scope.clientId) throw new Error("Payroll is not accessible from client portals");
  if (!hasPermission(scope, "payroll.view")) throw new Error("Missing permission: payroll.view");
}

function assertCanManage(scope: Scope) {
  assertCanView(scope);
  if (!hasPermission(scope, "payroll.manage")) throw new Error("Missing permission: payroll.manage");
}

/**
 * A repayment counts once it is real: booked directly, or recovered by a
 * payslip on a run that has left draft. A draft run is still a proposal — it can
 * be edited or deleted — so its deductions must not reduce a balance yet.
 */
const REPAID = sql<number>`(
  select coalesce(sum("r"."amount"), 0)
  from "loan_repayments" "r"
  left join "payslips" "p" on "p"."id" = "r"."payslip_id"
  left join "payroll_runs" "run" on "run"."id" = "p"."payroll_run_id"
  where "r"."loan_id" = "employee_loans"."id"
    and ("r"."payslip_id" is null or "run"."status" != 'draft')
)`;

/** Deductions sitting on a draft run — scheduled, not yet repaid. */
const SCHEDULED = sql<number>`(
  select coalesce(sum("r"."amount"), 0)
  from "loan_repayments" "r"
  join "payslips" "p" on "p"."id" = "r"."payslip_id"
  join "payroll_runs" "run" on "run"."id" = "p"."payroll_run_id"
  where "r"."loan_id" = "employee_loans"."id" and "run"."status" = 'draft'
)`;

const loanColumns = {
  id: employeeLoans.id,
  reference: employeeLoans.reference,
  employeeId: employeeLoans.employeeId,
  employeeName: employees.name,
  employeeNo: employees.employeeNo,
  kind: employeeLoans.kind,
  principal: employeeLoans.principal,
  monthlyDeduction: employeeLoans.monthlyDeduction,
  startPeriod: employeeLoans.startPeriod,
  issuedOn: employeeLoans.issuedOn,
  reason: employeeLoans.reason,
  notes: employeeLoans.notes,
  cancelledAt: employeeLoans.cancelledAt,
  createdAt: employeeLoans.createdAt,
  repaid: REPAID,
  scheduled: SCHEDULED,
};

export type LoanStatus = "active" | "settled" | "written_off";

type LoanRow = {
  id: string;
  reference: string;
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  kind: LoanKind;
  principal: number;
  monthlyDeduction: number;
  startPeriod: string;
  issuedOn: Date;
  reason: string | null;
  notes: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  repaid: number;
  scheduled: number;
};

export type LoanSummary = LoanRow & { outstanding: number; status: LoanStatus };

function shape(row: LoanRow): LoanSummary {
  const repaid = Number(row.repaid ?? 0);
  const outstanding = Math.max(0, row.principal - repaid);
  return {
    ...row,
    repaid,
    scheduled: Number(row.scheduled ?? 0),
    outstanding,
    // Written off beats settled: a balance forgiven is not a balance repaid.
    status: row.cancelledAt ? "written_off" : outstanding === 0 ? "settled" : "active",
  };
}

export async function listLoans(scope: Scope, options: { employeeId?: string } = {}) {
  assertCanView(scope);
  const rows = await db
    .select(loanColumns)
    .from(employeeLoans)
    .innerJoin(employees, eq(employeeLoans.employeeId, employees.id))
    .where(options.employeeId ? eq(employeeLoans.employeeId, options.employeeId) : undefined)
    .orderBy(desc(employeeLoans.issuedOn));
  return rows.map(shape);
}

export async function getLoan(scope: Scope, loanId: string) {
  assertCanView(scope);
  const [row] = await db
    .select(loanColumns)
    .from(employeeLoans)
    .innerJoin(employees, eq(employeeLoans.employeeId, employees.id))
    .where(eq(employeeLoans.id, loanId))
    .limit(1);
  if (!row) return undefined;

  const repayments = await db
    .select({
      id: loanRepayments.id,
      amount: loanRepayments.amount,
      period: loanRepayments.period,
      note: loanRepayments.note,
      createdAt: loanRepayments.createdAt,
      payslipId: loanRepayments.payslipId,
      runStatus: payrollRuns.status,
      runId: payrollRuns.id,
    })
    .from(loanRepayments)
    .leftJoin(payslips, eq(loanRepayments.payslipId, payslips.id))
    .leftJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
    .where(eq(loanRepayments.loanId, loanId))
    .orderBy(desc(loanRepayments.period), desc(loanRepayments.createdAt));

  return { ...shape(row), repayments };
}

export type LoanInput = {
  employeeId: string;
  kind: LoanKind;
  principal: number;
  monthlyDeduction: number;
  startPeriod: string;
  reason?: string | null;
  notes?: string | null;
  issuedOn?: Date;
};

export async function createLoan(scope: Scope, input: LoanInput) {
  assertCanManage(scope);
  if (input.principal <= 0) throw new Error("Enter the amount advanced");
  if (input.monthlyDeduction <= 0) throw new Error("Enter how much to recover each month");
  if (input.monthlyDeduction > input.principal) {
    throw new Error("The monthly deduction cannot be more than the amount advanced");
  }

  const [employee] = await db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);
  if (!employee) throw new Error("Employee not found");

  const id = newId("loan");
  await db.insert(employeeLoans).values({
    id,
    reference: newReference(input.kind === "advance" ? "ADV" : "LN"),
    employeeId: input.employeeId,
    kind: input.kind,
    principal: input.principal,
    monthlyDeduction: input.monthlyDeduction,
    startPeriod: input.startPeriod,
    issuedOn: input.issuedOn ?? new Date(),
    reason: input.reason ?? null,
    notes: input.notes ?? null,
    createdBy: scope.userId === "system" ? null : scope.userId,
  });

  await recordAudit(scope, "loan.create", "employee_loan", id, {
    employee: employee.name,
    principal: input.principal,
    kind: input.kind,
  });
  return id;
}

export async function updateLoan(
  scope: Scope,
  loanId: string,
  input: Pick<LoanInput, "monthlyDeduction" | "startPeriod" | "reason" | "notes">,
) {
  assertCanManage(scope);
  if (input.monthlyDeduction <= 0) throw new Error("Enter how much to recover each month");
  // The principal is deliberately not editable: it is what was handed over, and
  // the repayments already booked are measured against it. Write it off and
  // record a new loan instead.
  await db
    .update(employeeLoans)
    .set({
      monthlyDeduction: input.monthlyDeduction,
      startPeriod: input.startPeriod,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
    })
    .where(eq(employeeLoans.id, loanId));
  await recordAudit(scope, "loan.update", "employee_loan", loanId, { ...input });
}

/** Writes off whatever is left. The repayments already booked are untouched. */
export async function writeOffLoan(scope: Scope, loanId: string, reinstate = false) {
  assertCanManage(scope);
  await db
    .update(employeeLoans)
    .set({ cancelledAt: reinstate ? null : new Date() })
    .where(eq(employeeLoans.id, loanId));
  await recordAudit(scope, reinstate ? "loan.reinstate" : "loan.write_off", "employee_loan", loanId, {});
}

export async function deleteLoan(scope: Scope, loanId: string) {
  assertCanManage(scope);
  const loan = await getLoan(scope, loanId);
  if (!loan) throw new Error("Loan not found");
  if (loan.repaid > 0 || loan.scheduled > 0) {
    throw new Error(
      "This loan has repayments against it. Write it off instead — deleting it would erase them.",
    );
  }
  await db.delete(employeeLoans).where(eq(employeeLoans.id, loanId));
  await recordAudit(scope, "loan.delete", "employee_loan", loanId, { reference: loan.reference });
}

/** A repayment made outside payroll — cash over the counter, or a transfer. */
export async function recordManualRepayment(
  scope: Scope,
  loanId: string,
  input: { amount: number; period: string; note?: string | null },
) {
  assertCanManage(scope);
  const loan = await getLoan(scope, loanId);
  if (!loan) throw new Error("Loan not found");
  if (input.amount <= 0) throw new Error("Enter the amount repaid");
  if (input.amount > loan.outstanding) {
    throw new Error(
      `That is more than the ${loan.outstanding.toLocaleString("en-GB")} TZS still outstanding.`,
    );
  }

  const id = newId("rep");
  await db.insert(loanRepayments).values({
    id,
    loanId,
    payslipId: null,
    amount: input.amount,
    period: input.period,
    note: input.note ?? null,
  });
  await recordAudit(scope, "loan.repayment", "employee_loan", loanId, { amount: input.amount });
  return id;
}

export async function deleteManualRepayment(scope: Scope, repaymentId: string) {
  assertCanManage(scope);
  const [row] = await db
    .select({ loanId: loanRepayments.loanId, payslipId: loanRepayments.payslipId })
    .from(loanRepayments)
    .where(eq(loanRepayments.id, repaymentId))
    .limit(1);
  if (!row) throw new Error("Repayment not found");
  if (row.payslipId) {
    throw new Error("This repayment came from a payslip. Edit the payslip to change it.");
  }
  await db.delete(loanRepayments).where(eq(loanRepayments.id, repaymentId));
  await recordAudit(scope, "loan.repayment_delete", "employee_loan", row.loanId, {});
}

/* ----------------------- recovery through the payroll ---------------------- */

export type LoanDue = {
  loanId: string;
  reference: string;
  kind: LoanKind;
  /** What to take this month: the instalment, capped at what is still owed. */
  due: number;
  outstanding: number;
};

/**
 * What should come off one employee's pay this period, loan by loan. Oldest
 * loan first, so an advance taken in January clears before one taken in March.
 *
 * `excludePayslipId` leaves that payslip's own scheduled rows out of the
 * balance, so recalculating a payslip does not see its own previous instalment
 * as money already owed.
 */
export async function loansDueFor(
  employeeId: string,
  period: string,
  excludePayslipId?: string,
): Promise<LoanDue[]> {
  const rows = await db
    .select({
      id: employeeLoans.id,
      reference: employeeLoans.reference,
      kind: employeeLoans.kind,
      principal: employeeLoans.principal,
      monthlyDeduction: employeeLoans.monthlyDeduction,
      startPeriod: employeeLoans.startPeriod,
      // Deliberately stricter than the displayed balance: this one counts
      // deductions on draft runs too, so two open runs cannot each schedule the
      // final instalment of the same loan.
      booked: sql<number>`(
        select coalesce(sum("r"."amount"), 0)
        from "loan_repayments" "r"
        where "r"."loan_id" = "employee_loans"."id"
          and ("r"."payslip_id" is null or "r"."payslip_id" != ${excludePayslipId ?? ""})
      )`,
    })
    .from(employeeLoans)
    .where(
      and(
        eq(employeeLoans.employeeId, employeeId),
        isNull(employeeLoans.cancelledAt),
        sql`${employeeLoans.startPeriod} <= ${period}`,
      ),
    )
    .orderBy(asc(employeeLoans.issuedOn), asc(employeeLoans.createdAt));

  return rows
    .map((row) => {
      const outstanding = Math.max(0, row.principal - Number(row.booked ?? 0));
      return {
        loanId: row.id,
        reference: row.reference,
        kind: row.kind,
        due: Math.min(row.monthlyDeduction, outstanding),
        outstanding,
      };
    })
    .filter((due) => due.due > 0);
}

/**
 * Rewrites the repayment rows a payslip is responsible for. Called whenever a
 * payslip's loan deduction is generated or edited, so the ledger and the figure
 * on the payslip can never disagree.
 *
 * `total` is what the payslip actually deducts — normally the sum of what is
 * due, but a lower number if payroll edited it down. It is spread over the
 * loans in order, oldest first.
 */
export async function allocateRepayments(
  payslipId: string,
  employeeId: string,
  period: string,
  total: number,
) {
  await db.delete(loanRepayments).where(eq(loanRepayments.payslipId, payslipId));
  if (total <= 0) return;

  const due = await loansDueFor(employeeId, period, payslipId);
  let remaining = total;

  for (const loan of due) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, loan.outstanding);
    if (amount <= 0) continue;
    await db.insert(loanRepayments).values({
      id: newId("rep"),
      loanId: loan.loanId,
      payslipId,
      amount,
      period,
    });
    remaining -= amount;
  }

  // Anything left over is a deduction with no loan behind it. That is a real
  // possibility — payroll can type any figure — and it stays on the payslip as
  // a deduction; it simply is not credited to a loan.
}

/**
 * The loans one payslip recovers against, with what is left after it. Used on
 * the payslip itself, so an employee can see their balance coming down.
 */
export async function payslipLoanLines(payslipId: string) {
  const rows = await db
    .select({
      reference: employeeLoans.reference,
      kind: employeeLoans.kind,
      amount: loanRepayments.amount,
      principal: employeeLoans.principal,
      repaidToDate: sql<number>`(
        select coalesce(sum("r"."amount"), 0)
        from "loan_repayments" "r"
        where "r"."loan_id" = "employee_loans"."id"
      )`,
    })
    .from(loanRepayments)
    .innerJoin(employeeLoans, eq(loanRepayments.loanId, employeeLoans.id))
    .where(eq(loanRepayments.payslipId, payslipId))
    .orderBy(asc(employeeLoans.issuedOn));

  return rows.map((row) => ({
    reference: row.reference,
    kind: row.kind,
    amount: row.amount,
    balanceAfter: Math.max(0, row.principal - Number(row.repaidToDate ?? 0)),
  }));
}

/**
 * Guards the moment a run's deductions become real repayments. A manual
 * repayment recorded after the run was generated can leave the run trying to
 * recover more than is still owed; refuse rather than over-collect.
 */
export async function assertRunRepaymentsFit(runId: string) {
  const rows = await db
    .select({
      loanId: employeeLoans.id,
      reference: employeeLoans.reference,
      employeeName: employees.name,
      principal: employeeLoans.principal,
      onThisRun: sql<number>`coalesce(sum("loan_repayments"."amount"), 0)`,
      bookedElsewhere: sql<number>`(
        select coalesce(sum("r"."amount"), 0)
        from "loan_repayments" "r"
        left join "payslips" "p" on "p"."id" = "r"."payslip_id"
        where "r"."loan_id" = "employee_loans"."id"
          and ("r"."payslip_id" is null or "p"."payroll_run_id" != ${runId})
      )`,
    })
    .from(loanRepayments)
    .innerJoin(employeeLoans, eq(loanRepayments.loanId, employeeLoans.id))
    .innerJoin(employees, eq(employeeLoans.employeeId, employees.id))
    .innerJoin(payslips, eq(loanRepayments.payslipId, payslips.id))
    .where(eq(payslips.payrollRunId, runId))
    .groupBy(employeeLoans.id);

  for (const row of rows) {
    const room = row.principal - Number(row.bookedElsewhere ?? 0);
    if (Number(row.onThisRun ?? 0) > room) {
      throw new Error(
        `${row.employeeName}'s loan ${row.reference} only has ${Math.max(0, room).toLocaleString(
          "en-GB",
        )} TZS left to recover, but this run deducts ${Number(row.onThisRun).toLocaleString(
          "en-GB",
        )}. Edit their payslip before finalising.`,
      );
    }
  }
}

/** Total still owed across everyone, for the payroll overview. */
export async function loanTotals(scope: Scope) {
  assertCanView(scope);
  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
      principal: sql<number>`coalesce(sum("employee_loans"."principal"), 0)`,
      repaid: sql<number>`coalesce(sum(${REPAID}), 0)`,
    })
    .from(employeeLoans)
    .where(isNull(employeeLoans.cancelledAt));

  const principal = Number(row?.principal ?? 0);
  const repaid = Number(row?.repaid ?? 0);
  return {
    count: Number(row?.count ?? 0),
    principal,
    repaid,
    outstanding: Math.max(0, principal - repaid),
  };
}
