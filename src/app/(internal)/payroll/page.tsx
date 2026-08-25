import Link from "next/link";
import { Banknote, Users, Wallet } from "lucide-react";

import { NewPayrollRunDialog } from "./payroll-controls";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth/guards";
import { listEmployees, listPayrollRuns } from "@/lib/data/payroll";
import { formatPeriod } from "@/lib/payroll/calculate";
import { scopeFor } from "@/lib/data/scope";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import type { PayrollRunStatus } from "@db/schema";

export const metadata = { title: "Payroll" };

const STATUS: Record<PayrollRunStatus, { label: string; variant: "muted" | "info" | "success" }> = {
  draft: { label: "Draft", variant: "muted" },
  finalised: { label: "Finalised", variant: "info" },
  paid: { label: "Paid", variant: "success" },
};

export default async function PayrollPage() {
  const user = await requireStaff();
  const scope = scopeFor(user);

  if (!user.permissions.has("payroll.view")) {
    return (
      <EmptyState
        icon={Wallet}
        title="Payroll is restricted"
        description="Salary information is limited to Finance and Super Admin. Ask a Super Admin for the payroll.view permission."
      />
    );
  }

  const [runs, staff] = await Promise.all([listPayrollRuns(scope), listEmployees(scope)]);
  const canManage = user.permissions.has("payroll.manage");

  const latestPaid = runs.find((run) => run.status !== "draft");
  const monthlyWage = staff.reduce(
    (sum, employee) => sum + employee.basicSalary + employee.untaxableAllowance,
    0,
  );

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Monthly runs, payslips and statutory contributions for Ecohygiene staff."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/payroll/employees">
                <Users /> Employees
              </Link>
            </Button>
            {canManage ? <NewPayrollRunDialog /> : null}
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees on payroll" value={staff.length} icon={Users} href="/payroll/employees" />
        <StatCard
          label="Monthly wage bill"
          value={formatCompactCurrency(monthlyWage)}
          caption="Basic plus allowances"
          icon={Banknote}
        />
        <StatCard
          label="Last run"
          value={latestPaid ? formatPeriod(latestPaid.period) : "—"}
          caption={latestPaid ? STATUS[latestPaid.status].label : "Nothing run yet"}
        />
        <StatCard
          label="Last employer cost"
          value={latestPaid ? formatCompactCurrency(latestPaid.totalEmployerCost) : "—"}
          caption="NSSF, PAYE, SDL and WCF"
        />
      </section>

      {runs.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payroll runs yet"
          description={
            staff.length === 0
              ? "Add your employees first, then run payroll for a month."
              : "Create a run for a month and a payslip is generated for every active employee."
          }
          action={
            canManage && staff.length > 0 ? (
              <NewPayrollRunDialog />
            ) : (
              <Button asChild size="sm">
                <Link href="/payroll/employees">Add employees</Link>
              </Button>
            )
          }
        />
      ) : (
        <DataList
          rows={runs}
          rowKey={(run) => run.id}
          href={(run) => `/payroll/${run.id}`}
          columns={[
            {
              key: "period",
              header: "Period",
              role: "primary",
              cell: (run) => (
                <Link href={`/payroll/${run.id}`} className="hover:underline">
                  {formatPeriod(run.period)}
                </Link>
              ),
            },
            {
              key: "reference",
              header: "Reference",
              role: "secondary",
              className: "font-data text-muted-foreground",
              cell: (run) => run.reference,
            },
            {
              key: "status",
              header: "Status",
              role: "trailing",
              cell: (run) => (
                <Badge variant={STATUS[run.status].variant}>{STATUS[run.status].label}</Badge>
              ),
            },
            {
              key: "staff",
              header: "Staff",
              className: "font-data",
              cell: (run) => run.employeeCount,
            },
            {
              key: "net",
              header: "Net payable",
              className: "font-data",
              cell: (run) => formatCurrency(run.totalNetPay),
            },
            {
              key: "employer",
              header: "Employer cost",
              className: "font-data text-muted-foreground",
              cell: (run) => formatCurrency(run.totalEmployerCost),
            },
            {
              key: "date",
              header: "Finalised",
              className: "text-muted-foreground",
              cell: (run) => formatDate(run.finalisedAt),
            },
          ]}
        />
      )}
    </>
  );
}
