/**
 * Applies every pending migration in `drizzle/migrations` to whichever database
 * the environment points at.
 *
 * This exists because "apply the SQL by hand" is a step that gets skipped, and
 * a deploy whose schema is behind its code 500s on the pages that use the new
 * tables. Drizzle records what it has run in `__drizzle_migrations`, so this is
 * idempotent: running it twice applies nothing the second time.
 */
import { config } from "dotenv";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  const db = drizzle(client);

  const target = url.startsWith("file:") ? url : new URL(url.replace("libsql://", "https://")).host;
  console.log(`Applying migrations to ${target}…`);

  await migrate(db, { migrationsFolder: "drizzle/migrations" });

  console.log("Schema is up to date.");
  client.close();
}

main().catch((error) => {
  console.error("\nMigration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
