"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { createServiceTypeAction, updateServiceTypeAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import type { CertificateType } from "@db/schema";

export type ServiceFormValues = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  defaultFrequency: string | null;
  defaultDurationMinutes: number;
  defaultRate: number;
  issuesCertificate: boolean;
  certificateType: CertificateType | null;
  certificateValidityDays: number | null;
  checklist: string[];
};

const CERTIFICATE_OPTIONS: { value: CertificateType; label: string }[] = [
  { value: "pest_control", label: "Pest control" },
  { value: "fumigation", label: "Fumigation" },
  { value: "wastewater_discharge", label: "Wastewater discharge" },
  { value: "sanitation", label: "Sanitation" },
];

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Turns "Factory deep clean" into "factory-deep-clean". */
function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function ServiceFormSheet({ service }: { service?: ServiceFormValues }) {
  const editing = Boolean(service);
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  const action = editing
    ? updateServiceTypeAction.bind(null, service!.id)
    : createServiceTypeAction;
  const [state, formAction] = useFormState(
    action as (
      prev: ActionResult<string> | undefined,
      data: FormData,
    ) => Promise<ActionResult<string>>,
    undefined as ActionResult<string> | undefined,
  );

  const [name, setName] = React.useState(service?.name ?? "");
  const [slug, setSlug] = React.useState(service?.slug ?? "");
  const [slugTouched, setSlugTouched] = React.useState(editing);
  const [certifies, setCertifies] = React.useState(service?.issuesCertificate ?? false);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(editing ? "Service updated" : "Service added");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, editing, router]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Add service
          </Button>
        )}
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editing ? `Edit ${service!.name}` : "Add a service"}</SheetTitle>
          <SheetDescription>
            Services define what crews do on site: the checklist they follow, how long it takes,
            what it bills at, and whether it produces a compliance certificate.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Service name</Label>
                <Input
                  id="name"
                  name="name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (!slugTouched) setSlug(slugify(event.target.value));
                  }}
                  placeholder="Pest control"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Short key</Label>
                <Input
                  id="slug"
                  name="slug"
                  value={slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(event.target.value);
                  }}
                  placeholder="pest-control"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={service?.description ?? ""}
                placeholder="Routine inspection, bait station servicing and targeted treatment."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="defaultFrequency">Typical cadence</Label>
                <Input
                  id="defaultFrequency"
                  name="defaultFrequency"
                  defaultValue={service?.defaultFrequency ?? ""}
                  placeholder="Every 2 weeks"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultDurationMinutes">Duration (min)</Label>
                <Input
                  id="defaultDurationMinutes"
                  name="defaultDurationMinutes"
                  type="number"
                  min={15}
                  step={15}
                  defaultValue={service?.defaultDurationMinutes ?? 120}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultRate">Rate (TZS)</Label>
                <Input
                  id="defaultRate"
                  name="defaultRate"
                  type="number"
                  min={0}
                  step={1000}
                  defaultValue={service?.defaultRate ?? 0}
                  required
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <label className="flex items-start justify-between gap-4">
                <span className="text-sm">
                  Issues a compliance certificate
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Completing a job of this type generates the certificate automatically.
                  </span>
                </span>
                <Switch checked={certifies} onCheckedChange={setCertifies} />
              </label>
              {certifies ? <input type="hidden" name="issuesCertificate" value="true" /> : null}

              {certifies ? (
                <div className="grid gap-4 pt-1 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="certificateType">Certificate type</Label>
                    <select
                      id="certificateType"
                      name="certificateType"
                      defaultValue={service?.certificateType ?? "pest_control"}
                      className={selectClass}
                    >
                      {CERTIFICATE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="certificateValidityDays">Valid for (days)</Label>
                    <Input
                      id="certificateValidityDays"
                      name="certificateValidityDays"
                      type="number"
                      min={1}
                      defaultValue={service?.certificateValidityDays ?? 90}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="checklist">Checklist — one step per line</Label>
              <Textarea
                id="checklist"
                name="checklist"
                rows={7}
                className="min-h-[160px] font-mono text-xs"
                defaultValue={(service?.checklist ?? []).join("\n")}
                placeholder={"Inspect all bait stations\nCheck perimeter entry points\nApply treatment\nBrief the site contact"}
              />
              <p className="text-xs text-muted-foreground">
                Copied onto each new job. Jobs already created keep the checklist they started
                with.
              </p>
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label={editing ? "Save changes" : "Add service"} />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
