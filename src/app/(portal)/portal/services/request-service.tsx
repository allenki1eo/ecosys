"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { CalendarPlus, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";

import { raiseIssueAction, requestServiceAction } from "../actions";
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

type SiteOption = { id: string; name: string };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : label}
    </Button>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function RequestServiceSheet({
  sites,
  serviceTypes = [],
}: {
  sites: SiteOption[];
  serviceTypes?: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState(
    requestServiceAction,
    undefined as ActionResult<string> | undefined,
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Request sent to Ecohygiene");
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
          <CalendarPlus /> Request service
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Request an ad-hoc service</SheetTitle>
          <SheetDescription>
            The operations team is notified and will confirm a slot with your site contact.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="req-site">Site</Label>
              <select id="req-site" name="siteId" required className={selectClass}>
                <option value="">Select a site…</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>

            {serviceTypes.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="req-service">Service needed</Label>
                <select id="req-service" name="serviceTypeId" className={selectClass}>
                  <option value="">Not sure / other</option>
                  {serviceTypes.map((serviceType) => (
                    <option key={serviceType.id} value={serviceType.id}>
                      {serviceType.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="req-urgency">Urgency</Label>
                <select id="req-urgency" name="urgency" defaultValue="routine" className={selectClass}>
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="req-date">Preferred date</Label>
                <Input id="req-date" name="preferredDate" type="date" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="req-description">What do you need?</Label>
              <Textarea id="req-description" name="description" required />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label="Send request" />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function RaiseIssueSheet({ sites }: { sites: SiteOption[] }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState(
    raiseIssueAction,
    undefined as ActionResult<string> | undefined,
  );

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Issue raised");
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
          <MessageSquareWarning /> Raise an issue
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Raise an issue</SheetTitle>
          <SheetDescription>
            Pest sightings, a missed visit, a quality concern — anything you want looked at.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="issue-site">Site</Label>
              <select id="issue-site" name="siteId" required className={selectClass}>
                <option value="">Select a site…</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue-title">Title</Label>
              <Input id="issue-title" name="title" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue-description">Details</Label>
              <Textarea id="issue-description" name="description" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issue-severity">Severity</Label>
              <select id="issue-severity" name="severity" defaultValue="medium" className={selectClass}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label="Raise issue" />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
