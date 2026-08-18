"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createJobAction } from "./actions";
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

type SiteOption = { id: string; name: string; clientName: string };
type ServiceTypeOption = { id: string; name: string; defaultDurationMinutes: number };
type CrewOption = { id: string; name: string; role: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Scheduling…" : "Schedule job"}
    </Button>
  );
}

/**
 * Quick-create lives in a slide-over rather than its own page — scheduling is
 * something you do while looking at the calendar.
 */
export function NewJobSheet({
  sites,
  serviceTypes,
  crew,
  defaultSiteId,
}: {
  sites: SiteOption[];
  serviceTypes: ServiceTypeOption[];
  crew: CrewOption[];
  defaultSiteId?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState(createJobAction, undefined as ActionResult<string> | undefined);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Job scheduled");
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
          <Plus /> New job
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Schedule a job</SheetTitle>
          <SheetDescription>
            The checklist for the chosen service type is copied onto the job for the crew.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="siteId">Site</Label>
              <select
                id="siteId"
                name="siteId"
                defaultValue={defaultSiteId}
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
              <Label htmlFor="serviceTypeId">Service type</Label>
              <select
                id="serviceTypeId"
                name="serviceTypeId"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a service…</option>
                {serviceTypes.map((serviceType) => (
                  <option key={serviceType.id} value={serviceType.id}>
                    {serviceType.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="scheduledAt">Date & time</Label>
                <Input id="scheduledAt" name="scheduledAt" type="datetime-local" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">Duration (minutes)</Label>
                <Input
                  id="durationMinutes"
                  name="durationMinutes"
                  type="number"
                  min={15}
                  step={15}
                  placeholder="120"
                />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Crew</legend>
              <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                {crew.map((member) => (
                  <label key={member.id} className="flex items-center gap-2 text-sm">
                    <Checkbox name="assignedCrew" value={member.id} />
                    <span className="truncate">{member.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Crew members get an SMS reminder before the visit.
              </p>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes for the crew</Label>
              <Textarea id="notes" name="notes" placeholder="Access instructions, contacts…" />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
