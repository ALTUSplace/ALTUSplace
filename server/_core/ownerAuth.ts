import { eq } from "drizzle-orm";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { platformSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "./env";
import { normalizeSecret, safeEqual } from "./secretUtils";

const SCRYPT_KEYLEN = 64;

export type OwnerCredentialRecord = {
  id: number | null;
  passwordHash: string | null;
  passwordSalt: string | null;
};

/** Read the persisted owner credential (single-row platform_settings). */
export async function getOwnerRecord(): Promise<OwnerCredentialRecord> {
  const db = await getDb();
  if (!db) return { id: null, passwordHash: null, passwordSalt: null };
  const rows = await db
    .select({
      id: platformSettings.id,
      hash: platformSettings.ownerPasswordHash,
      salt: platformSettings.ownerPasswordSalt,
    })
    .from(platformSettings)
    .limit(1);
  const row = rows[0];
  return {
    id: row?.id ?? null,
    passwordHash: row?.hash ?? null,
    passwordSalt: row?.salt ?? null,
  };
}

function envPassword(): string {
  return normalizeSecret(process.env.DIRECT_LOGIN_PASSWORD ?? ENV.directLoginPassword);
}

/**
 * The owner login is "configured" when either an env password is set OR a
 * password hash has been stored in the database via /api/auth/owner-setup.
 */
export async function isOwnerConfigured(): Promise<boolean> {
  if (envPassword()) return true;
  const record = await getOwnerRecord();
  return Boolean(record.passwordHash && record.passwordSalt);
}

/** Store a scrypt hash of the owner password (first-run setup). */
export async function setOwnerPassword(password: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  const record = await getOwnerRecord();
  if (record.id != null) {
    await db
      .update(platformSettings)
      .set({ ownerPasswordHash: passwordHash, ownerPasswordSalt: salt })
      .where(eq(platformSettings.id, record.id));
  } else {
    await db.insert(platformSettings).values({ ownerPasswordHash: passwordHash, ownerPasswordSalt: salt });
  }
}

/**
 * Verify a submitted password against the env fallback (constant-time) or the
 * stored scrypt hash. Returns false when nothing is configured.
 */
export async function verifyOwnerPassword(password: string): Promise<boolean> {
  const fromEnv = envPassword();
  if (fromEnv) return safeEqual(password, fromEnv);

  const record = await getOwnerRecord();
  if (!record.passwordHash || !record.passwordSalt) return false;

  const computed = scryptSync(password, record.passwordSalt, SCRYPT_KEYLEN);
  const stored = Buffer.from(record.passwordHash, "hex");
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}
