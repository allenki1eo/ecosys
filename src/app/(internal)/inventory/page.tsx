import { Package, PackageX, Truck, Wrench } from "lucide-react";

import { PurchaseOrderActions } from "./po-actions";
import { StockAdjustSheet } from "./stock-adjust-sheet";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CategoryBarChart } from "@/components/charts";
import { PurchaseOrderStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { listSites } from "@/lib/data/clients";
import {
  listEquipment,
  listInventory,
  listMovements,
  listPurchaseOrders,
  listSuppliers,
  lowStockItems,
  stockValue,
} from "@/lib/data/inventory";
import { scopeFor } from "@/lib/data/scope";
import { formatCompactCurrency, formatDate, formatNumber, formatRelative, titleCase } from "@/lib/format";

export const metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const user = await requireStaff();
  const scope = scopeFor(user);

  const [items, lowStock, movements, suppliers, purchaseOrders, equipment, sites, value] =
    await Promise.all([
      listInventory(scope),
      lowStockItems(scope),
      listMovements(scope, undefined, 60),
      listSuppliers(scope),
      listPurchaseOrders(scope),
      listEquipment(scope),
      listSites(scope),
      user.permissions.has("costs.view") ? stockValue(scope) : Promise.resolve(0),
    ]);

  const canAdjust = user.permissions.has("inventory.adjust");
  const canApprove = user.permissions.has("inventory.approve_po");
  const deployed = equipment.filter((piece) => piece.status === "deployed").length;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Chemical stock, mixing-unit allocations, suppliers and equipment."
        actions={canAdjust ? <StockAdjustSheet items={items} sites={sites} /> : null}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="SKUs tracked" value={items.length} caption="Active items" icon={Package} />
        <StatCard
          label="Below reorder level"
          value={lowStock.length}
          caption={lowStock.length ? "Raise a purchase order" : "All healthy"}
          icon={PackageX}
          tone={lowStock.length ? "warning" : "positive"}
        />
        {user.permissions.has("costs.view") ? (
          <StatCard
            label="Stock value"
            value={formatCompactCurrency(value)}
            caption="At current unit cost"
          />
        ) : null}
        <StatCard
          label="Equipment deployed"
          value={`${deployed}/${equipment.length}`}
          caption="On client sites"
          icon={Wrench}
        />
      </section>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="orders">Purchase orders</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          {lowStock.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Lowest stock lines</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Quantity on hand, in each item&apos;s own unit
                </p>
              </CardHeader>
              <CardContent>
                <CategoryBarChart
                  data={lowStock.slice(0, 6).map((item) => ({
                    name: item.name,
                    value: item.quantityOnHand,
                  }))}
                />
              </CardContent>
            </Card>
          ) : null}

          {items.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No stock items"
              description="Add chemicals and consumables so job usage can be deducted automatically."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>On hand</TableHead>
                    <TableHead>Reorder at</TableHead>
                    {user.permissions.has("costs.view") ? <TableHead>Unit cost</TableHead> : null}
                    <TableHead>Supplier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const low = item.quantityOnHand <= item.reorderThreshold;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-data">{item.sku}</TableCell>
                        <TableCell>
                          {item.name}
                          <span className="block text-xs text-muted-foreground">{item.location}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {titleCase(item.category)}
                        </TableCell>
                        <TableCell>
                          <span className="font-data">
                            {formatNumber(item.quantityOnHand, 1)} {item.unit}
                          </span>
                          {low ? (
                            <Badge variant="warning" className="ml-2">
                              Low
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-data text-muted-foreground">
                          {formatNumber(item.reorderThreshold, 1)}
                        </TableCell>
                        {user.permissions.has("costs.view") ? (
                          <TableCell className="font-data text-muted-foreground">
                            {formatCompactCurrency(item.costPerUnit)}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-muted-foreground">
                          {item.supplierName ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="movements">
          {movements.length === 0 ? (
            <EmptyState
              title="No movements recorded"
              description="Stock changes — including automatic job deductions — appear here."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Job / site</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatRelative(movement.createdAt)}
                      </TableCell>
                      <TableCell>{movement.itemName}</TableCell>
                      <TableCell
                        className={
                          movement.quantityDelta < 0
                            ? "font-data text-destructive"
                            : "font-data text-brand-green"
                        }
                      >
                        {movement.quantityDelta > 0 ? "+" : ""}
                        {formatNumber(movement.quantityDelta, 1)} {movement.unit}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {titleCase(movement.reason)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {movement.jobReference ?? movement.siteName ?? "Warehouse"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {movement.performedByName ?? "System"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders">
          {purchaseOrders.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No purchase orders"
              description="Reorder requests raised against low stock appear here for approval."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-data">{order.reference}</TableCell>
                      <TableCell>{order.supplierName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {order.requestedByName ?? "—"}
                      </TableCell>
                      <TableCell className="font-data">
                        {formatCompactCurrency(order.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <PurchaseOrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <PurchaseOrderActions
                          purchaseOrderId={order.id}
                          status={order.status}
                          canApprove={canApprove}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="suppliers">
          {suppliers.length === 0 ? (
            <EmptyState title="No suppliers" description="Add suppliers to track lead times and pricing." />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Lead time</TableHead>
                    <TableHead>Items supplied</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell>{supplier.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {supplier.contact ?? "—"}
                        {supplier.phone ? (
                          <span className="block text-xs">{supplier.phone}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-data">{supplier.leadTimeDays} days</TableCell>
                      <TableCell className="font-data">{supplier.itemCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="equipment">
          {equipment.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No equipment tracked"
              description="Register sprayers and mixing units to track location and maintenance."
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last service</TableHead>
                    <TableHead>Next due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipment.map((piece) => (
                    <TableRow key={piece.id}>
                      <TableCell>
                        {piece.name}
                        {piece.serialNumber ? (
                          <span className="block font-data text-xs text-muted-foreground">
                            {piece.serialNumber}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{titleCase(piece.type)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {piece.siteName ?? "Shinyanga Warehouse"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={piece.status === "maintenance" ? "warning" : "muted"}>
                          {titleCase(piece.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(piece.lastMaintenanceAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(piece.nextMaintenanceAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
