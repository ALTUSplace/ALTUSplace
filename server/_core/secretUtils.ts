import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Normalize a secret coming from an env var or the request:
 *  - coerce non-strings to ""
 *  - trim leading/trailing whitespace (guards against a trailing newline when
 *    a value is pasted into a hosting dashboard)
 *  - strip one layer of matching surrounding quotes (`"secret"` / `'secret'`)
 */
export function normalizeSecret(value: unknown): string {
  if (typeof value !== "string") return "";
  let normalized = value.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

/** Constant-time string comparison (hashes first so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a, "utf8").digest();
  const hashB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}
