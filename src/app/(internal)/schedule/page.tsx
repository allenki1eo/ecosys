import { addDays, endOfWeek, startOfWeek } from "date-fns";
import { CalendarDays } from "lucide-react";

import { WeekCalendar } from "./week-calendar";
import { NewJobSheet } from "@/app/(internal)/jobs/new-job-sheet";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff } from "@/lib/auth/guards";
import { listClients, listSites } from "@/lib/data/clients";
import { listCrew, listJobs, listServiceTypes } from "@/lib/data/jobs";
import { scopeFor } from "@/lib/data/scope";

export const metadata = { title: "Schedule" };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { week?: string; client?: string; crew?: string };
}) {
  const user = await requireStaff();
  const scope = scopeFor(user);

  const anchor = searchParams.week ? new Date(searchParams.week) : new Date();
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 });

  const [jobs, sites, serviceTypes, crew, clients] = await Promise.all([
    listJobs(scope, {
      from: weekStart,
      to: addDays(weekEnd, 1),
      clientId: searchParams.client,
      crewMemberId: searchParams.crew,
    }),
    listSites(scope),
    listServiceTypes(),
    listCrew(),
    listClients(scope),
  ]);

  const canCreate = user.permissions.has("jobs.create");
  const canReschedule = user.permissions.has("jobs.assign");

  return (
    <>
      <PageHeader
        title="Schedule"
        description="Every crew, every site, one week at a time."
        actions={
          canCreate ? (
            <NewJobSheet sites={sites} serviceTypes={serviceTypes} crew={crew} />
          ) : null
        }
      />

      {clients.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No clients yet"
          description="Add a client and at least one site before scheduling work."
        />
      ) : (
        <WeekCalendar
          weekStartIso={weekStart.toISOString()}
          canReschedule={canReschedule}
          jobs={jobs.map((job) => ({
            id: job.id,
            reference: job.reference,
            scheduledAt: job.scheduledAt.toISOString(),
            status: job.status,
            clientName: job.clientName,
            siteName: job.siteName,
            serviceTypeName: job.serviceTypeName,
            crewCount: (job.assignedCrewJson ?? []).length,
          }))}
        />
      )}
    </>
  );
}
