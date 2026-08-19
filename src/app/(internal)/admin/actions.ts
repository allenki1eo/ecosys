"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, withScope, type ActionResult } from "@/lib/actions";
import {
  inviteUser,
  setRolePermission,
  setUserActive,
  setUserPermissionOverride,
  setUserRole,
  updateNotificationPreferences,
} from "@/lib/data/users";
import { USER_ROLES } from "@db/schema";

const inviteSchema = z
  .object({
    name: z.string().min(2, "Enter a name"),
    email: z.string().email("Enter a valid email"),
    phone: z.string().optional(),
    role: z.enum(USER_ROLES),
    clientId: z.string().optional(),
    password: z.string().min(8, "Temporary password must be at least 8 characters"),
  })
  .refine((data) => !isClientRole(data.role) || Boolean(data.clientId), {
    message: "Choose the client this portal user belongs to",
    path: ["clientId"],
  });

function isClientRole(role: string) {
  return role === "client_admin" || role === "client_viewer";
}

export async function inviteUserAction(
  _prev: ActionResult<string> | undefined,
  formData: FormData,
): Promise<ActionResult<string>> {
  try {
    const { scope } = await withScope("users.manage");
    const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
    }

    const id = await inviteUser(scope, {
      ...parsed.data,
      clientId: isClientRole(parsed.data.role) ? parsed.data.clientId : null,
    });
    revalidatePath("/admin/users");
    return { ok: true, data: id };
  } catch (error) {
    return actionError(error);
  }
}

export async function setUserActiveAction(userId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { scope } = await withScope("users.manage");
    await setUserActive(scope, userId, isActive);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function setUserRoleAction(userId: string, role: string): Promise<ActionResult> {
  try {
    const parsed = z.enum(USER_ROLES).parse(role);
    const { scope } = await withScope("users.manage");
    await setUserRole(scope, userId, parsed);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function setRolePermissionAction(
  role: string,
  permission: string,
  enabled: boolean,
): Promise<ActionResult> {
  try {
    const parsed = z.enum(USER_ROLES).parse(role);
    const { scope } = await withScope("permissions.manage");
    await setRolePermission(scope, parsed, permission, enabled);
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function setUserPermissionOverrideAction(
  userId: string,
  permission: string,
  enabled: boolean | null,
): Promise<ActionResult> {
  try {
    const { scope } = await withScope("permissions.manage");
    await setUserPermissionOverride(scope, userId, permission, enabled);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function updatePreferencesAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { user, scope } = await withScope();
    await updateNotificationPreferences(scope, user.id, {
      notifyBySms: formData.get("notifyBySms") !== null,
      notifyByEmail: formData.get("notifyByEmail") !== null,
    });
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}
