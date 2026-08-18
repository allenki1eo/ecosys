import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { auditLog, users } from "@db/schema";
import { newId } from "@/lib/ids";
import type { Scope } from "@/lib/data/scope";

/** Every mutating repository call funnels through here. */
export async function recordAudit(
  scope: Scope,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({
    id: newId("aud"),
    userId: scope.userId === "system" ? null : scope.userId,
    action,
    entityType,
    entityId,
    metadataJson: metadata ?? null,
  });
}

export async function listAuditLog(limit = 100) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      metadataJson: auditLog.metadataJson,
      createdAt: auditLog.createdAt,
      userName: users.name,
      userRole: users.role,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
