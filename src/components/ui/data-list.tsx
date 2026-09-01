import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * One dataset, two shapes.
 *
 * A dense table is the right tool on a desktop and the wrong one on a phone —
 * six columns in a 390px viewport either overflow horizontally or crush into
 * unreadable slivers. Rather than making the table scroll sideways (which hides
 * data behind a gesture nobody discovers), each row is re-laid-out as a stacked
 * card below `md`.
 *
 * Columns declare their own role so the card layout can be derived rather than
 * hand-written per page:
 *   - `primary`   the row's identity — card heading
 *   - `secondary` supporting identity — under the heading
 *   - `trailing`  status or amount — top-right of the card
 *   - default     a labelled fact in the card's detail grid
 *   - `desktopOnly` omitted from cards entirely
 */
export type DataColumn<T> = {
  /** Stable key, also used as the React key. */
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  role?: "primary" | "secondary" | "trailing";
  /** Drop this column from the mobile card — for low-value detail. */
  desktopOnly?: boolean;
  className?: string;
  headerClassName?: string;
};

export function DataList<T>({
  rows,
  columns,
  rowKey,
  href,
  empty,
  className,
}: {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  /** Makes the whole mobile card tappable, which a table row cannot be. */
  href?: (row: T) => string;
  empty?: React.ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const primary = columns.find((column) => column.role === "primary") ?? columns[0];
  const secondary = columns.find((column) => column.role === "secondary");
  const trailing = columns.find((column) => column.role === "trailing");
  const details = columns.filter(
    (column) => !column.role && !column.desktopOnly && column !== primary,
  );

  return (
    <>
      {/* Desktop: the dense table this tool is built around. */}
      <div className={cn("hidden rounded-lg border md:block", className)}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.headerClassName}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((column) => (
                  <TableCell key={column.key} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: one card per row. */}
      <ul className={cn("space-y-2 md:hidden", className)}>
        {rows.map((row) => {
          const card = (
            <div
              className={cn(
                "rounded-lg border bg-card p-3.5",
                href &&
                  "peer-active:bg-accent/40 peer-focus-visible:ring-1 peer-focus-visible:ring-ring",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{primary.cell(row)}</div>
                  {secondary ? (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {secondary.cell(row)}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {trailing ? trailing.cell(row) : null}
                  {href ? <ChevronRight className="size-4 text-muted-foreground" /> : null}
                </div>
              </div>

              {details.length > 0 ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3">
                  {details.map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {column.header}
                      </dt>
                      <dd className="truncate text-sm">{column.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          );

          return (
            // The row link covers the card rather than wrapping it. Cells often
            // link to the same record for the desktop table's benefit, and an
            // <a> inside an <a> is invalid HTML: the browser hoists the inner
            // one out, the DOM stops matching the server, and hydration fails.
            // As a sibling it cannot nest, and being positioned it still paints
            // over the whole card, so the tap target is unchanged.
            <li key={rowKey(row)} className={href ? "relative" : undefined}>
              {href ? (
                <Link
                  href={href(row)}
                  className="peer absolute inset-0 z-10 rounded-lg focus-visible:outline-none"
                >
                  <span className="sr-only">Open</span>
                </Link>
              ) : null}
              {card}
            </li>
          );
        })}
      </ul>
    </>
  );
}
