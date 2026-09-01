import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";

import {
  DeleteRepaymentButton,
  LoanFormSheet,
  LoanLifecycleControls,
  RecordRepaymentDialog,
} from "../loan-form";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth/guards";
import { getLoan } from "@/lib/data/loans";
import { scopeFor } from "@/lib/data/scope";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatPeriod } from "@/lib/payroll/calculate";

export default async function LoanPage({ params }: { params: { loanId: string } }) {
  const user = await requireStaff();
  if (!user.permissions.has("payroll.view")) notFound();

  const loan = await getLoan(scopeFor(user), params.loanId);
  if (!loan) notFound();

  const canManage = user.permissions.has("payroll.manage");
  const progress = loan.principal > 0 ? Math.round((loan.repaid / loan.principal) * 100) : 0;
  const monthsLeft =
    loan.monthlyDeduction > 0 ? Math.ceil(loan.outstanding / loan.monthlyDeduction) : 0;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/payroll/loans">
          <ArrowLeft /> Loans &amp; advances
        </Link>
      </Button>

      <PageHeader
        title={loan.employeeName}
        description={`${loan.kind === "advance" ? "Salary advance" : "Loan"} ${loan.reference} · issued ${formatDate(
          loan.issuedOn,
        )}${loan.reason ? ` · ${loan.reason}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {loan.cancelledAt ? (
              <Badge variant="muted">Written off</Badge>
            ) : loan.outstanding === 0 ? (
              <Badge variant="success">Settled</Badge>
            ) : (
              <Badge variant="info">Being recovered</Badge>
            )}
            {canManage ? (
              <>
                {loan.outstanding > 0 && !loan.cancelledAt ? (
                  <RecordRepaymentDialog loanId={loan.id} outstanding={loan.outstanding} />
                ) : null}
                <LoanFormSheet
                  loan={{
                    id: loan.id,
                    employeeName: loan.employeeName,
                    kind: loan.kind,
                    principal: loan.principal,
                    monthlyDeduction: loan.monthlyDeduction,
                    startPeriod: loan.startPeriod,
                    reason: loan.reason,
                    notes: loan.notes,
                  }}
                />
                <LoanLifecycleControls
                  loanId={loan.id}
                  writtenOff={Boolean(loan.cancelledAt)}
                  canDelete={loan.repaid === 0 && loan.scheduled === 0}
                />
              </>
            ) : null}
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={formatCurrency(loan.outstanding)}
          caption={
            loan.cancelledAt
              ? "Written off — nothing further will be deducted"
              : loan.outstanding === 0
                ? "Fully repaid"
                : `About ${monthsLeft} more month${monthsLeft === 1 ? "" : "s"}`
          }
          tone={loan.outstanding > 0 && !loan.cancelledAt ? "warning" : "positive"}
        />
        <StatCard
          label="Repaid"
          value={formatCurrency(loan.repaid)}
          caption={`${progress}% of the amount advanced`}
        />
        <StatCard label="Advanced" value={formatCurrency(loan.principal)} caption={formatDate(loan.issuedOn)} />
        <StatCard
          label="Deducted monthly"
          value={formatCurrency(loan.monthlyDeduction)}
          caption={`From ${formatPeriod(loan.startPeriod)}`}
        />
      </section>

      {/* Repayment progress, as a bar rather than a number twice over. */}
      <div className="space-y-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand-green transition-[width]"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(loan.repaid)} of {formatCurrency(loan.principal)} recovered
          {loan.scheduled > 0
            ? ` · ${formatCurrency(loan.scheduled)} scheduled on a draft payroll run`
            : ""}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Repayment history</h2>
        {loan.repayments.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nothing repaid yet"
            description={`The first deduction will appear here once the payroll run for ${formatPeriod(
              loan.startPeriod,
            )} is finalised.`}
          />
        ) : (
          <DataList
            rows={loan.repayments}
            rowKey={(repayment) => repayment.id}
            columns={[
              {
                key: "period",
                header: "Month",
                role: "primary",
                cell: (repayment) => formatPeriod(repayment.period),
              },
              {
                key: "source",
                header: "Source",
                role: "secondary",
                className: "text-muted-foreground",
                cell: (repayment) =>
                  repayment.payslipId ? (
                    <Link href={`/payroll/${repayment.runId}`} className="hover:underline">
                      Deducted from payslip
                    </Link>
                  ) : (
                    (repayment.note ?? "Paid directly")
                  ),
              },
              {
                key: "amount",
                header: "Amount",
                role: "trailing",
                className: "font-data text-right",
                headerClassName: "text-right",
                cell: (repayment) => (
                  <span className="font-data font-medium">{formatCurrency(repayment.amount)}</span>
                ),
              },
              {
                key: "counts",
                header: "Counted",
                cell: (repayment) =>
                  repayment.payslipId && repayment.runStatus === "draft" ? (
                    <Badge variant="warning">Scheduled</Badge>
                  ) : (
                    <Badge variant="success">Repaid</Badge>
                  ),
              },
              {
                key: "recorded",
                header: "Recorded",
                className: "whitespace-nowrap text-muted-foreground",
                desktopOnly: true,
                cell: (repayment) => formatDate(repayment.createdAt),
              },
              ...(canManage
                ? [
                    {
                      key: "actions",
                      header: "",
                      headerClassName: "text-right",
                      className: "text-right",
                      cell: (repayment: (typeof loan.repayments)[number]) =>
                        repayment.payslipId ? (
                          <span className="text-xs text-muted-foreground">From payroll</span>
                        ) : (
                          <DeleteRepaymentButton loanId={loan.id} repaymentId={repayment.id} />
                        ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </section>

      {loan.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{loan.notes}</CardContent>
        </Card>
      ) : null}
    </>
  );
}
