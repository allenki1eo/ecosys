"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Building2, MapPin, Pencil } from "lucide-react";
import { toast } from "sonner";

import {
  createClientAction,
  createSiteAction,
  updateClientAction,
  updateSiteAction,
} from "./actions";
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
import type { ClientStatus } from "@db/schema";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/**
 * A create action reports the new record's id, an update action reports
 * nothing; neither is read here, so both drive these sheets identically.
 */
type SheetAction = (
  prev: ActionResult<string> | undefined,
  data: FormData,
) => Promise<ActionResult<string>>;

/**
 * Shared open/close + toast wiring for the sheets below.
 *
 * `close` is an inline arrow at every call site, so it has a fresh identity on
 * every render. Depending on it re-ran this effect continuously and fired the
 * toast dozens of times for one save — so it is held in a ref and the effect
 * keys only on the result it is reacting to.
 */
function useSheetAction(state: ActionResult<string> | undefined, close: () => void, message: string) {
  const router = useRouter();
  const closeRef = React.useRef(close);
  closeRef.current = close;

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(message);
      closeRef.current();
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, message, router]);
}

export type ClientFormValues = {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  contractStart: Date | null;
  contractEnd: Date | null;
  billingContact: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
  paymentTermsDays: number;
  status: ClientStatus;
  specNotes: string | null;
};

/** `<input type="date">` wants `YYYY-MM-DD`, and nothing else. */
function dateValue(date: Date | null | undefined): string {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

export function ClientFormSheet({ client }: { client?: ClientFormValues }) {
  const editing = Boolean(client);
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useFormState(
    (editing
      ? updateClientAction.bind(null, client!.id)
      : createClientAction) as SheetAction,
    undefined as ActionResult<string> | undefined,
  );
  useSheetAction(state, () => setOpen(false), editing ? "Client updated" : "Client created");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {editing ? (
          <Button size="sm" variant="outline">
            <Pencil /> Edit client
          </Button>
        ) : (
          <Button size="sm">
            <Building2 /> New client
          </Button>
        )}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editing ? client!.name : "New client company"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Changing the portal key changes the address their users sign in at."
              : "Creating a client sets up their isolated portal — their users only ever see this company's data."}
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Company name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={client?.name}
                  placeholder="Pepsi Bottling Tanzania"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Portal key</Label>
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={client?.slug}
                  placeholder="pepsi"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                name="industry"
                defaultValue={client?.industry ?? ""}
                placeholder="Beverage manufacturing"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contractStart">Contract start</Label>
                <Input
                  id="contractStart"
                  name="contractStart"
                  type="date"
                  defaultValue={dateValue(client?.contractStart)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractEnd">Contract end</Label>
                <Input
                  id="contractEnd"
                  name="contractEnd"
                  type="date"
                  defaultValue={dateValue(client?.contractEnd)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="billingContact">Billing contact</Label>
                <Input
                  id="billingContact"
                  name="billingContact"
                  defaultValue={client?.billingContact ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingEmail">Billing email</Label>
                <Input
                  id="billingEmail"
                  name="billingEmail"
                  type="email"
                  defaultValue={client?.billingEmail ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingPhone">Billing phone</Label>
                <Input
                  id="billingPhone"
                  name="billingPhone"
                  defaultValue={client?.billingPhone ?? ""}
                  placeholder="+255…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentTermsDays">Payment terms (days)</Label>
                <Input
                  id="paymentTermsDays"
                  name="paymentTermsDays"
                  type="number"
                  defaultValue={client?.paymentTermsDays ?? 30}
                  min={0}
                />
              </div>
            </div>

            {editing ? (
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  defaultValue={client!.status}
                >
                  <option value="prospect">Prospect</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="churned">Churned</option>
                </select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="specNotes">Chemical / spec notes for crews</Label>
              <Textarea
                id="specNotes"
                name="specNotes"
                defaultValue={client?.specNotes ?? ""}
                placeholder="Food-grade sanitiser only in filling hall…"
              />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label={editing ? "Save changes" : "Create client"} />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export type SiteFormValues = {
  id: string;
  name: string;
  address: string | null;
  region: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
};

export function SiteFormSheet({
  clientId,
  site,
}: {
  clientId?: string;
  site?: SiteFormValues;
}) {
  const editing = Boolean(site);
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useFormState(
    (editing ? updateSiteAction.bind(null, site!.id) : createSiteAction) as SheetAction,
    undefined as ActionResult<string> | undefined,
  );
  useSheetAction(state, () => setOpen(false), editing ? "Site updated" : "Site added");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {editing ? (
          <Button size="sm" variant="outline">
            <Pencil /> Edit site
          </Button>
        ) : (
          <Button size="sm" variant="outline">
            <MapPin /> Add site
          </Button>
        )}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editing ? site!.name : "Add a site"}</SheetTitle>
          <SheetDescription>
            Sites are where jobs happen. A client can have as many factories as they need.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
          <div className="flex-1 space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="site-name">Site name</Label>
              <Input
                id="site-name"
                name="name"
                defaultValue={site?.name}
                placeholder="Factory A — Shinyanga"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" name="address" defaultValue={site?.address ?? ""} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input
                  id="region"
                  name="region"
                  defaultValue={site?.region ?? ""}
                  placeholder="Shinyanga"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName">Site contact</Label>
                <Input
                  id="contactName"
                  name="contactName"
                  defaultValue={site?.contactName ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Contact phone</Label>
                <Input
                  id="contactPhone"
                  name="contactPhone"
                  defaultValue={site?.contactPhone ?? ""}
                  placeholder="+255…"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gpsLat">GPS latitude</Label>
                <Input
                  id="gpsLat"
                  name="gpsLat"
                  type="number"
                  step="any"
                  defaultValue={site?.gpsLat ?? ""}
                  placeholder="-3.6619"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gpsLng">GPS longitude</Label>
                <Input
                  id="gpsLng"
                  name="gpsLng"
                  type="number"
                  step="any"
                  defaultValue={site?.gpsLng ?? ""}
                  placeholder="33.4212"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-notes">Access notes</Label>
              <Textarea id="site-notes" name="notes" defaultValue={site?.notes ?? ""} />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label={editing ? "Save changes" : "Add site"} />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
