"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpDown, Truck } from "lucide-react";

import { JobStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DataList } from "@/components/ui/data-list";
import { Input } from "@/components/ui/input";
import { formatSchedule } from "@/lib/format";
import { JOB_STATUS_LABELS } from "@/lib/labels";
import type { JobStatus } from "@db/schema";

export type JobRow = {
  id: string;
  reference: string;
  status: JobStatus;
  scheduledAt: string;
  clientName: string;
  siteName: string;
  serviceTypeName: string;
  crew: string[];
};

type SortKey = "scheduledAt" | "clientName" | "status";

function SortButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">
      {children} <ArrowUpDown className="size-3" />
    </button>
  );
}

/**
 * Dense, sortable, filterable table. Filtering happens in the browser because
 * the page already ships the current window of jobs — a round trip per
 * keystroke would be slower on a Shinyanga uplink.
 */
export function JobsTable({ jobs, crewNames }: { jobs: JobRow[]; crewNames: Record<string, string> }) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<JobStatus | "all">("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "scheduledAt",
    dir: "asc",
  });

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = jobs.filter((job) => {
      if (status !== "all" && job.status !== status) return false;
      if (!needle) return true;
      return [job.reference, job.clientName, job.siteName, job.serviceTypeName]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return filtered.sort((a, b) => {
      const factor = sort.dir === "asc" ? 1 : -1;
      return a[sort.key].localeCompare(b[sort.key]) * factor;
    });
  }, [jobs, query, status, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by reference, client, site or service…"
          className="max-w-xs"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as JobStatus | "all")}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All statuses</option>
          {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} of {jobs.length} jobs
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No jobs match those filters"
          description="Clear the search or pick a different status."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setStatus("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <DataList
          rows={rows}
          rowKey={(job) => job.id}
          href={(job) => `/jobs/${job.id}`}
          columns={[
            {
              key: "reference",
              header: "Reference",
              role: "primary",
              cell: (job) => (
                <Link href={`/jobs/${job.id}`} className="font-data hover:underline">
                  {job.reference}
                </Link>
              ),
            },
            {
              key: "client",
              header: (
                <SortButton onClick={() => toggleSort("clientName")}>Client / site</SortButton>
              ),
              role: "secondary",
              cell: (job) => (
                <>
                  <span className="block truncate">{job.clientName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {job.siteName}
                  </span>
                </>
              ),
            },
            {
              key: "status",
              header: <SortButton onClick={() => toggleSort("status")}>Status</SortButton>,
              role: "trailing",
              cell: (job) => <JobStatusBadge status={job.status} />,
            },
            {
              key: "scheduled",
              header: <SortButton onClick={() => toggleSort("scheduledAt")}>Scheduled</SortButton>,
              className: "whitespace-nowrap text-muted-foreground",
              cell: (job) => formatSchedule(new Date(job.scheduledAt)),
            },
            {
              key: "service",
              header: "Service",
              className: "text-muted-foreground",
              cell: (job) => job.serviceTypeName,
            },
            {
              key: "crew",
              header: "Crew",
              className: "text-xs text-muted-foreground",
              cell: (job) =>
                job.crew.length === 0
                  ? "Unassigned"
                  : job.crew.map((id) => crewNames[id] ?? "Unknown").join(", "),
            },
          ]}
        />
      )}
    </div>
  );
}
