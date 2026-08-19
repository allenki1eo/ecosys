import { JobsTable } from "./jobs-table";
import { NewJobSheet } from "./new-job-sheet";
import { PageHeader } from "@/components/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { listSites } from "@/lib/data/clients";
import { listCrew, listJobs, listServiceTypes } from "@/lib/data/jobs";
import { scopeFor } from "@/lib/data/scope";

export const metadata = { title: "Jobs" };

export default async function JobsPage() {
  const user = await requireStaff();
  const scope = scopeFor(user);

  const [jobs, crew, sites, serviceTypes] = await Promise.all([
    listJobs(scope, { limit: 300 }),
    listCrew(),
    listSites(scope),
    listServiceTypes(),
  ]);

  const crewNames = Object.fromEntries(crew.map((member) => [member.id, member.name]));

  return (
    <>
      <PageHeader
        title="Jobs"
        description="The full job pipeline, from scheduled through to client sign-off."
        actions={
          user.permissions.has("jobs.create") ? (
            <NewJobSheet sites={sites} serviceTypes={serviceTypes} crew={crew} />
          ) : null
        }
      />

      <JobsTable
        crewNames={crewNames}
        jobs={jobs.map((job) => ({
          id: job.id,
          reference: job.reference,
          status: job.status,
          scheduledAt: job.scheduledAt.toISOString(),
          clientName: job.clientName,
          siteName: job.siteName,
          serviceTypeName: job.serviceTypeName,
          crew: job.assignedCrewJson ?? [],
        }))}
      />
    </>
  );
}
