import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** URL-safe, sortable-enough random id. Prefixed so IDs are self-describing. */
export function newId(prefix: string, size = 16): string {
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}_${out}`;
}

/**
 * Human-facing reference such as `JOB-8F2K`. Kept short because crews read
 * these over the radio and write them on paper job cards.
 */
export function newReference(prefix: string): string {
  const bytes = randomBytes(4);
  let out = "";
  for (let i = 0; i < 4; i++) out += "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[bytes[i] % 32];
  return `${prefix}-${out}`;
}
