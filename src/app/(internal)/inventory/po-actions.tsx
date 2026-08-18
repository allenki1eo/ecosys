"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setPurchaseOrderStatusAction } from "./actions";
import { Button } from "@/components/ui/button";
import type { PurchaseOrderStatus } from "@db/schema";

/** Approve / reject / receive buttons on a purchase-order row. */
export function PurchaseOrderActions({
  purchaseOrderId,
  status,
  canApprove,
}: {
  purchaseOrderId: string;
  status: PurchaseOrderStatus;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const set = (next: PurchaseOrderStatus, message: string) =>
    startTransition(async () => {
      const result = await setPurchaseOrderStatusAction(purchaseOrderId, next);
      if (result.ok) {
        toast.success(message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  if (status === "requested") {
    return canApprove ? (
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => set("approved", "Purchase order approved")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => set("rejected", "Purchase order rejected")}
        >
          Reject
        </Button>
      </div>
    ) : (
      <span className="text-xs text-muted-foreground">Awaiting approval</span>
    );
  }

  if (status === "approved") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => set("ordered", "Marked as ordered")}
      >
        Mark ordered
      </Button>
    );
  }

  if (status === "ordered") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => set("received", "Stock booked in")}
      >
        Receive stock
      </Button>
    );
  }

  return <span className="text-xs text-muted-foreground">—</span>;
}
