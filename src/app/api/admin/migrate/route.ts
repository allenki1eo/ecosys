import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { libsql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Applies pending schema migrations to the live database.
 *
 * `npm run db:migrate` is the normal route; this exists because the person who
 * needs to run it does not always have a terminal to hand, and a deploy whose
 * schema is behind its code fails on every page that touches the new tables.
 *
 * Two independent keys: a signed-in Super Admin, or `CRON_SECRET` as a bearer
 * token. The second matters precisely when the first cannot work — a missing
 * `sessions` table means nobody can sign in to fix it.
 *
 * Migrations are recorded in `__ecohygiene_migrations`, so re-running applies
 * nothing that has already been applied.
 */
async function authorise(request: Request): Promise<string | null> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return null;

  try {
    const user = await getCurrentUser();
    if (user && !user.isClientUser && user.role === "super_admin") return null;
  } catch {
    // A migration this route would fix can be what breaks the session lookup,
    // so a failure here is not fatal — fall through to the bearer token.
  }
  return "Unauthorized. Sign in as a Super Admin, or send CRON_SECRET as a bearer token.";
}

const APPLIED_TABLE = "__ecohygiene_migrations";

export async function POST(request: Request) {
  const denied = await authorise(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });

  const dir = path.join(process.cwd(), "drizzle", "migrations");

  let files: string[];
  try {
    files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  } catch {
    return NextResponse.json(
      { error: "No migrations directory was bundled with this deployment." },
      { status: 500 },
    );
  }

  await libsql.execute(
    `create table if not exists "${APPLIED_TABLE}" (
       name text primary key,
       applied_at integer not null
     )`,
  );
  const done = await libsql.execute(`select name from "${APPLIED_TABLE}"`);
  const applied = new Set(done.rows.map((row) => String(row.name)));

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(path.join(dir, file), "utf8");
    // Drizzle separates statements with this marker; splitting on semicolons
    // would break any statement containing one inside a string literal.
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      try {
        await libsql.execute(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // A table or column the migration adds may already exist — from an
        // earlier `db:push`, or a partial run. That is the state the migration
        // wanted, so treat it as done rather than wedging every later file.
        if (!/already exists|duplicate column/i.test(message)) {
          return NextResponse.json(
            { error: `${file} failed: ${message}`, applied: ran },
            { status: 500 },
          );
        }
      }
    }

    await libsql.execute({
      sql: `insert into "${APPLIED_TABLE}" (name, applied_at) values (?, ?)`,
      args: [file, Date.now()],
    });
    ran.push(file);
  }

  return NextResponse.json({
    ok: true,
    applied: ran,
    alreadyApplied: files.filter((file) => applied.has(file)),
    message: ran.length ? `Applied ${ran.length} migration(s).` : "Schema was already up to date.",
  });
}
