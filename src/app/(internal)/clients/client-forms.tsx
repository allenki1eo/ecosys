"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Building2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { createClientAction, createSiteAction } from "./actions";
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

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Shared open/close + toast wiring for the two creation sheets below. */
function useSheetAction(state: ActionResult<string> | undefined, close: () => void, message: string) {
  const router = useRouter();
  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(message);
      close();
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, close, message, router]);
}

export function NewClientSheet() {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useFormState(
    createClientAction,
    undefined as ActionResult<string> | undefined,
  );
  useSheetAction(state, () => setOpen(false), "Client created");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Building2 /> New client
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New client company</SheetTitle>
          <SheetDescription>
            Creating a client sets up their isolated portal — their users only ever see this
            company&apos;s data.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Company name</Label>
                <Input id="name" name="name" placeholder="Pepsi Bottling Tanzania" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Portal key</Label>
                <Input id="slug" name="slug" placeholder="pepsi" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" name="industry" placeholder="Beverage manufacturing" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contractStart">Contract start</Label>
                <Input id="contractStart" name="contractStart" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractEnd">Contract end</Label>
                <Input id="contractEnd" name="contractEnd" type="date" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="billingContact">Billing contact</Label>
                <Input id="billingContact" name="billingContact" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingEmail">Billing email</Label>
                <Input id="billingEmail" name="billingEmail" type="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingPhone">Billing phone</Label>
                <Input id="billingPhone" name="billingPhone" placeholder="+255…" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentTermsDays">Payment terms (days)</Label>
                <Input
                  id="paymentTermsDays"
                  name="paymentTermsDays"
                  type="number"
                  defaultValue={30}
                  min={0}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="specNotes">Chemical / spec notes for crews</Label>
              <Textarea
                id="specNotes"
                name="specNotes"
                placeholder="Food-grade sanitiser only in filling hall…"
              />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label="Create client" />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function NewSiteSheet({ clientId }: { clientId: string }) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useFormState(
    createSiteAction,
    undefined as ActionResult<string> | undefined,
  );
  useSheetAction(state, () => setOpen(false), "Site added");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <MapPin /> Add site
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add a site</SheetTitle>
          <SheetDescription>
            Sites are where jobs happen. A client can have as many factories as they need.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <input type="hidden" name="clientId" value={clientId} />
          <div className="flex-1 space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="site-name">Site name</Label>
              <Input id="site-name" name="name" placeholder="Factory A — Shinyanga" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input id="region" name="region" placeholder="Shinyanga" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName">Site contact</Label>
                <Input id="contactName" name="contactName" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Contact phone</Label>
                <Input id="contactPhone" name="contactPhone" placeholder="+255…" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gpsLat">GPS latitude</Label>
                <Input id="gpsLat" name="gpsLat" type="number" step="any" placeholder="-3.6619" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gpsLng">GPS longitude</Label>
                <Input id="gpsLng" name="gpsLng" type="number" step="any" placeholder="33.4212" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-notes">Access notes</Label>
              <Textarea id="site-notes" name="notes" />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label="Add site" />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
