"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import { createServiceType, updateServiceType } from "@/lib/data/services";
import { CERTIFICATE_TYPES } from "@db/schema";

const serviceSchema = z.object({
  name: z.string().min(2, "Give the service a name"),
  slug: z
    .string()
    .min(2, "Add a short key")
    .regex(/^[a-z0-9-]+$/, "Key must be lowercase letters, numbers and hyphens"),
  description: z.string().max(500).optional(),
  defaultFrequency: z.string().max(60).optional(),
  defaultDurationMinutes: z.coerce.number().int().min(15, "At least 15 minutes").max(1440),
  defaultRate: z.coerce.number().int().min(0, "Rate cannot be negative"),
  issuesCertificate: z.coerce.boolean().default(false),
  certificateType: z.enum(CERTIFICATE_TYPES).optional(),
  certificateValidityDays: z.coerce.number().int().min(1).max(3650).optional(),
  // The form posts one line per checklist step.
  checklist: z.string().optional(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData);
  return serviceSchema.safeParse({
    ...raw,
    issuesCertificate: formData.get("issuesCertificate") !== null,
    certificateType: raw.certificateType || undefined,
    certificateValidityDays: raw.certificateValidityDays || undefined,
  });
}

function toInput(data: z.infer<typeof serviceSchema>) {
  return {
    ...data,
    description: data.description || null,
    defaultFrequency: data.defaultFrequency || null,
    certificateType: data.certificateType ?? null,
    certificateValidityDays: data.certificateValidityDays ?? null,
    checklist: (data.checklist ?? "").split("\n"),
  };
}

export async function createServiceTypeAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("settings.manage");
    const parsed = parse(formData);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const id = await createServiceType(scope, toInput(parsed.data));
    revalidatePath("/admin/services");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateServiceTypeAction(
  serviceTypeId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("settings.manage");
    const parsed = parse(formData);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    await updateServiceType(scope, serviceTypeId, toInput(parsed.data));
    revalidatePath("/admin/services");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
