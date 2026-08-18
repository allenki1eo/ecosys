"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import {
  addJobPhoto,
  advanceJobStatus,
  createJob,
  reassignCrew,
  rescheduleJob,
  signOffJob,
  updateChecklist,
} from "@/lib/data/jobs";
import { JOB_STATUSES } from "@db/schema";

const createJobSchema = z.object({
  siteId: z.string().min(1, "Choose a site"),
  serviceTypeId: z.string().min(1, "Choose a service type"),
  scheduledAt: z.string().min(1, "Choose a date and time"),
  durationMinutes: z.coerce.number().int().positive().optional(),
  assignedCrew: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
});

export async function createJobAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("jobs.create");
    const parsed = createJobSchema.safeParse({
      siteId: formData.get("siteId"),
      serviceTypeId: formData.get("serviceTypeId"),
      scheduledAt: formData.get("scheduledAt"),
      durationMinutes: formData.get("durationMinutes") || undefined,
      assignedCrew: formData.getAll("assignedCrew").map(String).filter(Boolean),
      notes: (formData.get("notes") as string) || undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const id = await createJob(scope, {
      siteId: parsed.data.siteId,
      serviceTypeId: parsed.data.serviceTypeId,
      scheduledAt: new Date(parsed.data.scheduledAt),
      durationMinutes: parsed.data.durationMinutes,
      assignedCrew: parsed.data.assignedCrew,
      notes: parsed.data.notes,
    });

    revalidatePath("/schedule");
    revalidatePath("/jobs");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

export async function rescheduleJobAction(jobId: string, iso: string): Promise<ActionResult> {
  try {
    const { scope } = await withScope("jobs.assign");
    await rescheduleJob(scope, jobId, new Date(iso));
    revalidatePath("/schedule");
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function reassignCrewAction(jobId: string, crew: string[]): Promise<ActionResult> {
  try {
    const { scope } = await withScope("jobs.assign");
    await reassignCrew(scope, jobId, crew);
    revalidatePath("/schedule");
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function advanceStatusAction(
  jobId: string,
  next: string,
  payload?: { reportSummary?: string; consumption?: { itemId: string; quantity: number }[] },
): Promise<ActionResult> {
  try {
    const status = z.enum(JOB_STATUSES).parse(next);
    const { scope } = await withScope("jobs.execute");
    await advanceJobStatus(scope, jobId, status, payload ?? {});
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/schedule");
    revalidatePath("/jobs");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateChecklistAction(
  jobId: string,
  checklist: { id: string; label: string; done?: boolean; note?: string }[],
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("jobs.execute");
    await updateChecklist(scope, jobId, checklist);
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function signOffJobAction(
  jobId: string,
  signedOffBy: string,
  signatureUrl?: string,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("jobs.sign_off");
    await signOffJob(scope, jobId, signedOffBy, signatureUrl);
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function addJobPhotoAction(
  jobId: string,
  url: string,
  caption?: string,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("jobs.execute");
    await addJobPhoto(scope, jobId, url, caption);
    revalidatePath(`/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
