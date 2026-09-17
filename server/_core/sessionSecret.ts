import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { platformSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "./env";
import { logger } from "./logger";

// In-memory cache so we hit the DB at most once per server instance.
let cached: string | null = null;

/** Test/hot-reload helper: forget the cached secret. */
export function resetSessionSecretCache(): void {
  cached = null;
}

/**
 * Resolve the HMAC secret used to sign session cookies.
 *
 * Preference order:
 *   1. JWT_SECRET / DIRECT_LOGIN_PASSWORD from the environment;
 *   2. a random secret generated once and persisted in `platform_settings`.
 *
 * The DB fallback means the app can sign stable sessions without any auth
 * env var being configured — no secret is ever committed to the repository.
 */
export async function resolveSessionSecret(): Promise<string> {
  if (ENV.cookieSecret) return ENV.cookieSecret;
  if (cached) return cached;

  const db = await getDb();
  if (db) {
    try {
      const rows = await db
        .select({ id: platformSettings.id, secret: platformSettings.sessionSecret })
        .from(platformSettings)
        .limit(1);
      const row = rows[0];
      if (row?.secret) {
        cached = row.secret;
        return row.secret;
      }
      const generated = randomBytes(32).toString("hex");
      if (row) {
        await db
          .update(platformSettings)
          .set({ sessionSecret: generated })
          .where(eq(platformSettings.id, row.id));
      } else {
        await db.insert(platformSettings).values({ sessionSecret: generated });
      }
      cached = generated;
      return generated;
    } catch (error) {
      logger.warn("[SessionSecret] Failed to load/generate DB secret", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Last resort: ephemeral secret (sessions won't survive a restart, but the
  // app stays functional and fails closed rather than trusting a known key).
  cached = cached ?? randomBytes(32).toString("hex");
  return cached;
}
