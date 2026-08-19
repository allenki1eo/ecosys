"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

import { recordMovementAction } from "./actions";
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
import type { ActionResult } from "@/lib/actions";

const REASONS = [
  { value: "purchase", label: "Stock received" },
  { value: "transfer", label: "Transfer to a site / mixing unit" },
  { value: "adjustment", label: "Stock count adjustment" },
  { value: "wastage", label: "Wastage / spillage" },
  { value: "return", label: "Returned to warehouse" },
] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Recording…" : "Record movement"}
    </Button>
  );
}

/**
 * Stock only changes through a movement, never by editing a quantity — this
 * sheet is that single entry point.
 */
export function StockAdjustSheet({
  items,
  sites,
}: {
  items: { id: string; name: string; unit: string; quantityOnHand: number }[];
  sites: { id: string; name: string; clientName: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState(recordMovementAction, undefined as ActionResult | undefined);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Movement recorded");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <ArrowLeftRight /> Record movement
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Record a stock movement</SheetTitle>
          <SheetDescription>
            Use a negative quantity for stock leaving the warehouse. Every movement is written to
            the audit ledger.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="itemId">Item</Label>
              <select
                id="itemId"
                name="itemId"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select an item…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.quantityOnHand} {item.unit} on hand)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="quantityDelta">Quantity change</Label>
                <Input
                  id="quantityDelta"
                  name="quantityDelta"
                  type="number"
                  step="0.1"
                  placeholder="-20"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <select
                  id="reason"
                  name="reason"
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="siteId">Destination site (optional)</Label>
              <select
                id="siteId"
                name="siteId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Warehouse</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.clientName} — {site.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" placeholder="Batch number, who collected it…" />
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
