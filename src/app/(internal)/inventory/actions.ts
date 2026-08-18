"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import {
  createInventoryItem,
  logMaintenance,
  moveEquipment,
  recordMovement,
  setPurchaseOrderStatus,
} from "@/lib/data/inventory";
import { PURCHASE_ORDER_STATUSES } from "@db/schema";

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
  unit: z.string().min(1),
  quantityOnHand: z.coerce.number().min(0).default(0),
  reorderThreshold: z.coerce.number().min(0).default(0),
  costPerUnit: z.coerce.number().min(0).default(0),
  supplierId: z.string().optional(),
  location: z.string().optional(),
});

export async function createItemAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("inventory.adjust");
    const parsed = itemSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const id = await createInventoryItem(scope, {
      ...parsed.data,
      supplierId: parsed.data.supplierId || null,
      location: parsed.data.location || undefined,
    });
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
