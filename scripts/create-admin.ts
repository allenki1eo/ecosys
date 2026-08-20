/**
 * Create (or promote) a Super Admin account.
 *
 *   npm run db:create-admin -- --email you@example.com --name "Your Name"
 *
 * The password is never taken from the command line by default — it is typed at
 * a hidden prompt, so it does not end up in shell history or in the process list
 * where any other user on the machine could read it. For unattended use set
 * ADMIN_PASSWORD in the environment instead.
 *
 * Running against production: export the same TURSO_DATABASE_URL and
 * TURSO_AUTH_TOKEN the deployment uses, and this writes to that database.
 *
 * Safe to re-run. If the email already exists the account is promoted to Super
 * Admin, reactivated, detached from any client tenant, and its password reset —
 * which also makes this the password-recovery path for a locked-out admin.
 */
import { createInterface } from "node:readline";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { users } from "../drizzle/schema";
import { hashPassword } from "../src/lib/auth/password";
import { newId } from "../src/lib/ids";

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Prompts without echoing the input back to the terminal. */
async function promptHidden(question: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;

  if (!input.isTTY) {
    throw new Error(
      "No terminal available to prompt for a password. Set ADMIN_PASSWORD in the environment instead.",
    );
  }

  const rl = createInterface({ input, output, terminal: true });
  // Swallow the echoed characters while the answer is being typed.
  const muted = { value: false };
  const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (chunk: string) => {
    if (!muted.value) write(chunk);
  };

  output.write(question);
  muted.value = true;

  return new Promise<string>((resolve) => {
    rl.question("", (answer) => {
      muted.value = false;
      output.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Deliberately modest: long enough to resist casual guessing, without the
 * character-class rules that push people toward `Password1!`.
 */
function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (/^\s|\s$/.test(password)) return "Password must not start or end with whitespace.";
  return null;
}

async function main() {
  const email = (arg("--email") ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = arg("--name") ?? process.env.ADMIN_NAME ?? "";
  const phone = arg("--phone") ?? process.env.ADMIN_PHONE ?? null;

  if (!email || !email.includes("@")) {
    console.error("Provide an email: npm run db:create-admin -- --email you@example.com");
    process.exit(1);
  }
  if (!name) {
    console.error('Provide a name:  npm run db:create-admin -- --name "Your Name"');
    process.exit(1);
  }

  const password = process.env.ADMIN_PASSWORD ?? (await promptHidden("Password: "));
  const problem = validatePassword(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        name,
        phone: phone ?? existing.phone,
        role: "super_admin",
        // A Super Admin is Ecohygiene staff, never scoped to a client tenant.
        clientId: null,
        isActive: true,
      })
      .where(eq(users.id, existing.id));
    console.log(`Updated ${email} — now an active Super Admin with a new password.`);
  } else {
    await db.insert(users).values({
      id: newId("usr"),
      name,
      email,
      phone,
      role: "super_admin",
      passwordHash,
    });
    console.log(`Created Super Admin ${email}.`);
  }

  console.log("Sign in at /login.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
