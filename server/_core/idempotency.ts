/**
 * Short-lived idempotency ledger.
 *
 * Collapses accidental duplicate submissions (a double-click, a client retry
 * after a flaky connection, an at-least-once network hop) into a single side
 * effect. Callers `claimOnce(key)` BEFORE performing the side effect — for the
 * lead intake that side effect is the admin alert/email — and treat a
 * `"duplicate"` result as "this exact intent was already handled inside the
 * window; return success without repeating it".
 *
 * Storage strategy (deliberately ephemeral — no DB writes at this phase):
 * - When a shared Redis (Upstash REST) is configured, a claim is a single
 *   atomic `SET key 1 NX EX ttl`. That is the only variant that is safe across
 *   the concurrent serverless instances a production deployment runs on.
 * - Otherwise it falls back to a bounded in-process Map. The read-then-write is
 *   fully synchronous (no `await` in between), so a same-tick burst cannot
 *   interleave — but it only observes requests handled by THIS instance. On a
 *   multi-instance deployment that is best-effort: it reliably catches the
 *   common "visitor double-clicks the same warm instance" case and nothing more.
 *
 * NOTE: this project's production environment currently has no Redis
 * provisioned, so in production the in-process path is what runs. The Redis
 * branch exists so that setting `UPSTASH_REDIS_REST_URL` /
 * `UPSTASH_REDIS_REST_TOKEN` upgrades dedupe from best-effort to guaranteed
 * without another code change. Persistent, cross-instance, auditable
 * idempotency is the Phase D follow-up (DB table + unique index).
 */

import { getRedisClient, isRedisAvailable } from "./cache";
import { logger } from "./logger";

export type ClaimResult = "claimed" | "duplicate";

/** Window during which a repeated key is treated as the same submission. */
export const DEFAULT_IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

/** Hard cap on the in-process ledger so a flood of distinct keys cannot grow memory without bound. */
const MAX_MEMORY_ENTRIES = 5_000;

const memoryLedger = new Map<string, number>();

function redisKey(key: string): string {
  return `idempotency:${key}`;
}

/** Drop expired entries; if the ledger is still over the cap, drop the oldest-expiring first. */
function pruneMemoryLedger(now: number): void {
  memoryLedger.forEach((expiresAt, key) => {
    if (expiresAt <= now) memoryLedger.delete(key);
  });
  if (memoryLedger.size <= MAX_MEMORY_ENTRIES) return;

  const byExpiry: Array<[string, number]> = [];
  memoryLedger.forEach((expiresAt, key) => byExpiry.push([key, expiresAt]));
  byExpiry.sort((a, b) => a[1] - b[1]);
  const excess = memoryLedger.size - MAX_MEMORY_ENTRIES;
  for (let i = 0; i < excess; i++) {
    const entry = byExpiry[i];
    if (entry) memoryLedger.delete(entry[0]);
  }
}

/**
 * Atomically claim `key` for `ttlMs`.
 *
 * @returns `"claimed"` on the first call for that key, `"duplicate"` for every
 * repeat inside the window. A `"duplicate"` is NOT an error: it means the
 * work has already been done and must not be repeated.
 */
export async function claimOnce(
  key: string,
  ttlMs: number = DEFAULT_IDEMPOTENCY_TTL_MS,
): Promise<ClaimResult> {
  const client = isRedisAvailable() ? getRedisClient() : null;

  if (client) {
    try {
      // Upstash returns "OK" when the key was free and null when NX declined it.
      const acquired = await client.set(redisKey(key), "1", {
        nx: true,
        ex: Math.max(1, Math.ceil(ttlMs / 1000)),
      });
      if (acquired === null) return "duplicate";
      return "claimed";
    } catch (error) {
      // A shared-store outage must not take the lead flow down with it.
      logger.warn("[idempotency] shared store unavailable; falling back to the in-process ledger", {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const now = Date.now();
  const expiresAt = memoryLedger.get(key);
  if (expiresAt !== undefined && expiresAt > now) return "duplicate";
  memoryLedger.set(key, now + ttlMs);
  pruneMemoryLedger(now);
  return "claimed";
}

/** Test seam: forget every in-process claim. */
export function resetIdempotencyStore(): void {
  memoryLedger.clear();
}

/** Test seam: observe the in-process ledger size (used to prove the cap holds). */
export function idempotencyStoreSize(): number {
  return memoryLedger.size;
}
