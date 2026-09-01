import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  clients,
  equipment,
  equipmentMaintenance,
  inventoryItems,
  inventoryMovements,
  jobs,
  purchaseOrderItems,
  purchaseOrders,
  sites,
  suppliers,
  users,
  type PurchaseOrderStatus,
} from "@db/schema";
import { newId, newReference } from "@/lib/ids";
import { recordAudit } from "@/lib/data/audit";
import { hasPermission, type Scope } from "@/lib/data/scope";

/**
 * Inventory is Ecohygiene-internal. Client-portal users must never reach any
 * function in this module — every entry point asserts that first.
 */
function assertInternal(scope: Scope) {
  if (scope.clientId) throw new Error("Inventory is not exposed to client portals");
}

export async function listInventory(scope: Scope) {
  assertInternal(scope);
  return db
    .select({
      id: inventoryItems.id,
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      category: inventoryItems.category,
      unit: inventoryItems.unit,
      quantityOnHand: inventoryItems.quantityOnHand,
      reorderThreshold: inventoryItems.reorderThreshold,
      costPerUnit: inventoryItems.costPerUnit,
      location: inventoryItems.location,
      supplierName: suppliers.name,
      supplierId: inventoryItems.supplierId,
      isActive: inventoryItems.isActive,
    })
    .from(inventoryItems)
    .leftJoin(suppliers, eq(inventoryItems.supplierId, suppliers.id))
    .where(eq(inventoryItems.isActive, true))
    .orderBy(asc(inventoryItems.name));
}

export async function lowStockItems(scope: Scope) {
  assertInternal(scope);
  return db
    .select({
      id: inventoryItems.id,
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      unit: inventoryItems.unit,
      quantityOnHand: inventoryItems.quantityOnHand,
      reorderThreshold: inventoryItems.reorderThreshold,
      supplierName: suppliers.name,
      leadTimeDays: suppliers.leadTimeDays,
    })
    .from(inventoryItems)
    .leftJoin(suppliers, eq(inventoryItems.supplierId, suppliers.id))
    .where(
      and(
        eq(inventoryItems.isActive, true),
        sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderThreshold}`,
      ),
    )
    .orderBy(asc(inventoryItems.quantityOnHand));
}

export async function listMovements(scope: Scope, itemId?: string, limit = 100) {
  assertInternal(scope);
  return db
    .select({
      id: inventoryMovements.id,
      itemId: inventoryMovements.itemId,
      itemName: inventoryItems.name,
      unit: inventoryItems.unit,
      quantityDelta: inventoryMovements.quantityDelta,
      reason: inventoryMovements.reason,
      notes: inventoryMovements.notes,
      createdAt: inventoryMovements.createdAt,
      performedByName: users.name,
      jobReference: jobs.reference,
      siteName: sites.name,
    })
    .from(inventoryMovements)
    .innerJoin(inventoryItems, eq(inventoryMovements.itemId, inventoryItems.id))
    .leftJoin(users, eq(inventoryMovements.performedBy, users.id))
    .leftJoin(jobs, eq(inventoryMovements.jobId, jobs.id))
    .leftJoin(sites, eq(inventoryMovements.siteId, sites.id))
    .where(itemId ? eq(inventoryMovements.itemId, itemId) : undefined)
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(limit);
}

export type MovementInput = {
  itemId: string;
  quantityDelta: number;
  reason: "purchase" | "job_usage" | "transfer" | "adjustment" | "wastage" | "return";
  /** The location this movement affects. NULL means the central warehouse. */
  siteId?: string | null;
  jobId?: string | null;
  notes?: string | null;
};

/**
 * The only supported way to change stock.
 *
 * `site_id` on a movement identifies *where* the stock moved, with NULL meaning
 * the central warehouse, so the balance held anywhere is the sum of that
 * location's deltas. `inventoryItems.quantityOnHand` is the company-wide total
 * across every location.
 *
 * A transfer is the one reason that writes two rows — out of the source and
 * into the destination — because moving a drum from the warehouse to a client's
 * mixing unit changes where the stock is without changing how much the company
 * holds. Writing one row would have made the totals drift every time stock was
 * deployed.
 */
export async function recordMovement(scope: Scope, input: MovementInput) {
  assertInternal(scope);
  if (!hasPermission(scope, "inventory.adjust")) {
    throw new Error("Missing permission: inventory.adjust");
  }

  const performedBy = scope.userId === "system" ? null : scope.userId;

  if (input.reason === "transfer") {
    const quantity = Math.abs(input.quantityDelta);
    if (quantity === 0) throw new Error("Enter a quantity to transfer");

    // A positive delta moves stock out to the site; a negative one brings it
    // back to the warehouse.
    const toSite = input.quantityDelta > 0;
    const source = toSite ? null : (input.siteId ?? null);
    const destination = toSite ? (input.siteId ?? null) : null;

    if (source === destination) {
      throw new Error("Choose a destination different from the source location");
    }

    const outId = newId("mov");
    await db.insert(inventoryMovements).values([
      {
        id: outId,
        itemId: input.itemId,
        siteId: source,
        quantityDelta: -quantity,
        reason: "transfer",
        notes: input.notes ?? null,
        performedBy,
      },
      {
        id: newId("mov"),
        itemId: input.itemId,
        siteId: destination,
        quantityDelta: quantity,
        reason: "transfer",
        notes: input.notes ?? null,
        performedBy,
      },
    ]);

    // The company still holds the same quantity, so the total is untouched.
    await recordAudit(scope, "inventory.transfer", "inventory_item", input.itemId, {
      quantity,
      from: source ?? "warehouse",
      to: destination ?? "warehouse",
    });
    return outId;
  }

  const id = newId("mov");
  await db.insert(inventoryMovements).values({
    id,
    itemId: input.itemId,
    jobId: input.jobId ?? null,
    siteId: input.siteId ?? null,
    quantityDelta: input.quantityDelta,
    reason: input.reason,
    notes: input.notes ?? null,
    performedBy,
  });

  await db
    .update(inventoryItems)
    .set({ quantityOnHand: sql`${inventoryItems.quantityOnHand} + ${input.quantityDelta}` })
    .where(eq(inventoryItems.id, input.itemId));

  await recordAudit(scope, "inventory.movement", "inventory_item", input.itemId, {
    quantityDelta: input.quantityDelta,
    reason: input.reason,
  });
  return id;
}

/* --------------------------- where stock is held -------------------------- */

export type StockLocation = {
  /** NULL for the central warehouse. */
  siteId: string | null;
  siteName: string;
  clientId: string | null;
  clientName: string | null;
  quantity: number;
};

/**
 * Balances per location, derived from the ledger rather than stored: a
 * second running total per site would be one more number to drift.
 *
 * Locations that have netted back to zero are dropped — a site that once held
 * a drum and used it all is not "holding 0 litres", it is simply not a place
 * this item is kept any more.
 */
export async function itemStockByLocation(scope: Scope, itemId: string): Promise<StockLocation[]> {
  assertInternal(scope);

  const rows = await db
    .select({
      siteId: inventoryMovements.siteId,
      siteName: sites.name,
      clientId: sites.clientId,
      clientName: clients.name,
      quantity: sql<number>`sum("inventory_movements"."quantity_delta")`,
    })
    .from(inventoryMovements)
    .leftJoin(sites, eq(inventoryMovements.siteId, sites.id))
    .leftJoin(clients, eq(sites.clientId, clients.id))
    .where(eq(inventoryMovements.itemId, itemId))
    .groupBy(inventoryMovements.siteId);

  return rows
    .map((row) => ({
      siteId: row.siteId,
      siteName: row.siteId ? (row.siteName ?? "Unknown site") : "Shinyanga Warehouse",
      clientId: row.clientId,
      clientName: row.siteId ? row.clientName : null,
      quantity: Number(row.quantity ?? 0),
    }))
    .filter((row) => Math.abs(row.quantity) > 0.0001)
    .sort((a, b) => b.quantity - a.quantity);
}

/** How many distinct locations hold each item, for the stock list. */
export async function locationCounts(scope: Scope): Promise<Record<string, number>> {
  assertInternal(scope);

  const rows = await db
    .select({
      itemId: inventoryMovements.itemId,
      siteId: inventoryMovements.siteId,
      quantity: sql<number>`sum("inventory_movements"."quantity_delta")`,
    })
    .from(inventoryMovements)
    .groupBy(inventoryMovements.itemId, inventoryMovements.siteId);

  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (Math.abs(Number(row.quantity ?? 0)) <= 0.0001) continue;
    counts[row.itemId] = (counts[row.itemId] ?? 0) + 1;
  }
  return counts;
}

export type LocationStock = {
  siteId: string | null;
  siteName: string;
  clientName: string | null;
  itemCount: number;
  totalValue: number;
};

/**
 * Every location and what it currently holds — the "which companies hold our
 * chemicals" view. Value is included only where the caller may see costs.
 */
export async function stockByLocation(scope: Scope): Promise<LocationStock[]> {
  assertInternal(scope);

  const rows = await db
    .select({
      siteId: inventoryMovements.siteId,
      siteName: sites.name,
      clientName: clients.name,
      itemId: inventoryMovements.itemId,
      costPerUnit: inventoryItems.costPerUnit,
      quantity: sql<number>`sum("inventory_movements"."quantity_delta")`,
    })
    .from(inventoryMovements)
    .innerJoin(inventoryItems, eq(inventoryMovements.itemId, inventoryItems.id))
    .leftJoin(sites, eq(inventoryMovements.siteId, sites.id))
    .leftJoin(clients, eq(sites.clientId, clients.id))
    .groupBy(inventoryMovements.siteId, inventoryMovements.itemId);

  const byLocation = new Map<string, LocationStock>();
  for (const row of rows) {
    const quantity = Number(row.quantity ?? 0);
    if (Math.abs(quantity) <= 0.0001) continue;

    const key = row.siteId ?? "__warehouse__";
    const existing = byLocation.get(key) ?? {
      siteId: row.siteId,
      siteName: row.siteId ? (row.siteName ?? "Unknown site") : "Shinyanga Warehouse",
      clientName: row.siteId ? row.clientName : null,
      itemCount: 0,
      totalValue: 0,
    };
    existing.itemCount += 1;
    existing.totalValue += quantity * row.costPerUnit;
    byLocation.set(key, existing);
  }

  return [...byLocation.values()].sort((a, b) => {
    // Warehouse first, then the busiest sites.
    if (a.siteId === null) return -1;
    if (b.siteId === null) return 1;
    return b.itemCount - a.itemCount;
  });
}

/** One item, with where it is held and how it got there. */
export async function getInventoryItem(scope: Scope, itemId: string) {
  assertInternal(scope);

  const [item] = await db
    .select({
      id: inventoryItems.id,
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      category: inventoryItems.category,
      unit: inventoryItems.unit,
      quantityOnHand: inventoryItems.quantityOnHand,
      reorderThreshold: inventoryItems.reorderThreshold,
      costPerUnit: inventoryItems.costPerUnit,
      location: inventoryItems.location,
      isActive: inventoryItems.isActive,
      supplierId: inventoryItems.supplierId,
      supplierName: suppliers.name,
      leadTimeDays: suppliers.leadTimeDays,
    })
    .from(inventoryItems)
    .leftJoin(suppliers, eq(inventoryItems.supplierId, suppliers.id))
    .where(eq(inventoryItems.id, itemId))
    .limit(1);

  if (!item) return undefined;

  const [locations, movements] = await Promise.all([
    itemStockByLocation(scope, itemId),
    listMovements(scope, itemId, 60),
  ]);

  return { ...item, locations, movements };
}

export async function createInventoryItem(
  scope: Scope,
  input: {
    sku: string;
    name: string;
    category: "chemical" | "consumable" | "ppe" | "spare_part";
    unit: string;
    quantityOnHand?: number;
    reorderThreshold?: number;
    costPerUnit?: number;
    supplierId?: string | null;
    location?: string;
  },
) {
  assertInternal(scope);
  const id = newId("itm");
  await db.insert(inventoryItems).values({ id, ...input });
  await recordAudit(scope, "inventory.item_create", "inventory_item", id, { sku: input.sku });
  return id;
}

/* -------------------------------- suppliers ------------------------------- */

export async function listSuppliers(scope: Scope) {
  assertInternal(scope);
  return db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      contact: suppliers.contact,
      email: suppliers.email,
      phone: suppliers.phone,
      leadTimeDays: suppliers.leadTimeDays,
      // Table-qualified literal SQL — see the note in data/clients.ts.
      itemCount: sql<number>`(select count(*) from "inventory_items" where "inventory_items"."supplier_id" = "suppliers"."id")`,
    })
    .from(suppliers)
    .orderBy(asc(suppliers.name));
}

/* ---------------------------- purchase orders ----------------------------- */

export async function listPurchaseOrders(scope: Scope) {
  assertInternal(scope);
  return db
    .select({
      id: purchaseOrders.id,
      reference: purchaseOrders.reference,
      status: purchaseOrders.status,
      totalAmount: purchaseOrders.totalAmount,
      expectedAt: purchaseOrders.expectedAt,
      createdAt: purchaseOrders.createdAt,
      supplierName: suppliers.name,
      requestedByName: users.name,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .leftJoin(users, eq(purchaseOrders.requestedBy, users.id))
    .orderBy(desc(purchaseOrders.createdAt));
}

export async function createPurchaseOrder(
  scope: Scope,
  supplierId: string,
  lines: { itemId: string; quantity: number; unitCost: number }[],
  notes?: string,
) {
  assertInternal(scope);
  if (!hasPermission(scope, "inventory.request_po")) {
    throw new Error("Missing permission: inventory.request_po");
  }

  const id = newId("po");
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  await db.insert(purchaseOrders).values({
    id,
    reference: newReference("PO"),
    supplierId,
    totalAmount: Math.round(total),
    notes: notes ?? null,
    requestedBy: scope.userId === "system" ? null : scope.userId,
  });
  for (const line of lines) {
    await db.insert(purchaseOrderItems).values({
      id: newId("poi"),
      purchaseOrderId: id,
      itemId: line.itemId,
      quantity: line.quantity,
      unitCost: line.unitCost,
    });
  }
  await recordAudit(scope, "purchase_order.create", "purchase_order", id, { supplierId, total });
  return id;
}

/**
 * Approve / reject / receive. Receiving a PO books the stock in through the
 * normal movement path so the ledger stays complete.
 */
export async function setPurchaseOrderStatus(
  scope: Scope,
  purchaseOrderId: string,
  status: PurchaseOrderStatus,
) {
  assertInternal(scope);
  if ((status === "approved" || status === "rejected") && !hasPermission(scope, "inventory.approve_po")) {
    throw new Error("Missing permission: inventory.approve_po");
  }

  await db
    .update(purchaseOrders)
    .set({
      status,
      approvedBy: status === "approved" ? scope.userId : undefined,
      approvedAt: status === "approved" ? new Date() : undefined,
    })
    .where(eq(purchaseOrders.id, purchaseOrderId));

  if (status === "received") {
    const lines = await db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrderId));
    for (const line of lines) {
      await recordMovement(scope, {
        itemId: line.itemId,
        quantityDelta: line.quantity,
        reason: "purchase",
        notes: `Received on ${purchaseOrderId}`,
      });
    }
  }

  await recordAudit(scope, `purchase_order.${status}`, "purchase_order", purchaseOrderId, {});
}

/* -------------------------------- equipment ------------------------------- */

export async function listEquipment(scope: Scope) {
  assertInternal(scope);
  return db
    .select({
      id: equipment.id,
      name: equipment.name,
      type: equipment.type,
      serialNumber: equipment.serialNumber,
      status: equipment.status,
      lastMaintenanceAt: equipment.lastMaintenanceAt,
      nextMaintenanceAt: equipment.nextMaintenanceAt,
      qrCode: equipment.qrCode,
      siteName: sites.name,
      siteId: equipment.currentSiteId,
    })
    .from(equipment)
    .leftJoin(sites, eq(equipment.currentSiteId, sites.id))
    .orderBy(asc(equipment.name));
}

export async function moveEquipment(scope: Scope, equipmentId: string, siteId: string | null) {
  assertInternal(scope);
  if (!hasPermission(scope, "inventory.manage_equipment")) {
    throw new Error("Missing permission: inventory.manage_equipment");
  }
  await db
    .update(equipment)
    .set({ currentSiteId: siteId, status: siteId ? "deployed" : "available" })
    .where(eq(equipment.id, equipmentId));
  await recordAudit(scope, "equipment.move", "equipment", equipmentId, { siteId });
}

export async function logMaintenance(
  scope: Scope,
  equipmentId: string,
  description: string,
  cost = 0,
  nextDueDays = 90,
) {
  assertInternal(scope);
  const now = new Date();
  await db.insert(equipmentMaintenance).values({
    id: newId("mnt"),
    equipmentId,
    performedAt: now,
    performedBy: scope.userId === "system" ? null : scope.userId,
    description,
    cost,
  });
  await db
    .update(equipment)
    .set({
      lastMaintenanceAt: now,
      nextMaintenanceAt: new Date(now.getTime() + nextDueDays * 24 * 60 * 60 * 1000),
    })
    .where(eq(equipment.id, equipmentId));
  await recordAudit(scope, "equipment.maintenance", "equipment", equipmentId, { description });
}

/** Total value of stock on hand, in TZS. Internal-only figure. */
export async function stockValue(scope: Scope) {
  assertInternal(scope);
  const [row] = await db
    .select({
      value: sql<number>`coalesce(sum(${inventoryItems.quantityOnHand} * ${inventoryItems.costPerUnit}), 0)`,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.isActive, true));
  return row?.value ?? 0;
}
