"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import { reportIncident, updateIncidentStatus } from "@/lib/data/compliance";
import { INCIDENT_STATUSES } from "@db/schema";

const incidentSchema = z.object({
  siteId: z.string().min(1, "Choose a site"),
  title: z.string().min(3, "Give the issue a short title"),
  description: z.string().min(5, "Describe what was found"),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  photoUrl: z.string().url().optional().or(z.literal("")),
  clientVisible: z.coerce.boolean().default(true),
});

export async function reportIncidentAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("incidents.create");
    const parsed = incidentSchema.safeParse({
      ...Object.fromEntries(formData),
      clientVisible: formData.get("clientVisible") !== null,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const id = await reportIncident(scope, {
      ...parsed.data,
      photoUrl: parsed.data.photoUrl || null,
    });
    revalidatePath("/incidents");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateIncidentStatusAction(
  incidentId: string,
  status: string,
  resolutionNotes?: string,
): Promise<ActionResult> {
  try {
    const parsed = z.enum(INCIDENT_STATUSES).parse(status);
    const { scope } = await withScope("incidents.resolve");
    await updateIncidentStatus(scope, incidentId, parsed, resolutionNotes);
    revalidatePath("/incidents");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
