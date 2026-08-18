import "server-only";

import { eq, type SQL, type SQLWrapper } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import { TenantIsolationError } from "@/lib/auth/guards";
import type { SessionUser } from "@/lib/auth/session";
import type { UserRole } from "@db/schema";

/**
 * The tenant boundary, passed explicitly into every repository call.
 *
 * `clientId` is non-null only for external client-portal users. Repositories
 * must call `tenantFilter()` on any query that can reach client data, so
 * isolation is enforced in SQL rather than by hiding UI.
 */
export type Scope = {
  userId: string;
  role: UserRole;
  clientId: string | null;
  permissions: Set<string>;
};

export function scopeFor(user: SessionUser): Scope {
  return {
    userId: user.id,
    role: user.role,
    clientId: user.clientId,
    permissions: user.permissions,
  };
}

/** Internal scope for background work (cron, seeding) — bypasses tenant limits. */
export const SYSTEM_SCOPE: Scope = {
  userId: "system",
  role: "super_admin",
  clientId: null,
  permissions: new Set(["*"]),
};

/**
 * Returns the `client_id = ?` predicate for client-portal users, or `undefined`
 * for Ecohygiene staff (who legitimately see across tenants).
 *
 * Always spread the result into the query's `and(...)` — `and()` ignores
 * undefined, so staff queries stay unfiltered while portal queries cannot be
 * written without the predicate.
 */
export function tenantFilter(column: SQLiteColumn, scope: Scope): SQL | undefined {
  if (!scope.clientId) return undefined;
  return eq(column, scope.clientId);
}

/**
 * Guard for single-record reads: a portal user must never receive a row
 * belonging to another client, even via a direct id lookup.
 */
export function assertTenant<T extends { clientId: string }>(
  scope: Scope,
  record: T | undefined,
  entity: string,
): T | undefined {
  if (!record) return undefined;
  if (scope.clientId && record.clientId !== scope.clientId) {
    throw new TenantIsolationError(entity);
  }
  return record;
}

/** Portal users never see Ecohygiene's cost/margin data. */
export function canSeeCosts(scope: Scope): boolean {
  return !scope.clientId && (scope.permissions.has("costs.view") || scope.permissions.has("*"));
}

export function hasPermission(scope: Scope, permission: string): boolean {
  return scope.permissions.has("*") || scope.permissions.has(permission);
}

export type { SQLWrapper };
