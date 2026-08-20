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

  if (!url) {
    // `next build` evaluates every route module to collect page data. No route
    // queries at build time (they are all dynamic), but the module graph still
    // constructs the client — so hand the build an in-memory database rather
    // than demanding production credentials on a build machine. If a query ever
    // does run during a build, it fails on a missing table instead of silently
    // reading stale local data.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return createClient({ url: ":memory:" });
    }

    // Local dev / CI → on-disk SQLite file. Where that file cannot be opened —
    // most importantly a serverless filesystem, which is read-only and
    // ephemeral — libSQL raises an opaque ConnectionFailed on every single
    // request. Translate it once into the thing the operator actually needs to
    // know, rather than letting a stack trace stand in for the instruction.
    try {
      return createClient({ url: "file:./local.db" });
    } catch (cause) {
      throw new Error(
        "TURSO_DATABASE_URL is not set, and the ./local.db development fallback could not be " +
          "opened. A deployed instance needs a real Turso database: set TURSO_DATABASE_URL and " +
          "TURSO_AUTH_TOKEN in the environment, then apply the schema (`npm run db:push`, or " +
          "drizzle/migrations via `turso db shell`).",
        { cause },
      );
    }
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

function resolveClient(): Client {
  globalForDb.__ecohygieneDb ??= createLibsqlClient();
  return globalForDb.__ecohygieneDb;
}

/**
 * Lazy handle: the connection is opened on first query, not at import time.
 * `next build` imports this module while collecting page data, and a build
 * machine has neither the production credentials nor any reason to reach the
 * database — connecting eagerly would fail the build rather than the request.
 */
export const libsql = new Proxy({} as Client, {
  get(_target, property, receiver) {
    const client = resolveClient();
    const value = Reflect.get(client as object, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const db = drizzle(libsql, { schema });

export { schema };
export * from "@db/schema";
