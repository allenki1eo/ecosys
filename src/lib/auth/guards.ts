import "server-only";

import { redirect } from "next/navigation";

import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

/** Thrown when a signed-in user attempts something their role does not allow. */
export class ForbiddenError extends Error {
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export class TenantIsolationError extends Error {
  constructor(entity: string) {
    super(`Cross-tenant access denied for ${entity}`);
    this.name = "TenantIsolationError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Ecohygiene staff only — external client users are sent to their portal. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.isClientUser) redirect("/portal");
  return user;
}

/** External client-portal users only. */
export async function requireClientUser(): Promise<SessionUser & { clientId: string }> {
  const user = await requireUser();
  if (!user.isClientUser || !user.clientId) redirect("/dashboard");
  return user as SessionUser & { clientId: string };
}

export function can(user: SessionUser, permission: string): boolean {
  return user.permissions.has(permission);
}

/** Server-action guard: throws rather than redirecting so callers can catch. */
export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) throw new ForbiddenError(permission);
  return user;
}
