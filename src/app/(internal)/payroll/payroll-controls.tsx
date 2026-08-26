"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { CalendarPlus, Check, Mail, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createPayrollRunAction,
  deletePayrollRunAction,
  sendAllPayslipsAction,
  sendPayslipAction,
  setRunStatusAction,
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
import type { ActionResult } from "@/lib/actions";
import type { PayrollRunStatus } from "@db/schema";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

/** Defaults to last month — payroll is run in arrears. */
function previousMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function NewPayrollRunDialog() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState(
    createPayrollRunAction,
    undefined as ActionResult<string> | undefined,
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Payroll run created from active employees");
      setOpen(false);
      router.refresh();
      if (state.data) router.push(`/payroll/${state.data}`);
    } else {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CalendarPlus /> New payroll run
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run payroll</DialogTitle>
          <DialogDescription>
            A payslip is generated for every active employee from their current salary details.
            Amounts stay editable until you finalise the run.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="period">Month</Label>
            <Input id="period" name="period" type="month" defaultValue={previousMonth()} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" placeholder="Anything unusual about this month…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label="Create run" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RunStatusControls({
  runId,
  status,
  canSend,
  unsentCount,
}: {
  runId: string;
  status: PayrollRunStatus;
  canSend: boolean;
  unsentCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const setStatus = (next: PayrollRunStatus, message: string) =>
    startTransition(async () => {
      const result = await setRunStatusAction(runId, next);
      if (result.ok) {
        toast.success(message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" ? (
        <>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => setStatus("finalised", "Run finalised — payslips can now be sent")}
          >
            <Check /> Finalise run
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deletePayrollRunAction(runId);
                if (result.ok) {
                  toast.success("Draft run deleted");
                  router.push("/payroll");
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            <Trash2 /> Delete draft
          </Button>
        </>
      ) : null}

      {status === "finalised" ? (
        <>
          {canSend && unsentCount > 0 ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await sendAllPayslipsAction(runId);
                  if (result.ok) {
                    toast.success(result.data ?? "Payslips queued");
                    router.refresh();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              <Send /> Send {unsentCount} payslip{unsentCount === 1 ? "" : "s"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setStatus("paid", "Run marked as paid")}
          >
            Mark as paid
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setStatus("draft", "Run reopened for editing")}
          >
            Reopen
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function SendPayslipButton({
  payslipId,
  sentAt,
  disabled,
}: {
  payslipId: string;
  sentAt: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  if (sentAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-brand-green">
        <Check className="size-3" /> Sent
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending || disabled}
      title={disabled ? "Finalise the run before sending payslips" : undefined}
      onClick={() =>
        startTransition(async () => {
          const result = await sendPayslipAction(payslipId);
          if (result.ok) {
            toast.success(`Payslip queued to ${result.data}`);
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      <Mail /> Send
    </Button>
  );
}
