import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, HandCoins, PiggyBank, TrendingDown } from "lucide-react";

import { LoanFormSheet } from "./loan-form";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth/guards";
import { listLoans, type LoanStatus } from "@/lib/data/loans";
import { listEmployees } from "@/lib/data/payroll";
import { scopeFor } from "@/lib/data/scope";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import { formatPeriod } from "@/lib/payroll/calculate";

export const metadata = { title: "Loans & advances" };

const STATUS: Record<LoanStatus, { label: string; variant: "muted" | "info" | "success" }> = {
  active: { label: "Being recovered", variant: "info" },
  settled: { label: "Settled", variant: "success" },
  written_off: { label: "Written off", variant: "muted" },
};

export default async function LoansPage() {
  const user = await requireStaff();
  if (!user.permissions.has("payroll.view")) notFound();

  const scope = scopeFor(user);
  const [loans, staff] = await Promise.all([listLoans(scope), listEmployees(scope)]);
  const canManage = user.permissions.has("payroll.manage");

  const active = loans.filter((loan) => loan.status === "active");
  const outstanding = active.reduce((sum, loan) => sum + loan.outstanding, 0);
  const perMonth = active.reduce(
    (sum, loan) => sum + Math.min(loan.monthlyDeduction, loan.outstanding),
    0,
  );

  const newLoan = canManage ? (
    <LoanFormSheet
      employees={staff.map((employee) => ({
        id: employee.id,
        name: employee.name,
        employeeNo: employee.employeeNo,
      }))}
    />
  ) : null;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/payroll">
          <ArrowLeft /> Payroll
        </Link>
      </Button>

      <PageHeader
        title="Loans & advances"
        description="Money lent to staff and recovered from their pay. Deductions are added to each payslip automatically until the balance clears."
        actions={newLoan}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={formatCompactCurrency(outstanding)}
          caption={`Across ${active.length} loan${active.length === 1 ? "" : "s"}`}
          icon={PiggyBank}
          tone={outstanding > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Recovering monthly"
          value={formatCompactCurrency(perMonth)}
          caption="If every instalment is taken"
          icon={TrendingDown}
        />
        <StatCard
          label="Lent in total"
          value={formatCompactCurrency(loans.reduce((sum, loan) => sum + loan.principal, 0))}
          caption={`${loans.length} recorded`}
          icon={HandCoins}
        />
        <StatCard
          label="Staff with a balance"
          value={new Set(active.map((loan) => loan.employeeId)).size}
          caption={`of ${staff.length} on payroll`}
        />
      </section>

      {loans.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="No loans or advances recorded"
          description={
            staff.length === 0
              ? "Add your employees first, then record what has been advanced to them."
              : "Record an advance and the deduction is applied to every payslip from the month you choose until it is repaid."
          }
          action={newLoan ?? undefined}
        />
      ) : (
        <DataList
          rows={loans}
          rowKey={(loan) => loan.id}
          href={(loan) => `/payroll/loans/${loan.id}`}
          columns={[
            {
              key: "employee",
              header: "Employee",
              role: "primary",
              cell: (loan) => (
                <Link href={`/payroll/loans/${loan.id}`} className="hover:underline">
                  {loan.employeeName}
                </Link>
              ),
            },
            {
              key: "what",
              header: "Type",
              role: "secondary",
              className: "text-muted-foreground",
              cell: (loan) =>
                `${loan.kind === "advance" ? "Salary advance" : "Loan"} · ${loan.reference}`,
            },
            {
              key: "outstanding",
              header: "Outstanding",
              role: "trailing",
              className: "font-data text-right",
              headerClassName: "text-right",
              cell: (loan) => (
                <span className="font-data font-medium">
                  {formatCompactCurrency(loan.outstanding)}
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (loan) => (
                <Badge variant={STATUS[loan.status].variant}>{STATUS[loan.status].label}</Badge>
              ),
            },
            {
              key: "principal",
              header: "Advanced",
              className: "font-data text-muted-foreground",
              cell: (loan) => formatCurrency(loan.principal),
            },
            {
              key: "instalment",
              header: "Per month",
              className: "font-data",
              cell: (loan) => formatCurrency(loan.monthlyDeduction),
            },
            {
              key: "from",
              header: "From",
              className: "text-muted-foreground",
              desktopOnly: true,
              cell: (loan) => formatPeriod(loan.startPeriod),
            },
            {
              key: "issued",
              header: "Issued",
              className: "whitespace-nowrap text-muted-foreground",
              desktopOnly: true,
              cell: (loan) => formatDate(loan.issuedOn),
            },
          ]}
        />
      )}
    </>
  );
}
