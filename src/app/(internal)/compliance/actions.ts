"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import { issueCertificate } from "@/lib/data/compliance";
import { CERTIFICATE_TYPES } from "@db/schema";

const certificateSchema = z.object({
  siteId: z.string().min(1, "Choose the site this covers"),
  type: z.enum(CERTIFICATE_TYPES),
  validityDays: z.coerce.number().int().positive().max(3650).default(365),
  authority: z.string().max(120).optional(),
});

/**
 * Completing a job issues a certificate automatically. This covers the cases
 * that never went through a job here — work done before the system, or a
 * certificate reissued after an inspection.
 */
export async function issueCertificateAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("certificates.issue");
    const parsed = certificateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const id = await issueCertificate(scope, {
      ...parsed.data,
      authority: parsed.data.authority || null,
    });
    revalidatePath("/compliance");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}
