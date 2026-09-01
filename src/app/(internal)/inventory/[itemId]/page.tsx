import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, MapPin, Package, Warehouse } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataList } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth/guards";
import { getInventoryItem } from "@/lib/data/inventory";
import { scopeFor } from "@/lib/data/scope";
import { formatCurrency, formatNumber, formatRelative, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function InventoryItemPage({ params }: { params: { itemId: string } }) {
  const user = await requireStaff();
  if (!user.permissions.has("inventory.view")) notFound();

  const item = await getInventoryItem(scopeFor(user), params.itemId);
  if (!item) notFound();

  const canSeeCosts = user.permissions.has("costs.view");
  const low = item.quantityOnHand <= item.reorderThreshold;

  const atSites = item.locations.filter((location) => location.siteId !== null);
  const atWarehouse = item.locations.find((location) => location.siteId === null);
  const deployed = atSites.reduce((sum, location) => sum + location.quantity, 0);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/inventory">
          <ArrowLeft /> All stock
        </Link>
      </Button>

      <PageHeader
        title={item.name}
        description={`${item.sku} · ${titleCase(item.category)}${
          item.supplierName ? ` · supplied by ${item.supplierName}` : ""
        }`}
        actions={low ? <Badge variant="warning">Below reorder level</Badge> : null}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total on hand"
          value={`${formatNumber(item.quantityOnHand, 1)} ${item.unit}`}
          caption="Across every location"
          icon={Package}
          tone={low ? "warning" : "neutral"}
        />
        <StatCard
          label="At the warehouse"
          value={`${formatNumber(atWarehouse?.quantity ?? 0, 1)} ${item.unit}`}
          icon={Warehouse}
        />
        <StatCard
          label="Deployed at sites"
          value={`${formatNumber(deployed, 1)} ${item.unit}`}
          caption={`${atSites.length} location${atSites.length === 1 ? "" : "s"}`}
          icon={MapPin}
        />
        {canSeeCosts ? (
          <StatCard
            label="Value on hand"
            value={formatCurrency(item.quantityOnHand * item.costPerUnit)}
            caption={`${formatCurrency(item.costPerUnit)} per ${item.unit}`}
          />
        ) : (
          <StatCard
            label="Reorder level"
            value={`${formatNumber(item.reorderThreshold, 1)} ${item.unit}`}
          />
        )}
      </section>

      {/* The answer to "who is holding our chemicals". */}
      <Card>
        <CardHeader>
          <CardTitle>Where this stock is held</CardTitle>
          <p className="text-xs text-muted-foreground">
            Balances derived from the movement ledger, so they always reconcile with the total.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {item.locations.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              icon={MapPin}
              title="Not held anywhere yet"
              description="Record a purchase into the warehouse, then transfer stock out to a site."
            />
          ) : (
            <ul className="divide-y">
              {item.locations.map((location) => {
                const share =
                  item.quantityOnHand > 0
                    ? Math.round((location.quantity / item.quantityOnHand) * 100)
                    : 0;
                return (
                  <li
                    key={location.siteId ?? "warehouse"}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md",
                        location.siteId === null ? "bg-brand-blue/10" : "bg-brand-green/10",
                      )}
                    >
                      {location.siteId === null ? (
                        <Warehouse className="size-4 text-brand-blue" />
                      ) : (
                        <Building2 className="size-4 text-brand-green" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* `truncate` needs a block box — an inline link would
                          overflow into the quantity on a narrow screen. */}
                      {location.siteId ? (
                        <Link
                          href={`/clients/sites/${location.siteId}`}
                          className="block truncate font-medium hover:underline"
                        >
                          {location.siteName}
                        </Link>
                      ) : (
                        <span className="block truncate font-medium">{location.siteName}</span>
                      )}
                      <span className="block truncate text-xs text-muted-foreground">
                        {location.clientName ?? "Ecohygiene central store"}
                      </span>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="font-data font-medium">
                        {formatNumber(location.quantity, 1)} {item.unit}
                      </span>
                      <span className="block text-xs text-muted-foreground">{share}% of total</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Movement history</h2>
        {item.movements.length === 0 ? (
          <EmptyState title="No movements recorded" />
        ) : (
          <DataList
            rows={item.movements}
            rowKey={(movement) => movement.id}
            columns={[
              {
                key: "reason",
                header: "Reason",
                role: "primary",
                cell: (movement) => titleCase(movement.reason),
              },
              {
                key: "where",
                header: "Location",
                role: "secondary",
                className: "text-muted-foreground",
                cell: (movement) => movement.siteName ?? "Shinyanga Warehouse",
              },
              {
                key: "change",
                header: "Change",
                role: "trailing",
                cell: (movement) => (
                  <span
                    className={cn(
                      "font-data",
                      movement.quantityDelta < 0 ? "text-destructive" : "text-brand-green",
                    )}
                  >
                    {movement.quantityDelta > 0 ? "+" : ""}
                    {formatNumber(movement.quantityDelta, 1)} {item.unit}
                  </span>
                ),
              },
              {
                key: "job",
                header: "Job",
                className: "font-data text-muted-foreground",
                cell: (movement) => movement.jobReference ?? "—",
              },
              {
                key: "by",
                header: "By",
                className: "text-xs text-muted-foreground",
                cell: (movement) => movement.performedByName ?? "System",
              },
              {
                key: "when",
                header: "When",
                className: "whitespace-nowrap text-xs text-muted-foreground",
                cell: (movement) => formatRelative(movement.createdAt),
              },
            ]}
          />
        )}
      </section>
    </>
  );
}
