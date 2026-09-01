"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";

import { issueCertificateAction } from "./actions";
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

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const TYPES = [
  { value: "pest_control", label: "Pest control" },
  { value: "fumigation", label: "Fumigation" },
  { value: "wastewater_discharge", label: "Wastewater discharge" },
  { value: "sanitation", label: "Sanitation" },
] as const;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Issuing…" : "Issue certificate"}
    </Button>
  );
}

export function IssueCertificateDialog({
  sites,
}: {
  sites: { id: string; name: string; clientName: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState(
    issueCertificateAction,
    undefined as ActionResult<string> | undefined,
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Certificate issued");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <FilePlus2 /> Issue certificate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue a certificate</DialogTitle>
          <DialogDescription>
            Completing a job issues one automatically. Use this for work done before the system, or
            to reissue after an inspection.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="siteId">Site</Label>
            <select id="siteId" name="siteId" className={selectClass} required>
              <option value="">Choose a site…</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.clientName} — {site.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <select id="type" name="type" className={selectClass} defaultValue="pest_control">
              {TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="validityDays">Valid for (days)</Label>
            <Input
              id="validityDays"
              name="validityDays"
              type="number"
              min={1}
              defaultValue={365}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="authority">Issuing authority</Label>
            <Input id="authority" name="authority" placeholder="TBS, NEMC, TFDA…" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
