"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { rescheduleJobAction } from "@/app/(internal)/jobs/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import type { JobStatus } from "@db/schema";

export type CalendarJob = {
  id: string;
  reference: string;
  scheduledAt: string;
  status: JobStatus;
  clientName: string;
  siteName: string;
  serviceTypeName: string;
  crewCount: number;
};

const STATUS_DOT: Record<JobStatus, string> = {
  scheduled: "bg-muted-foreground",
  en_route: "bg-brand-blue",
  in_progress: "bg-brand-blue",
  completed: "bg-brand-green",
  signed_off: "bg-brand-green",
  cancelled: "bg-destructive",
};

/**
 * Week grid with drag-to-reschedule. Dropping a job on another day keeps its
 * time of day and moves the date — the common correction when a crew slips.
 */
export function WeekCalendar({
  jobs,
  weekStartIso,
  canReschedule,
}: {
  jobs: CalendarJob[];
  weekStartIso: string;
  canReschedule: boolean;
}) {
  const router = useRouter();
  const weekStart = startOfWeek(new Date(weekStartIso), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overDay, setOverDay] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const move = (jobId: string, day: Date) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    const original = new Date(job.scheduledAt);
    if (isSameDay(original, day)) return;

    const next = new Date(day);
    next.setHours(original.getHours(), original.getMinutes(), 0, 0);

    startTransition(async () => {
      const result = await rescheduleJobAction(jobId, next.toISOString());
      if (result.ok) {
        toast.success(`${job.reference} moved to ${format(next, "EEE d MMM, HH:mm")}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const goto = (offsetWeeks: number) => {
    const target = addDays(weekStart, offsetWeeks * 7);
    router.push(`/schedule?week=${format(target, "yyyy-MM-dd")}`);
  };

  return (
    <div className={cn("space-y-3", pending && "opacity-70")}>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => goto(-1)} aria-label="Previous week">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon" onClick={() => goto(1)} aria-label="Next week">
          <ChevronRight />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => router.push("/schedule")}>
          This week
        </Button>
        <p className="ml-2 text-sm text-muted-foreground">
          {format(weekStart, "d MMM")} – {format(addDays(weekStart, 6), "d MMM yyyy")}
        </p>
        {canReschedule ? (
          <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
            Drag a job onto another day to reschedule it.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayJobs = jobs
            .filter((job) => isSameDay(new Date(job.scheduledAt), day))
            .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
          const today = isSameDay(day, new Date());

          return (
            <div
              key={key}
              onDragOver={(event) => {
                if (!canReschedule || !draggingId) return;
                event.preventDefault();
                setOverDay(key);
              }}
              onDragLeave={() => setOverDay((prev) => (prev === key ? null : prev))}
              onDrop={(event) => {
                event.preventDefault();
                setOverDay(null);
                if (canReschedule && draggingId) move(draggingId, day);
                setDraggingId(null);
              }}
              className={cn(
                "min-h-[140px] rounded-lg border bg-card p-2 transition-colors",
                today && "border-brand-green/40",
                overDay === key && "border-brand-blue bg-brand-blue/5",
              )}
            >
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className={cn("text-xs font-medium", today && "text-brand-green")}>
                  {format(day, "EEE d")}
                </span>
                {dayJobs.length > 0 ? (
                  <span className="font-data text-[11px] text-muted-foreground">
                    {dayJobs.length}
                  </span>
                ) : null}
              </div>

              {dayJobs.length === 0 ? (
                <p className="px-1 text-[11px] text-muted-foreground">No jobs</p>
              ) : (
                <ul className="space-y-1.5">
                  {dayJobs.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={`/jobs/${job.id}`}
                        draggable={canReschedule}
                        onDragStart={() => setDraggingId(job.id)}
                        onDragEnd={() => setDraggingId(null)}
                        className={cn(
                          "block rounded-md border bg-background p-2 text-xs transition-colors hover:bg-accent/50",
                          canReschedule && "cursor-grab active:cursor-grabbing",
                          draggingId === job.id && "opacity-50",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[job.status])}
                            aria-hidden
                          />
                          <span className="font-data">{formatTime(new Date(job.scheduledAt))}</span>
                          <span className="truncate font-medium">{job.serviceTypeName}</span>
                        </span>
                        <span className="mt-1 block truncate text-muted-foreground">
                          {job.clientName} — {job.siteName}
                        </span>
                        <span className="mt-1 flex items-center gap-1">
                          <Badge variant="muted" className="px-1 py-0 text-[10px]">
                            {job.reference}
                          </Badge>
                          {job.crewCount === 0 ? (
                            <Badge variant="warning" className="px-1 py-0 text-[10px]">
                              Unassigned
                            </Badge>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
