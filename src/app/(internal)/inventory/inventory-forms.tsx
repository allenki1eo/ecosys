"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Pencil, Plus, Trash2, Truck, Wrench } from "lucide-react";
import { toast } from "sonner";

import {
  createEquipmentAction,
  createItemAction,
  createPurchaseOrderAction,
  createSupplierAction,
  deleteSupplierAction,
  logMaintenanceAction,
  updateEquipmentAction,
  updateItemAction,
  updateSupplierAction,
} from "./actions";
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
import { formatCurrency } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export type SiteOption = { id: string; name: string; clientName: string };
export type SupplierOption = { id: string; name: string };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/**
 * A create action reports the new record's id and an update action reports
 * nothing, so their types differ in a way TypeScript will not unify. This hook
 * reads neither — only `ok` and `error` — so they drive it identically.
 */
type SheetAction = (
  prev: ActionResult<string> | undefined,
  data: FormData,
) => Promise<ActionResult<string>>;

/**
 * Every form here behaves the same way: close on success, refresh the page
 * behind it, and surface the failure as a toast rather than swallowing it.
 */
function useFormSheet(action: SheetAction, messages: { success: string }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const [state, formAction] = useFormState(action, undefined as ActionResult<string> | undefined);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(messages.success);
      setOpen(false);
      router.refresh();
    } else {
      toast.error(state.error);
    }
  }, [state, router, messages.success]);

  return { open, setOpen, formAction };
}

/* ---------------------------------- items --------------------------------- */

export type ItemFormValues = {
  id: string;
  sku: string;
  name: string;
  category: "chemical" | "consumable" | "ppe" | "spare_part";
  unit: string;
  reorderThreshold: number;
  costPerUnit: number;
  supplierId: string | null;
  location: string;
};

export function ItemFormSheet({
  item,
  suppliers,
  sites,
  canSeeCosts = true,
}: {
  item?: ItemFormValues;
  suppliers: SupplierOption[];
  sites?: SiteOption[];
  canSeeCosts?: boolean;
}) {
  const editing = Boolean(item);
  const { open, setOpen, formAction } = useFormSheet(
    (editing
      ? updateItemAction.bind(null, item!.id)
      : createItemAction) as SheetAction,
    { success: editing ? "Item updated" : "Item added" },
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Add item
          </Button>
        )}
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editing ? item!.name : "Add a stock item"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Quantity is not edited here — stock only moves through a recorded movement, so the ledger stays the whole story."
              : "Chemicals and consumables tracked here are deducted automatically when a job uses them."}
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  name="sku"
                  defaultValue={item?.sku}
                  placeholder="CHM-AD1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Item name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={item?.name}
                  placeholder="AD1 disinfectant"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  name="category"
                  className={selectClass}
                  defaultValue={item?.category ?? "chemical"}
                >
                  <option value="chemical">Chemical</option>
                  <option value="consumable">Consumable</option>
                  <option value="ppe">PPE</option>
                  <option value="spare_part">Spare part</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  name="unit"
                  defaultValue={item?.unit ?? "L"}
                  placeholder="L, kg, bags, pcs"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reorderThreshold">Reorder level</Label>
                <Input
                  id="reorderThreshold"
                  name="reorderThreshold"
                  type="number"
                  min={0}
                  step="any"
                  defaultValue={item?.reorderThreshold ?? 0}
                />
                <p className="text-xs text-muted-foreground">
                  Flagged as low once the total on hand falls to this.
                </p>
              </div>
              {canSeeCosts ? (
                <div className="space-y-2">
                  <Label htmlFor="costPerUnit">Cost per unit (TZS)</Label>
                  <Input
                    id="costPerUnit"
                    name="costPerUnit"
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={item?.costPerUnit ?? 0}
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="supplierId">Supplier</Label>
                <select
                  id="supplierId"
                  name="supplierId"
                  className={selectClass}
                  defaultValue={item?.supplierId ?? ""}
                >
                  <option value="">No supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Default location</Label>
                <Input
                  id="location"
                  name="location"
                  defaultValue={item?.location ?? "Shinyanga Warehouse"}
                />
              </div>
            </div>

            {!editing ? (
              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm font-medium">Opening stock</p>
                <p className="text-xs text-muted-foreground">
                  What is already on the shelf. Booked in as a movement, so the item&apos;s total
                  always reconciles with its ledger — leave it at zero and record a purchase later
                  if you prefer.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="openingQuantity">Quantity</Label>
                    <Input
                      id="openingQuantity"
                      name="openingQuantity"
                      type="number"
                      min={0}
                      step="any"
                      defaultValue={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="openingSiteId">Held at</Label>
                    <select id="openingSiteId" name="openingSiteId" className={selectClass}>
                      <option value="">Shinyanga Warehouse</option>
                      {(sites ?? []).map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.clientName} — {site.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label={editing ? "Save changes" : "Add item"} />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------- suppliers ------------------------------- */

export type SupplierFormValues = {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  leadTimeDays: number;
  notes?: string | null;
};

export function SupplierFormSheet({ supplier }: { supplier?: SupplierFormValues }) {
  const editing = Boolean(supplier);
  const { open, setOpen, formAction } = useFormSheet(
    (editing
      ? updateSupplierAction.bind(null, supplier!.id)
      : createSupplierAction) as SheetAction,
    { success: editing ? "Supplier updated" : "Supplier added" },
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Add supplier
          </Button>
        )}
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editing ? supplier!.name : "Add a supplier"}</SheetTitle>
          <SheetDescription>
            Who stock is ordered from. The lead time is used when judging how early to reorder.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="name">Company name</Label>
              <Input id="name" name="name" defaultValue={supplier?.name} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact">Contact person</Label>
                <Input id="contact" name="contact" defaultValue={supplier?.contact ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={supplier?.phone ?? ""}
                  placeholder="+255…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={supplier?.email ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leadTimeDays">Lead time (days)</Label>
                <Input
                  id="leadTimeDays"
                  name="leadTimeDays"
                  type="number"
                  min={0}
                  defaultValue={supplier?.leadTimeDays ?? 7}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={supplier?.notes ?? ""} />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label={editing ? "Save changes" : "Add supplier"} />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function DeleteSupplierButton({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label="Delete supplier"
      onClick={() =>
        startTransition(async () => {
          const result = await deleteSupplierAction(supplierId);
          if (result.ok) {
            toast.success("Supplier deleted");
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      <Trash2 />
    </Button>
  );
}

/* -------------------------------- equipment ------------------------------- */

export type EquipmentFormValues = {
  id: string;
  name: string;
  type: "sprayer" | "mixing_unit" | "vehicle" | "meter" | "other";
  serialNumber: string | null;
  siteId: string | null;
  status: "available" | "deployed" | "maintenance" | "retired";
};

export function EquipmentFormSheet({
  equipment,
  sites,
}: {
  equipment?: EquipmentFormValues;
  sites: SiteOption[];
}) {
  const editing = Boolean(equipment);
  const { open, setOpen, formAction } = useFormSheet(
    (editing
      ? updateEquipmentAction.bind(null, equipment!.id)
      : createEquipmentAction) as SheetAction,
    { success: editing ? "Equipment updated" : "Equipment registered" },
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <Wrench /> Register equipment
          </Button>
        )}
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editing ? equipment!.name : "Register equipment"}</SheetTitle>
          <SheetDescription>
            Sprayers, mixing units, meters and vehicles, with where each one currently is.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={equipment?.name}
                  placeholder="Knapsack sprayer 3"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  name="type"
                  className={selectClass}
                  defaultValue={equipment?.type ?? "sprayer"}
                >
                  <option value="sprayer">Sprayer</option>
                  <option value="mixing_unit">Mixing unit</option>
                  <option value="vehicle">Vehicle</option>
                  <option value="meter">Meter</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="serialNumber">Serial number</Label>
                <Input
                  id="serialNumber"
                  name="serialNumber"
                  defaultValue={equipment?.serialNumber ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  className={selectClass}
                  defaultValue={equipment?.status ?? "available"}
                >
                  <option value="available">Available</option>
                  <option value="deployed">Deployed</option>
                  <option value="maintenance">In maintenance</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currentSiteId">Currently at</Label>
              <select
                id="currentSiteId"
                name="currentSiteId"
                className={selectClass}
                defaultValue={equipment?.siteId ?? ""}
              >
                <option value="">Shinyanga Warehouse</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.clientName} — {site.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Putting it on a site marks it deployed; bringing it back marks it available.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label={editing ? "Save changes" : "Register"} />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function MaintenanceDialog({
  equipmentId,
  equipmentName,
}: {
  equipmentId: string;
  equipmentName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Log a service">
          <Wrench />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a service</DialogTitle>
          <DialogDescription>
            Records the service against {equipmentName} and sets the next one due in 90 days.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const description = String(data.get("description") ?? "").trim();
            if (!description) {
              toast.error("Say what was done");
              return;
            }
            startTransition(async () => {
              const result = await logMaintenanceAction(
                equipmentId,
                description,
                Number(data.get("cost") ?? 0) || 0,
              );
              if (result.ok) {
                toast.success("Service logged");
                setOpen(false);
                router.refresh();
              } else {
                toast.error(result.error);
              }
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="description">What was done</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Replaced the nozzle and pressure seal"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cost">Cost (TZS)</Label>
            <Input id="cost" name="cost" type="number" min={0} step="any" defaultValue={0} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Log service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------- purchase orders ----------------------------- */

type POLine = { itemId: string; quantity: string; unitCost: string };

export function PurchaseOrderSheet({
  suppliers,
  items,
}: {
  suppliers: SupplierOption[];
  items: { id: string; name: string; unit: string; costPerUnit: number; supplierId: string | null }[];
}) {
  const { open, setOpen, formAction } = useFormSheet(createPurchaseOrderAction, {
    success: "Purchase order raised",
  });

  const [supplierId, setSupplierId] = React.useState("");
  const [lines, setLines] = React.useState<POLine[]>([{ itemId: "", quantity: "", unitCost: "" }]);

  // Ordering from a supplier is nearly always ordering what they supply.
  const offered = React.useMemo(
    () => (supplierId ? items.filter((item) => item.supplierId === supplierId) : items),
    [items, supplierId],
  );

  const setLine = (index: number, patch: Partial<POLine>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
    0,
  );

  const payload = JSON.stringify(
    lines
      .filter((line) => line.itemId && Number(line.quantity) > 0)
      .map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        unitCost: Math.round(Number(line.unitCost) || 0),
      })),
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Truck /> Raise purchase order
        </Button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>Raise a purchase order</SheetTitle>
          <SheetDescription>
            Goes out for approval first. Marking it received books the stock into the warehouse
            through the normal movement, so nothing has to be counted in twice.
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex flex-1 flex-col">
          <input type="hidden" name="lines" value={payload} />
          <div className="flex-1 space-y-5 p-5">
            <div className="space-y-2">
              <Label htmlFor="supplierId">Supplier</Label>
              <select
                id="supplierId"
                name="supplierId"
                className={selectClass}
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                required
              >
                <option value="">Choose a supplier…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setLines((current) => [...current, { itemId: "", quantity: "", unitCost: "" }])
                  }
                >
                  <Plus /> Add line
                </Button>
              </div>

              {lines.map((line, index) => {
                const item = items.find((candidate) => candidate.id === line.itemId);
                return (
                  <div key={index} className="space-y-2 rounded-md border p-3">
                    <select
                      className={selectClass}
                      value={line.itemId}
                      onChange={(event) => {
                        const chosen = items.find(
                          (candidate) => candidate.id === event.target.value,
                        );
                        setLine(index, {
                          itemId: event.target.value,
                          // Default to what we last paid; still editable.
                          unitCost: line.unitCost || String(chosen?.costPerUnit ?? ""),
                        });
                      }}
                    >
                      <option value="">Choose an item…</option>
                      {offered.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Quantity {item ? `(${item.unit})` : ""}</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={line.quantity}
                          onChange={(event) => setLine(index, { quantity: event.target.value })}
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Unit cost</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          value={line.unitCost}
                          onChange={(event) => setLine(index, { unitCost: event.target.value })}
                        />
                      </div>
                      {lines.length > 1 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label="Remove line"
                          onClick={() =>
                            setLines((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              <p className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Order total</span>
                <span className="font-data font-medium">{formatCurrency(total)}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" placeholder="Deliver to the Shinyanga store" />
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Submit label="Raise order" />
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
