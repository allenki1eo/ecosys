import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "@db/schema";

/**
 * A single libSQL client is reused across hot reloads in dev — Next.js keeps
 * re-evaluating modules and we would otherwise leak connections.
 */
const globalForDb = globalThis as unknown as { __ecohygieneDb?: Client };

function createLibsqlClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;

  // No Turso configured (local dev / CI) → fall back to an on-disk SQLite file.
  if (!url) {
    return createClient({ url: "file:./local.db" });
  }

  // Embedded replica: reads are served from a local file synced from Turso,
  // which is what makes the Shinyanga office fast on a poor uplink.
  const replicaPath = process.env.TURSO_REPLICA_PATH;
  if (replicaPath) {
    return createClient({
      url: replicaPath,
      syncUrl: url,
      authToken: process.env.TURSO_AUTH_TOKEN,
      syncInterval: 60,
    });
  }

  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

export const libsql = globalForDb.__ecohygieneDb ?? createLibsqlClient();
if (process.env.NODE_ENV !== "production") globalForDb.__ecohygieneDb = libsql;

export const db = drizzle(libsql, { schema });

export { schema };
export * from "@db/schema";
