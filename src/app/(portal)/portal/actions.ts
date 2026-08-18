"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import { createServiceRequest, reportIncident } from "@/lib/data/compliance";

const requestSchema = z.object({
  siteId: z.string().min(1, "Choose a site"),
  serviceTypeId: z.string().optional(),
  description: z.string().min(5, "Tell us what you need"),
  urgency: z.enum(["routine", "urgent", "emergency"]).default("routine"),
  preferredDate: z.string().optional(),
});

/** Ad-hoc service request raised by a client user from their own portal. */
export async function requestServiceAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("portal.request_service");
    const parsed = requestSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const id = await createServiceRequest(scope, {
      siteId: parsed.data.siteId,
      serviceTypeId: parsed.data.serviceTypeId || null,
      description: parsed.data.description,
      urgency: parsed.data.urgency,
      preferredDate: parsed.data.preferredDate ? new Date(parsed.data.preferredDate) : null,
    });

    revalidatePath("/portal/services");
    revalidatePath("/portal");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

const issueSchema = z.object({
  siteId: z.string().min(1, "Choose a site"),
  title: z.string().min(3, "Give the issue a short title"),
  description: z.string().min(5, "Describe the issue"),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

/** Client-raised issue. Always client-visible — they reported it. */
export async function raiseIssueAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("portal.request_service");
    const parsed = issueSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const id = await reportIncident(scope, { ...parsed.data, clientVisible: true });
    revalidatePath("/portal/incidents");
    revalidatePath("/portal");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}
