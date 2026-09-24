/**
 * One-shot, gated reset of the owner direct-login password (ops only).
 *
 * Where the owner password is stored:
 *   - Table: platform_settings (single-row config)
 *   - Columns: owner_password_hash / owner_password_salt (text)
 *   - Algorithm: scrypt (SCRYPT_KEYLEN = 64, 16-byte random hex salt),
 *     verified with timingSafeEqual — see server/_core/ownerAuth.ts.
 *
 * OWNER_EMAIL is an identity anchor, not a target for a column write: the
 * direct-login credential is global (platform_settings), so the script
 * resolves the owner row in `users` (role SUPER_ADMIN / owner / admin, or the
 * direct-login owner openId) and refuses to run when the email does not match
 * an owner — a typo can never silently rehash the wrong deployment's
 * credential. The reset itself reuses the app's existing scrypt helper
 * (`setOwnerPassword`), which updates the platform_settings owner row in
 * place. `users.password_hash` is the PARTNER login credential
 * (server/_core/partnerAuth.ts) and is deliberately NOT touched — the
 * direct-login endpoint never reads it.
 *
 * Guards (honest production behavior):
 *   - Runs ONLY when RESET_OWNER_PASSWORD=1. Every missing/invalid input is a
 *     hard error — nothing is ever partially applied.
 *   - Reuses the app's existing hashing helper so the new hash is
 *     byte-compatible with /api/auth/direct-login, and self-checks with
 *     verifyOwnerPassword afterwards.
 *   - NEVER logs the password or its hash — only the owner email, its role,
 *     and a success flag after re-verification.
 *
 * Usage:
 *   RESET_OWNER_PASSWORD=1 OWNER_EMAIL=<email> NEW_PASSWORD=<new> \
 *     pnpm tsx scripts/reset-owner-password.ts
 */
import { eq } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { setOwnerPassword, verifyOwnerPassword } from "../server/_core/ownerAuth";
import { normalizeSecret } from "../server/_core/secretUtils";

export const DIRECT_OWNER_OPEN_ID = "owner-direct-login";
export const MIN_PASSWORD_LENGTH = 8;
const OWNER_ROLE_SET = new Set<string>(["SUPER_ADMIN", "owner", "admin"]);

/** Parse + validate RESET inputs from the process env. Throws on any problem. */
export function validateResetInputs(env: NodeJS.ProcessEnv): { ownerEmail: string; newPassword: string } {
  const ownerEmail = normalizeSecret(env.OWNER_EMAIL ?? "");
  const newPassword = normalizeSecret(env.NEW_PASSWORD ?? "");
  if (!ownerEmail) throw new Error("OWNER_EMAIL is required.");
  if (!newPassword) throw new Error("NEW_PASSWORD is required.");
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`NEW_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return { ownerEmail, newPassword };
}

/** Pick the owner row out of the matched users rows; throw when none matches. */
export function resolveOwnerRow(rows: Array<{ openId: string; role: string }>, ownerEmail: string) {
  const owner = rows.find((row) => OWNER_ROLE_SET.has(row.role) || row.openId === DIRECT_OWNER_OPEN_ID);
  if (!owner) {
    const found = rows.map((row) => `${row.role}/${row.openId}`).join(", ") || "none";
    throw new Error(`Email "${ownerEmail}" is not an owner row (matched roles: ${found}) — nothing was reset.`);
  }
  return owner;
}

/** Fetch users rows by email, then resolve the owner (identity anchor). */
export async function resolveOwnerByEmail(db: any, ownerEmail: string) {
  const rows = await db
    .select({ openId: users.openId, role: users.role })
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(10);
  if (rows.length === 0) {
    throw new Error(`No users row found with email "${ownerEmail}" — nothing was reset.`);
  }
  return resolveOwnerRow(rows, ownerEmail);
}

/** Apply the reset: rehash via the app's existing helper, then self-verify. */
export async function runReset(db: any, inputs: { ownerEmail: string; newPassword: string }): Promise<void> {
  const owner = await resolveOwnerByEmail(db, inputs.ownerEmail);
  await setOwnerPassword(inputs.newPassword); // in-place platform_settings update (scrypt)
  const verified = await verifyOwnerPassword(inputs.newPassword);
  if (!verified) {
    throw new Error("Post-reset verification failed — stored hash does not match the new password.");
  }
  console.log(
    `[owner-reset] done — owner email "${inputs.ownerEmail}" (role ${owner.role}); direct-login credential updated and re-verified.`,
  );
}

function loadConnectionString(): string {
  const root = resolve(process.cwd());
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (existsSync(resolve(root, ".env"))) {
    const text = readFileSync(resolve(root, ".env"), "utf8");
    const match = text.match(/^(?:DATABASE_URL|SUPABASE_DB_URL)=(.*)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("DATABASE_URL (or SUPABASE_DB_URL) is required to reset the owner password");
}

async function main(): Promise<void> {
  if (process.env.RESET_OWNER_PASSWORD !== "1") {
    console.error(
      "[owner-reset] RESET_OWNER_PASSWORD != 1 — refusing to run. Set RESET_OWNER_PASSWORD=1 to reset the owner direct-login password.",
    );
    process.exit(1);
  }

  const inputs = validateResetInputs(process.env);
  process.env.DATABASE_URL ??= loadConnectionString();

  let db: any;
  try {
    db = await getDb();
    if (!db) throw new Error("Database unavailable");
    await runReset(db, inputs);
  } finally {
    await (db as any)?.$client?.end?.();
  }
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error("[owner-reset] failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}