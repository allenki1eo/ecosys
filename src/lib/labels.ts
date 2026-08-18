import type { JobStatus } from "@db/schema";

/**
 * Display labels shared by server and client components. Kept out of the
 * repository modules so client bundles never pull in `server-only` code.
 */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  en_route: "En route",
  in_progress: "In progress",
  completed: "Completed",
  signed_off: "Client signed-off",
  cancelled: "Cancelled",
};

export const URGENCY_LABELS = {
  routine: "Routine",
  urgent: "Urgent",
  emergency: "Emergency",
} as const;
