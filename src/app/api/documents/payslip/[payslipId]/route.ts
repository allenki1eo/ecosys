import { NextResponse } from "next/server";

import { PayslipDocument } from "@/lib/pdf/payslip";
import { pdfResponse, slugForFile } from "@/lib/pdf/render";
import { getCurrentUser } from "@/lib/auth/session";
import { payslipLoanLines } from "@/lib/data/loans";
import { getPayslip } from "@/lib/data/payroll";
import { formatPeriod } from "@/lib/payroll/calculate";
import { scopeFor } from "@/lib/data/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payslip PDF. Salary data, so this is internal-only and gated on
 * `payroll.view` — `getPayslip` refuses a client-portal scope outright.
 */
export async function GET(_request: Request, { params }: { params: { payslipId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.isClientUser || !user.permissions.has("payroll.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payslip = await getPayslip(scopeFor(user), params.payslipId);
  if (!payslip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { run, ...slip } = payslip;
  // What the loan deduction covers, so the employee can see their balance come
  // down on the payslip itself rather than having to ask.
  const loans = await payslipLoanLines(slip.id);

  return pdfResponse(
    PayslipDocument({ payslip: slip, run, loans }),
    `payslip-${slugForFile(slip.employeeName)}-${slugForFile(formatPeriod(run.period))}.pdf`,
  );
}
