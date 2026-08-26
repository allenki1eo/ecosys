import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";

import { RunStatusControls, SendPayslipButton } from "../payroll-controls";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { requireStaff } from "@/lib/auth/guards";
import { getPayrollRun } from "@/lib/data/payroll";
import { formatPeriod } from "@/lib/payroll/calculate";
import { scopeFor } from "@/lib/data/scope";
import { formatCompactCurrency, formatCurrency, formatDate } from "@/lib/format";
import type { PayrollRunStatus } from "@db/schema";

const STATUS: Record<PayrollRunStatus, { label: string; variant: "muted" | "info" | "success" }> = {
  draft: { label: "Draft", variant: "muted" },
  finalised: { label: "Finalised", variant: "info" },
  paid: { label: "Paid", variant: "success" },
};

export default async function PayrollRunPage({ params }: { params: { runId: string } }) {
  const user = await requireStaff();
  if (!user.permissions.has("payroll.view")) notFound();

  const run = await getPayrollRun(scopeFor(user), params.runId);
  if (!run) notFound();

  const canManage = user.permissions.has("payroll.manage");
  const canSend = user.permissions.has("payroll.send");
  const unsent = run.payslips.filter((payslip) => !payslip.sentAt).length;
  const rates = run.ratesJson;

  const statutory = run.payslips.reduce(
    (acc, p) => ({
      paye: acc.paye + p.paye,
      nssf: acc.nssf + p.nssfEmployee + p.nssfEmployer,
      sdl: acc.sdl + p.sdl,
      wcf: acc.wcf + p.wcf,
    }),
    { paye: 0, nssf: 0, sdl: 0, wcf: 0 },
  );

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/payroll">
          <ArrowLeft /> All payroll runs
        </Link>
      </Button>

      <PageHeader
        title={formatPeriod(run.period)}
        description={`${run.reference} · ${run.employeeCount} employee${run.employeeCount === 1 ? "" : "s"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS[run.status].variant}>{STATUS[run.status].label}</Badge>
            {canManage ? (
              <RunStatusControls
                runId={run.id}
                status={run.status}
                canSend={canSend}
                unsentCount={unsent}
              />
            ) : null}
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross earnings" value={formatCompactCurrency(run.totalGross)} />
        <StatCard label="Total deductions" value={formatCompactCurrency(run.totalDeductions)} />
        <StatCard
          label="Net payable"
          value={formatCompactCurrency(run.totalNetPay)}
          tone="positive"
          caption="Including untaxable allowances"
        />
        <StatCard
          label="Employer cost"
          value={formatCompactCurrency(run.totalEmployerCost)}
          caption="On top of net pay"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Statutory contributions this run</CardTitle>
          <p className="text-xs text-muted-foreground">
            Rates locked when the run was created: NSSF {Math.round(rates.nssfEmployee * 100)}% employee
            / {Math.round(rates.nssfEmployer * 100)}% employer · SDL {rates.sdl * 100}% · WCF{" "}
            {rates.wcf * 100}%
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="PAYE" value={formatCurrency(statutory.paye)} />
          <Figure label="NSSF (both)" value={formatCurrency(statutory.nssf)} />
          <Figure label="SDL" value={formatCurrency(statutory.sdl)} />
          <Figure label="WCF" value={formatCurrency(statutory.wcf)} />
        </CardContent>
      </Card>

      <DataList
        rows={run.payslips}
        rowKey={(payslip) => payslip.id}
        columns={[
          {
            key: "name",
            header: "Employee",
            role: "primary",
            cell: (payslip) => payslip.employeeName,
          },
          {
            key: "designation",
            header: "Designation",
            role: "secondary",
            className: "text-muted-foreground",
            cell: (payslip) => payslip.designation ?? `No. ${payslip.employeeNo}`,
          },
          {
            key: "payable",
            header: "Payable",
            role: "trailing",
            className: "font-data text-right",
            headerClassName: "text-right",
            cell: (payslip) => (
              <span className="font-data font-medium">{formatCompactCurrency(payslip.totalEarning)}</span>
            ),
          },
          {
            key: "basic",
            header: "Basic",
            className: "font-data",
            cell: (payslip) => formatCurrency(payslip.basicSalary),
          },
          {
            key: "paye",
            header: "PAYE",
            className: "font-data text-muted-foreground",
            cell: (payslip) => formatCurrency(payslip.paye),
          },
          {
            key: "nssf",
            header: "NSSF",
            className: "font-data text-muted-foreground",
            cell: (payslip) => formatCurrency(payslip.nssfEmployee),
          },
          {
            key: "net",
            header: "Net pay",
            className: "font-data",
            cell: (payslip) => formatCurrency(payslip.netPay),
          },
          {
            key: "actions",
            header: "Payslip",
            headerClassName: "text-right",
            className: "text-right",
            cell: (payslip) => (
              <div className="flex items-center justify-end gap-2">
                <Button asChild size="sm" variant="ghost">
                  <a
                    href={`/api/documents/payslip/${payslip.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open payslip PDF"
                  >
                    <Download /> PDF
                  </a>
                </Button>
                {canSend ? (
                  <SendPayslipButton
                    payslipId={payslip.id}
                    sentAt={payslip.sentAt ? payslip.sentAt.toISOString() : null}
                    disabled={run.status === "draft"}
                  />
                ) : null}
              </div>
            ),
          },
        ]}
      />

      {run.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{run.notes}</CardContent>
        </Card>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="size-3.5" />
        Created {formatDate(run.createdAt)}
        {run.finalisedAt ? ` · finalised ${formatDate(run.finalisedAt)}` : ""}
        {run.paidAt ? ` · paid ${formatDate(run.paidAt)}` : ""}
      </p>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate font-data text-sm">{value}</p>
    </div>
  );
}
