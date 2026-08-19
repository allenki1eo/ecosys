import "server-only";

import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { rolePermissions, sessions, users, type User, type UserRole } from "@db/schema";
import { resolvePermissions } from "@/lib/auth/permissions";

export const SESSION_COOKIE = "ecohygiene_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SESSION_REFRESH_MS = 1000 * 60 * 60 * 24 * 15; // slide when half-spent

export type SessionUser = Omit<User, "passwordHash"> & {
  /** Effective permission set: role defaults + role switches + user overrides. */
  permissions: Set<string>;
  isClientUser: boolean;
};

export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  const id = randomBytes(24).toString("base64url");
  await db.insert(sessions).values({
    id,
    userId,
    userAgent: userAgent ?? null,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  cookies().set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + SESSION_TTL_MS),
  });
  return id;
}

export async function destroySession(): Promise<void> {
  const id = cookies().get(SESSION_COOKIE)?.value;
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
  cookies().delete(SESSION_COOKIE);
}

/**
 * Resolves the current user from the session cookie. Cached per request so the
 * dozen server components that need it share one round trip.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return null;

  if (row.session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  if (!row.user.isActive) return null;

  // Sliding expiry — keep long-lived field devices signed in.
  if (row.session.expiresAt.getTime() - Date.now() < SESSION_REFRESH_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .where(eq(sessions.id, sessionId));
  }

  const overrides = await db
    .select({ permission: rolePermissions.permission, enabled: rolePermissions.enabled })
    .from(rolePermissions)
    .where(eq(rolePermissions.role, row.user.role));

  const { passwordHash: _passwordHash, ...safeUser } = row.user;
  return {
    ...safeUser,
    permissions: resolvePermissions(row.user.role, overrides, row.user.permissionsJson),
    isClientUser: row.user.clientId !== null,
  };
});

export async function getRoleOverrides(role: UserRole) {
  return db
    .select()
    .from(rolePermissions)
    .where(and(eq(rolePermissions.role, role)));
}
