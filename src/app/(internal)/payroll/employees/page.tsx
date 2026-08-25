import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";

import { EmployeeActiveToggle, EmployeeFormSheet } from "./employee-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth/guards";
import { listEmployees } from "@/lib/data/payroll";
import { scopeFor } from "@/lib/data/scope";
import { formatCompactCurrency, formatCurrency, titleCase } from "@/lib/format";

export const metadata = { title: "Employees" };

export default async function EmployeesPage() {
  const user = await requireStaff();
  if (!user.permissions.has("payroll.view")) notFound();

  const employees = await listEmployees(scopeFor(user), true);
  const canManage = user.permissions.has("payroll.manage");
  const active = employees.filter((employee) => employee.isActive);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/payroll">
          <ArrowLeft /> Payroll
        </Link>
      </Button>

      <PageHeader
        title="Employees"
        description={`${active.length} active on payroll · monthly wage bill ${formatCompactCurrency(
          active.reduce((sum, e) => sum + e.basicSalary + e.untaxableAllowance, 0),
        )}`}
        actions={canManage ? <EmployeeFormSheet /> : null}
      />

      {employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No employees yet"
          description="Add your staff with their salary details, then run payroll for a month."
          action={canManage ? <EmployeeFormSheet /> : undefined}
        />
      ) : (
        <DataList
          rows={employees}
          rowKey={(employee) => employee.id}
          columns={[
            {
              key: "name",
              header: "Employee",
              role: "primary",
              cell: (employee) => (
                <span className="flex items-center gap-2">
                  {employee.name}
                  {!employee.isActive ? <Badge variant="muted">Inactive</Badge> : null}
                </span>
              ),
            },
            {
              key: "designation",
              header: "Designation",
              role: "secondary",
              className: "text-muted-foreground",
              cell: (employee) =>
                `${employee.designation ?? "—"} · No. ${employee.employeeNo}`,
            },
            {
              key: "basic",
              header: "Basic salary",
              role: "trailing",
              className: "font-data text-right",
              headerClassName: "text-right",
              cell: (employee) => (
                <span className="font-data">{formatCompactCurrency(employee.basicSalary)}</span>
              ),
            },
            {
              key: "allowance",
              header: "Transport",
              className: "font-data text-muted-foreground",
              cell: (employee) => formatCurrency(employee.untaxableAllowance),
            },
            {
              key: "mode",
              header: "Mode",
              className: "text-muted-foreground",
              cell: (employee) => titleCase(employee.employmentMode),
            },
            {
              key: "contact",
              header: "Payslip to",
              className: "text-xs text-muted-foreground",
              cell: (employee) => employee.email || employee.phone || "No contact",
            },
            {
              key: "bank",
              header: "Bank",
              className: "text-xs text-muted-foreground",
              desktopOnly: true,
              cell: (employee) => employee.bankName ?? "—",
            },
            ...(canManage
              ? [
                  {
                    key: "actions",
                    header: "Manage",
                    headerClassName: "text-right",
                    className: "text-right",
                    cell: (employee: (typeof employees)[number]) => (
                      <div className="flex items-center justify-end gap-2">
                        <EmployeeFormSheet
                          employee={{
                            id: employee.id,
                            employeeNo: employee.employeeNo,
                            name: employee.name,
                            designation: employee.designation,
                            department: employee.department,
                            employmentMode: employee.employmentMode,
                            nidaNumber: employee.nidaNumber,
                            nssfNumber: employee.nssfNumber,
                            bankName: employee.bankName,
                            bankAccountNo: employee.bankAccountNo,
                            phone: employee.phone,
                            email: employee.email,
                            basicSalary: employee.basicSalary,
                            untaxableAllowance: employee.untaxableAllowance,
                            responsibilityAllowance: employee.responsibilityAllowance,
                            monthlyHours: employee.monthlyHours,
                            notes: employee.notes,
                          }}
                        />
                        <EmployeeActiveToggle
                          employeeId={employee.id}
                          isActive={employee.isActive}
                        />
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
    </>
  );
}
