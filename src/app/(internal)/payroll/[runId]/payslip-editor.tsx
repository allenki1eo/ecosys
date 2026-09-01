"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { adjustPayslipAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatCurrency } from "@/lib/format";
import { calculatePayslip } from "@/lib/payroll/calculate";
import type { ActionResult } from "@/lib/actions";
import type { PayrollRates } from "@db/schema";

export type PayslipEditValues = {
  id: string;
  employeeName: string;
  basicSalary: number;
  monthlyHours: number;
  daysWorked: number;
  earnedLeaveDays: number;
  sickLeaveDays: number;
  overtimeNormalHours: number;
  publicHolidayHours: number;
  responsibilityAllowance: number;
  untaxableAllowance: number;
  loanDeduction: number;
  otherDeductions: number;
  payeOverride: number | null;
  notes: string | null;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Recalculating…" : "Save payslip"}
    </Button>
  );
}

const number = (value: string) => (value === "" ? 0 : Number(value));

export function PayslipEditSheet({
  payslip,
  rates,
  loanNote,
}: {
  payslip: PayslipEditValues;
  rates: PayrollRates;
  /** What the loan deduction is recovering, so it is not just a number. */
  loanNote?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState(
    adjustPayslipAction.bind(null, payslip.id),
    undefined as ActionResult | undefined,
  );

  const [form, setForm] = React.useState({
    overtimeNormalHours: String(payslip.overtimeNormalHours),
    publicHolidayHours: String(payslip.publicHolidayHours),
    responsibilityAllowance: String(payslip.responsibilityAllowance),
    untaxableAllowance: String(payslip.untaxableAllowance),
    loanDeduction: String(payslip.loanDeduction),
    otherDeductions: String(payslip.otherDeductions),
    payeOverride: payslip.payeOverride == null ? "" : String(payslip.payeOverride),
  });

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  // The same function the server runs, so what is previewed is what is saved.
  // Computed twice: once as it will be saved, once ignoring the override, so the
  // hint under the PAYE field always shows what the bands would give for the
  // figures currently on screen.
  const { preview, banded } = React.useMemo(() => {
    const input = {
      basicSalary: payslip.basicSalary,
      monthlyHours: payslip.monthlyHours,
      overtimeNormalHours: number(form.overtimeNormalHours),
      publicHolidayHours: number(form.publicHolidayHours),
      responsibilityAllowance: number(form.responsibilityAllowance),
      untaxableAllowance: number(form.untaxableAllowance),
      loanDeduction: number(form.loanDeduction),
      otherDeductions: number(form.otherDeductions),
    };
    return {
      preview: calculatePayslip(
        { ...input, payeOverride: form.payeOverride === "" ? null : Number(form.payeOverride) },
        rates,
      ),
      banded: calculatePayslip(input, rates).paye,
    };
  }, [form, payslip.basicSalary, payslip.monthlyHours, rates]);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Payslip recalculated");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil /> Edit
        </Button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>{payslip.employeeName}</SheetTitle>
          <SheetDescription>
            Basic pay comes from the employee record. Everything below is specific to this month and
            recalculates the payslip when you save.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-5 p-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="daysWorked">Days worked</Label>
                <Input
                  id="daysWorked"
                  name="daysWorked"
                  type="number"
                  min={0}
                  max={31}
                  defaultValue={payslip.daysWorked}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="earnedLeaveDays">Leave</Label>
                <Input
                  id="earnedLeaveDays"
                  name="earnedLeaveDays"
                  type="number"
                  min={0}
                  max={31}
                  defaultValue={payslip.earnedLeaveDays}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sickLeaveDays">Sick</Label>
                <Input
                  id="sickLeaveDays"
                  name="sickLeaveDays"
                  type="number"
                  min={0}
                  max={31}
                  defaultValue={payslip.sickLeaveDays}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Earnings</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="overtimeNormalHours">Overtime hours (×1.5)</Label>
                  <Input
                    id="overtimeNormalHours"
                    name="overtimeNormalHours"
                    type="number"
                    min={0}
                    step="any"
                    value={form.overtimeNormalHours}
                    onChange={set("overtimeNormalHours")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="publicHolidayHours">Public holiday hours (×2)</Label>
                  <Input
                    id="publicHolidayHours"
                    name="publicHolidayHours"
                    type="number"
                    min={0}
                    step="any"
                    value={form.publicHolidayHours}
                    onChange={set("publicHolidayHours")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="responsibilityAllowance">Responsibility allowance</Label>
                  <Input
                    id="responsibilityAllowance"
                    name="responsibilityAllowance"
                    type="number"
                    min={0}
                    step="any"
                    value={form.responsibilityAllowance}
                    onChange={set("responsibilityAllowance")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="untaxableAllowance">Transport (untaxed)</Label>
                  <Input
                    id="untaxableAllowance"
                    name="untaxableAllowance"
                    type="number"
                    min={0}
                    step="any"
                    value={form.untaxableAllowance}
                    onChange={set("untaxableAllowance")}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Deductions</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="loanDeduction">Loan / advance</Label>
                  <Input
                    id="loanDeduction"
                    name="loanDeduction"
                    type="number"
                    min={0}
                    step="any"
                    value={form.loanDeduction}
                    onChange={set("loanDeduction")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {loanNote ??
                      "Filled in automatically from the employee's outstanding loans and advances."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otherDeductions">Other deductions</Label>
                  <Input
                    id="otherDeductions"
                    name="otherDeductions"
                    type="number"
                    min={0}
                    step="any"
                    value={form.otherDeductions}
                    onChange={set("otherDeductions")}
                  />
                </div>
              </div>

              <div className="space-y-2 border-t pt-3">
                <Label htmlFor="payeOverride">PAYE (leave blank to compute it)</Label>
                <Input
                  id="payeOverride"
                  name="payeOverride"
                  type="number"
                  min={0}
                  step="any"
                  value={form.payeOverride}
                  onChange={set("payeOverride")}
                  placeholder={String(banded)}
                />
                <p className="text-xs text-muted-foreground">
                  Computed from the bands on gross pay less NSSF: {formatCurrency(banded)}. Type a
                  figure here to use that instead — for a month whose return was filed by hand.
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-4 text-xs sm:grid-cols-4">
              <Figure label="Gross" value={formatCurrency(preview.grossEarnings)} />
              <Figure label="PAYE" value={formatCurrency(preview.paye)} />
              <Figure label="Deductions" value={formatCurrency(preview.totalDeductions)} />
              <Figure label="Payable" value={formatCurrency(preview.totalEarning)} strong />
            </dl>

            <div className="space-y-2">
              <Label htmlFor="notes">Note on this payslip</Label>
              <Textarea id="notes" name="notes" defaultValue={payslip.notes ?? ""} />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={strong ? "truncate font-data font-semibold text-brand-green" : "truncate font-data"}
      >
        {value}
      </dd>
    </div>
  );
}
