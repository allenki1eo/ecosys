import "server-only";

import { requireUser } from "@/lib/auth/guards";
import { scopeFor, type Scope } from "@/lib/data/scope";
import type { SessionUser } from "@/lib/auth/session";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Every server action starts here: resolve the user, build the tenant scope,
 * and check the permission before any repository call runs.
 */
export async function withScope(
  permission?: string,
): Promise<{ user: SessionUser; scope: Scope }> {
  const user = await requireUser();
  if (permission && !user.permissions.has(permission)) {
    throw new Error(`You do not have permission to do that (${permission}).`);
  }
  return { user, scope: scopeFor(user) };
}

/** Turns a thrown repository/permission error into a form-friendly result. */
export function actionError(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return { ok: false, error: message };
}
