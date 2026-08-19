"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { reportIncidentAction, updateIncidentStatusAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/misc";
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
import type { IncidentStatus } from "@db/schema";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Logging…" : "Log incident"}
    </Button>
  );
}

export function ReportIncidentSheet({
  sites,
  allowInternalOnly = true,
}: {
  sites: { id: string; name: string; clientName: string }[];
  allowInternalOnly?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState(
    reportIncidentAction,
    undefined as ActionResult<string> | undefined,
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Incident logged");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <ShieldAlert /> Log incident
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Log an incident</SheetTitle>
          <SheetDescription>
            Pest resurgence, contamination flags, equipment faults — anything needing follow-up.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="siteId">Site</Label>
              <select
                id="siteId"
                name="siteId"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a site…</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.clientName} — {site.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" placeholder="Rodent activity in raw store" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">What was found</Label>
              <Textarea id="description" name="description" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <select
                id="severity"
                name="severity"
                defaultValue="medium"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="photoUrl">Photo URL</Label>
              <Input id="photoUrl" name="photoUrl" placeholder="https://…" />
            </div>

            {allowInternalOnly ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="clientVisible" value="true" defaultChecked />
                Visible to the client in their portal
              </label>
            ) : (
              <input type="hidden" name="clientVisible" value="true" />
            )}
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

/** Inline status control on an incident row. */
export function IncidentStatusControl({
  incidentId,
  status,
}: {
  incidentId: string;
  status: IncidentStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [notes, setNotes] = React.useState("");
  const [showNotes, setShowNotes] = React.useState(false);

  const apply = (next: IncidentStatus) =>
    startTransition(async () => {
      const result = await updateIncidentStatusAction(incidentId, next, notes || undefined);
      if (result.ok) {
        toast.success(`Incident marked ${next}`);
        setShowNotes(false);
        setNotes("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  if (status === "resolved" || status === "closed") {
    return <span className="text-xs text-muted-foreground">No action needed</span>;
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {status === "open" ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => apply("investigating")}>
            Investigate
          </Button>
        ) : null}
        <Button size="sm" disabled={pending} onClick={() => setShowNotes((prev) => !prev)}>
          Resolve
        </Button>
      </div>
      {showNotes ? (
        <div className="flex w-64 flex-col gap-2">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What was done to resolve it?"
            className="min-h-[60px] text-xs"
          />
          <Button size="sm" disabled={pending} onClick={() => apply("resolved")}>
            Confirm resolution
          </Button>
        </div>
      ) : null}
    </div>
  );
}
