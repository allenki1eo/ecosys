"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { HandCoins, Pencil, Trash2, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  createLoanAction,
  deleteLoanAction,
  deleteRepaymentAction,
  recordRepaymentAction,
  updateLoanAction,
  writeOffLoanAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import type { ActionResult } from "@/lib/actions";
import type { LoanKind } from "@db/schema";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export type LoanEmployee = { id: string; name: string; employeeNo: string };

export type LoanFormValues = {
  id: string;
  employeeName: string;
  kind: LoanKind;
  principal: number;
  monthlyDeduction: number;
  startPeriod: string;
  reason: string | null;
  notes: string | null;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Deductions normally start with the month after the money was handed over. */
function nextMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function LoanFormSheet({
  employees,
  loan,
}: {
  employees?: LoanEmployee[];
  loan?: LoanFormValues;
}) {
  const editing = Boolean(loan);
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  const action = editing ? updateLoanAction.bind(null, loan!.id) : createLoanAction;
  const [state, formAction] = useFormState(
    action as (
      prev: ActionResult<string> | undefined,
      data: FormData,
    ) => Promise<ActionResult<string>>,
    undefined as ActionResult<string> | undefined,
  );

  // Show how long it takes to clear, because that is the question anyone
  // setting an instalment is actually asking.
  const [principal, setPrincipal] = React.useState(loan?.principal ?? 0);
  const [instalment, setInstalment] = React.useState(loan?.monthlyDeduction ?? 0);
  const months = instalment > 0 ? Math.ceil(principal / instalment) : 0;

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(editing ? "Loan updated" : "Loan recorded");
      setOpen(false);
      router.refresh();
      if (!editing && state.data) router.push(`/payroll/loans/${state.data}`);
    } else {
      toast.error(state.error);
    }
  }, [state, editing, router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {editing ? (
          <Button variant="outline" size="sm">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <HandCoins /> Record a loan
          </Button>
        )}
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editing ? `${loan!.employeeName}'s loan` : "Record a loan or advance"}</SheetTitle>
          <SheetDescription>
            The deduction is added to every payslip from the starting month until the balance
            clears. Nothing is deducted from a run that has already been finalised.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-5 p-5">
            {editing ? null : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="employeeId">Employee</Label>
                  <select id="employeeId" name="employeeId" className={selectClass} required>
                    <option value="">Choose an employee…</option>
                    {(employees ?? []).map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name} (No. {employee.employeeNo})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kind">Type</Label>
                  <select id="kind" name="kind" className={selectClass} defaultValue="loan">
                    <option value="loan">Loan — repaid over several months</option>
                    <option value="advance">Salary advance — usually one month</option>
                  </select>
                </div>
              </div>
            )}

            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Amount and recovery</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="principal">Amount advanced (TZS)</Label>
                  <Input
                    id="principal"
                    name="principal"
                    type="number"
                    min={0}
                    step="any"
                    value={principal || ""}
                    onChange={(event) => setPrincipal(Number(event.target.value))}
                    readOnly={editing}
                    // The principal is what was handed over. Repayments are
                    // measured against it, so it is fixed once recorded.
                    className={editing ? "text-muted-foreground" : undefined}
                    required
                  />
                  {editing ? (
                    <p className="text-xs text-muted-foreground">
                      Fixed — write this loan off and record a new one if the amount was wrong.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthlyDeduction">Deduct each month (TZS)</Label>
                  <Input
                    id="monthlyDeduction"
                    name="monthlyDeduction"
                    type="number"
                    min={0}
                    step="any"
                    value={instalment || ""}
                    onChange={(event) => setInstalment(Number(event.target.value))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startPeriod">Deduct from</Label>
                  <Input
                    id="startPeriod"
                    name="startPeriod"
                    type="month"
                    defaultValue={loan?.startPeriod ?? nextMonth()}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Input
                    id="reason"
                    name="reason"
                    defaultValue={loan?.reason ?? ""}
                    placeholder="School fees, medical…"
                  />
                </div>
              </div>

              {months > 0 ? (
                <p className="border-t pt-3 text-xs text-muted-foreground">
                  {formatCurrency(instalment)} a month clears {formatCurrency(principal)} in{" "}
                  <span className="font-data text-foreground">{months}</span> month
                  {months === 1 ? "" : "s"}
                  {principal % instalment !== 0
                    ? `, the last one ${formatCurrency(principal % instalment)}.`
                    : "."}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={loan?.notes ?? ""} />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label={editing ? "Save changes" : "Record loan"} />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function RecordRepaymentDialog({
  loanId,
  outstanding,
}: {
  loanId: string;
  outstanding: number;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState(
    recordRepaymentAction.bind(null, loanId),
    undefined as ActionResult | undefined,
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Repayment recorded");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Record a repayment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repayment outside payroll</DialogTitle>
          <DialogDescription>
            For money paid back directly — cash or a transfer. Deductions taken through a payslip
            are recorded automatically; do not enter them here as well.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (TZS)</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              min={1}
              max={outstanding}
              step="any"
              required
            />
            <p className="text-xs text-muted-foreground">
              {formatCurrency(outstanding)} still outstanding.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="period">Month</Label>
            <Input
              id="period"
              name="period"
              type="month"
              defaultValue={nextMonth()}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Input id="note" name="note" placeholder="Paid in cash at the office" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label="Record repayment" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LoanLifecycleControls({
  loanId,
  writtenOff,
  canDelete,
}: {
  loanId: string;
  writtenOff: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await writeOffLoanAction(loanId, writtenOff);
            if (result.ok) {
              toast.success(writtenOff ? "Loan reinstated" : "Balance written off");
              router.refresh();
            } else {
              toast.error(result.error);
            }
          })
        }
      >
        {writtenOff ? (
          <>
            <Undo2 /> Reinstate
          </>
        ) : (
          <>
            <XCircle /> Write off balance
          </>
        )}
      </Button>

      {canDelete ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteLoanAction(loanId);
              if (result.ok) {
                toast.success("Loan deleted");
                router.push("/payroll/loans");
              } else {
                toast.error(result.error);
              }
            })
          }
        >
          <Trash2 /> Delete
        </Button>
      ) : null}
    </>
  );
}

export function DeleteRepaymentButton({
  loanId,
  repaymentId,
}: {
  loanId: string;
  repaymentId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label="Delete repayment"
      onClick={() =>
        startTransition(async () => {
          const result = await deleteRepaymentAction(loanId, repaymentId);
          if (result.ok) {
            toast.success("Repayment removed");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      <Trash2 />
    </Button>
  );
}
