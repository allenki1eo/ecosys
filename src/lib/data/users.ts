import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { clients, rolePermissions, users, type UserRole } from "@db/schema";
import { hashPassword } from "@/lib/auth/password";
import { newId } from "@/lib/ids";
import { recordAudit } from "@/lib/data/audit";
import { hasPermission, type Scope } from "@/lib/data/scope";

export async function listUsers(scope: Scope) {
  if (scope.clientId) throw new Error("User administration is internal only");
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      clientId: users.clientId,
      clientName: clients.name,
      permissionsJson: users.permissionsJson,
    })
    .from(users)
    .leftJoin(clients, eq(users.clientId, clients.id))
    .orderBy(asc(users.name));
}

export type InviteUserInput = {
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  clientId?: string | null;
  password: string;
};

export async function inviteUser(scope: Scope, input: InviteUserInput) {
  if (!hasPermission(scope, "users.manage")) throw new Error("Missing permission: users.manage");

  const isClientRole = input.role === "client_admin" || input.role === "client_viewer";
  if (isClientRole && !input.clientId) {
    throw new Error("Client-portal users must be attached to a client");
  }
  if (!isClientRole && input.clientId) {
    throw new Error("Ecohygiene staff cannot be attached to a client tenant");
  }

  const id = newId("usr");
  await db.insert(users).values({
    id,
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone ?? null,
    role: input.role,
    clientId: input.clientId ?? null,
    passwordHash: await hashPassword(input.password),
  });
  await recordAudit(scope, "user.invite", "user", id, { role: input.role, email: input.email });
  return id;
}

export async function setUserActive(scope: Scope, userId: string, isActive: boolean) {
  if (!hasPermission(scope, "users.manage")) throw new Error("Missing permission: users.manage");
  await db.update(users).set({ isActive }).where(eq(users.id, userId));
  await recordAudit(scope, isActive ? "user.activate" : "user.deactivate", "user", userId, {});
}

export async function setUserRole(scope: Scope, userId: string, role: UserRole) {
  if (!hasPermission(scope, "users.manage")) throw new Error("Missing permission: users.manage");
  await db.update(users).set({ role }).where(eq(users.id, userId));
  await recordAudit(scope, "user.role_change", "user", userId, { role });
}

/** Per-user permission overrides, layered on top of the role defaults. */
export async function setUserPermissionOverride(
  scope: Scope,
  userId: string,
  permission: string,
  enabled: boolean | null,
) {
  if (!hasPermission(scope, "permissions.manage")) {
    throw new Error("Missing permission: permissions.manage");
  }
  const [target] = await db
    .select({ permissionsJson: users.permissionsJson })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) throw new Error("User not found");

  const next = { ...(target.permissionsJson ?? {}) };
  if (enabled === null) delete next[permission];
  else next[permission] = enabled;

  await db.update(users).set({ permissionsJson: next }).where(eq(users.id, userId));
  await recordAudit(scope, "user.permission_override", "user", userId, { permission, enabled });
}

export async function listRolePermissions(scope: Scope) {
  if (scope.clientId) throw new Error("Permission administration is internal only");
  return db.select().from(rolePermissions);
}

/** Toggle a permission for a whole role (Settings → Permissions). */
export async function setRolePermission(
  scope: Scope,
  role: UserRole,
  permission: string,
  enabled: boolean,
) {
  if (!hasPermission(scope, "permissions.manage")) {
    throw new Error("Missing permission: permissions.manage");
  }

  await db
    .insert(rolePermissions)
    .values({
      id: newId("rp"),
      role,
      permission,
      enabled,
      updatedBy: scope.userId === "system" ? null : scope.userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [rolePermissions.role, rolePermissions.permission],
      set: { enabled, updatedBy: scope.userId, updatedAt: new Date() },
    });

  await recordAudit(scope, "permissions.update", "role", role, { permission, enabled });
}

export async function updateNotificationPreferences(
  scope: Scope,
  userId: string,
  prefs: { notifyBySms?: boolean; notifyByEmail?: boolean; themePreference?: "dark" | "light" | "system" },
) {
  if (scope.userId !== userId && !hasPermission(scope, "users.manage")) {
    throw new Error("Cannot change another user's preferences");
  }
  await db.update(users).set(prefs).where(eq(users.id, userId));
}
