"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import {
  createEquipment,
  createInventoryItem,
  createPurchaseOrder,
  createSupplier,
  deleteSupplier,
  logMaintenance,
  moveEquipment,
  recordMovement,
  setInventoryItemActive,
  setPurchaseOrderStatus,
  updateEquipment,
  updateInventoryItem,
  updateSupplier,
} from "@/lib/data/inventory";
import { EQUIPMENT_STATUSES, PURCHASE_ORDER_STATUSES } from "@db/schema";

const movementSchema = z.object({
  itemId: z.string().min(1),
  quantityDelta: z.coerce.number().refine((value) => value !== 0, "Enter a non-zero quantity"),
  reason: z.enum(["purchase", "job_usage", "transfer", "adjustment", "wastage", "return"]),
  siteId: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export async function recordMovementAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("inventory.adjust");
    const parsed = movementSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    await recordMovement(scope, {
      ...parsed.data,
      siteId: parsed.data.siteId || null,
    });
    revalidatePath("/inventory");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

const itemSchema = z.object({
  sku: z.string().min(2, "Enter a SKU"),
  name: z.string().min(2, "Enter a name"),
  category: z.enum(["chemical", "consumable", "ppe", "spare_part"]),
  unit: z.string().min(1, "Enter a unit, such as L or kg"),
  reorderThreshold: z.coerce.number().min(0).default(0),
  costPerUnit: z.coerce.number().int().min(0).default(0),
  supplierId: z.string().optional(),
  location: z.string().optional(),
});

const newItemSchema = itemSchema.extend({
  openingQuantity: z.coerce.number().min(0).default(0),
  openingSiteId: z.string().optional(),
});

export async function createItemAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("inventory.adjust");
    const parsed = newItemSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const id = await createInventoryItem(scope, {
      ...parsed.data,
      supplierId: parsed.data.supplierId || null,
      location: parsed.data.location || undefined,
      openingSiteId: parsed.data.openingSiteId || null,
    });
    revalidatePath("/inventory");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateItemAction(
  itemId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("inventory.adjust");
    const parsed = itemSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    await updateInventoryItem(scope, itemId, {
      ...parsed.data,
      supplierId: parsed.data.supplierId || null,
      location: parsed.data.location || undefined,
    });
    revalidatePath("/inventory");
    revalidatePath(`/inventory/${itemId}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function setItemActiveAction(
  itemId: string,
  isActive: boolean,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("inventory.adjust");
    await setInventoryItemActive(scope, itemId, isActive);
    revalidatePath("/inventory");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

/* -------------------------------- suppliers ------------------------------- */

const supplierSchema = z.object({
  name: z.string().min(2, "Enter the supplier's name"),
  contact: z.string().optional(),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).default(7),
  notes: z.string().max(1000).optional(),
});

function toSupplierInput(data: z.infer<typeof supplierSchema>) {
  return {
    ...data,
    contact: data.contact || null,
    email: data.email || null,
    phone: data.phone || null,
    notes: data.notes || null,
  };
}

export async function createSupplierAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("inventory.adjust");
    const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }
    const id = await createSupplier(scope, toSupplierInput(parsed.data));
    revalidatePath("/inventory");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateSupplierAction(
  supplierId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("inventory.adjust");
    const parsed = supplierSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }
    await updateSupplier(scope, supplierId, toSupplierInput(parsed.data));
    revalidatePath("/inventory");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteSupplierAction(supplierId: string): Promise<ActionResult> {
  try {
    const { scope } = await withScope("inventory.adjust");
    await deleteSupplier(scope, supplierId);
    revalidatePath("/inventory");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

/* -------------------------------- equipment ------------------------------- */

const equipmentSchema = z.object({
  name: z.string().min(2, "Enter a name"),
  type: z.enum(["sprayer", "mixing_unit", "vehicle", "meter", "other"]),
  serialNumber: z.string().optional(),
  currentSiteId: z.string().optional(),
  status: z.enum(EQUIPMENT_STATUSES).default("available"),
  notes: z.string().max(1000).optional(),
});

function toEquipmentInput(data: z.infer<typeof equipmentSchema>) {
  const currentSiteId = data.currentSiteId || null;
  return {
    ...data,
    serialNumber: data.serialNumber || null,
    notes: data.notes || null,
    currentSiteId,
    // "Deployed" and "at a site" are the same fact; keep them from disagreeing.
    status:
      currentSiteId && data.status === "available"
        ? ("deployed" as const)
        : !currentSiteId && data.status === "deployed"
          ? ("available" as const)
          : data.status,
  };
}

export async function createEquipmentAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("inventory.manage_equipment");
    const parsed = equipmentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }
    const id = await createEquipment(scope, toEquipmentInput(parsed.data));
    revalidatePath("/inventory");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateEquipmentAction(
  equipmentId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("inventory.manage_equipment");
    const parsed = equipmentSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }
    await updateEquipment(scope, equipmentId, toEquipmentInput(parsed.data));
    revalidatePath("/inventory");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

/* ---------------------------- purchase orders ----------------------------- */

const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  notes: z.string().max(1000).optional(),
  /** Lines arrive as a JSON array — a variable-length form is awkward otherwise. */
  lines: z.string().min(2, "Add at least one line"),
});

const lineSchema = z.array(
  z.object({
    itemId: z.string().min(1),
    quantity: z.coerce.number().positive(),
    unitCost: z.coerce.number().int().min(0),
  }),
);

export async function createPurchaseOrderAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("inventory.request_po");
    const parsed = purchaseOrderSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const lines = lineSchema.safeParse(JSON.parse(parsed.data.lines));
    if (!lines.success || lines.data.length === 0) {
      return { ok: false, error: "Add at least one item with a quantity" };
    }

    const id = await createPurchaseOrder(
      scope,
      parsed.data.supplierId,
      lines.data,
      parsed.data.notes || undefined,
    );
    revalidatePath("/inventory");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

export async function setPurchaseOrderStatusAction(
  purchaseOrderId: string,
  status: string,
): Promise<ActionResult> {
  try {
    const parsed = z.enum(PURCHASE_ORDER_STATUSES).parse(status);
    const { scope } = await withScope();
    await setPurchaseOrderStatus(scope, purchaseOrderId, parsed);
    revalidatePath("/inventory");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function moveEquipmentAction(
  equipmentId: string,
  siteId: string | null,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("inventory.manage_equipment");
    await moveEquipment(scope, equipmentId, siteId);
    revalidatePath("/inventory");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function logMaintenanceAction(
  equipmentId: string,
  description: string,
  cost = 0,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("inventory.manage_equipment");
    await logMaintenance(scope, equipmentId, description, cost);
    revalidatePath("/inventory");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
