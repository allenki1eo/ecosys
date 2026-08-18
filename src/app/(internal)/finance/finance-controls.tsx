"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { FilePlus2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { generateInvoiceAction, recordPaymentAction, setInvoiceStatusAction, sweepOverdueAction } from "./actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions";
import type { InvoiceStatus } from "@db/schema";

export function GenerateInvoiceDialog({ clients }: { clients: { id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [clientId, setClientId] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <FilePlus2 /> Generate invoice
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate an invoice</DialogTitle>
          <DialogDescription>
            Every completed job that has not been billed yet becomes a line item on a new draft
            invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="invoice-client">Client</Label>
          <select
            id="invoice-client"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select a client…</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || !clientId}
            onClick={() =>
              startTransition(async () => {
                const result = await generateInvoiceAction(clientId);
                if (result.ok) {
                  toast.success("Draft invoice created");
                  setOpen(false);
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SweepOverdueButton() {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await sweepOverdueAction();
          if (result.ok) {
            toast.success("Overdue invoices refreshed");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      <RefreshCw /> Refresh overdue
    </Button>
  );
}

export function InvoiceStatusControl({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: InvoiceStatus;
}) {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  const apply = (next: InvoiceStatus, message: string) =>
    startTransition(async () => {
      const result = await setInvoiceStatusAction(invoiceId, next);
      if (result.ok) {
        toast.success(message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  if (status === "draft") {
    return (
      <Button size="sm" disabled={pending} onClick={() => apply("issued", "Invoice issued")}>
        Issue
      </Button>
    );
  }

  if (status === "paid" || status === "void") return null;

  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => apply("void", "Invoice voided")}>
      Void
    </Button>
  );
}

function PaymentSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Recording…" : "Record payment"}
    </Button>
  );
}

export function RecordPaymentForm({ invoiceId, balance }: { invoiceId: string; balance: number }) {
  const router = useRouter();
  const action = recordPaymentAction.bind(null, invoiceId);
  const [state, formAction] = useFormState(action, undefined as ActionResult | undefined);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Payment recorded");
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="amount">Amount (TZS)</Label>
        <Input id="amount" name="amount" type="number" min={1} defaultValue={balance} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="method">Method</Label>
        <select
          id="method"
          name="method"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="bank_transfer">Bank transfer</option>
          <option value="mobile_money">Mobile money</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reference">Reference</Label>
        <Input id="reference" name="reference" placeholder="TXN / M-Pesa ref" />
      </div>
      <PaymentSubmit />
    </form>
  );
}
