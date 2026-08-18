"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import { createClient, createSite, updateClient } from "@/lib/data/clients";
import { CLIENT_STATUSES } from "@db/schema";

const slug = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only");

const clientSchema = z.object({
  name: z.string().min(2, "Enter the company name"),
  slug,
  industry: z.string().optional(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
  billingContact: z.string().optional(),
  billingEmail: z.string().email().optional().or(z.literal("")),
  billingPhone: z.string().optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(180).default(30),
  status: z.enum(CLIENT_STATUSES).default("active"),
  specNotes: z.string().max(2000).optional(),
});

export async function createClientAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("clients.manage");
    const parsed = clientSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const { contractStart, contractEnd, billingEmail, ...rest } = parsed.data;
    const id = await createClient(scope, {
      ...rest,
      billingEmail: billingEmail || null,
      contractStart: contractStart ? new Date(contractStart) : null,
      contractEnd: contractEnd ? new Date(contractEnd) : null,
    });

    revalidatePath("/clients");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateClientAction(
  clientId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("clients.manage");
    const parsed = clientSchema.partial().safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const { contractStart, contractEnd, ...rest } = parsed.data;
    await updateClient(scope, clientId, {
      ...rest,
      contractStart: contractStart ? new Date(contractStart) : undefined,
      contractEnd: contractEnd ? new Date(contractEnd) : undefined,
    });

    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/clients");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

const siteSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(2, "Enter the site name"),
  address: z.string().optional(),
  region: z.string().optional(),
  gpsLat: z.coerce.number().optional(),
  gpsLng: z.coerce.number().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export async function createSiteAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("clients.manage");
    const raw = Object.fromEntries(formData);
    const parsed = siteSchema.safeParse({
      ...raw,
      gpsLat: raw.gpsLat || undefined,
      gpsLng: raw.gpsLng || undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const id = await createSite(scope, parsed.data);
    revalidatePath(`/clients/${parsed.data.clientId}`);
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}
