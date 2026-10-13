import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Storage backend stub.
 *
 * Production currently runs WITHOUT a shared Redis, so the in-process ledger is
 * the default path exercised here. `fakeRedis` models the Upstash contract for
 * the shared-store branch (`SET … NX EX` → "OK" when claimed, null when NX
 * declines) so both branches are covered deterministically and offline.
 */
const fakeStore = new Map<string, number>();
const fakeRedis = {
  set: vi.fn(async (key: string, _value: string, opts?: { nx?: boolean; ex?: number }) => {
    if (opts?.nx && fakeStore.has(key)) return null;
    fakeStore.set(key, opts?.ex ?? 0);
    return "OK" as const;
  }),
};
let redisAvailable = false;

vi.mock("./cache", () => ({
  isRedisAvailable: () => redisAvailable,
  getRedisClient: () => (redisAvailable ? fakeRedis : null),
}));

import {
  DEFAULT_IDEMPOTENCY_TTL_MS,
  claimOnce,
  idempotencyStoreSize,
  resetIdempotencyStore,
} from "./idempotency";

beforeEach(() => {
  resetIdempotencyStore();
  fakeStore.clear();
  fakeRedis.set.mockClear();
  redisAvailable = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("claimOnce — in-process ledger (no shared store configured)", () => {
  it("claims a key the first time it is seen", async () => {
    expect(await claimOnce("lead:abc")).toBe("claimed");
  });

  it("reports every repeat inside the window as a duplicate", async () => {
    await claimOnce("lead:abc");
    expect(await claimOnce("lead:abc")).toBe("duplicate");
    expect(await claimOnce("lead:abc")).toBe("duplicate");
  });

  it("keeps distinct keys independent", async () => {
    expect(await claimOnce("lead:a")).toBe("claimed");
    expect(await claimOnce("lead:b")).toBe("claimed");
  });

  it("allows a key to be claimed again once its TTL elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    expect(await claimOnce("lead:abc", 1000)).toBe("claimed");

    vi.setSystemTime(new Date("2026-01-01T00:00:00.999Z"));
    expect(await claimOnce("lead:abc", 1000)).toBe("duplicate");

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    expect(await claimOnce("lead:abc", 1000)).toBe("claimed");
  });

  it("collapses a same-tick burst to exactly one claim", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => claimOnce("lead:burst")));

    expect(results.filter((result) => result === "claimed")).toHaveLength(1);
    expect(results.filter((result) => result === "duplicate")).toHaveLength(24);
  });

  it("bounds the ledger so a flood of distinct keys cannot grow memory without limit", async () => {
    for (let i = 0; i < 6_000; i++) await claimOnce(`lead:${i}`);
    expect(idempotencyStoreSize()).toBeLessThanOrEqual(5_000);
  });

  it("defaults to a five-minute window", () => {
    expect(DEFAULT_IDEMPOTENCY_TTL_MS).toBe(5 * 60 * 1000);
  });
});

describe("claimOnce — shared store (Redis configured)", () => {
  beforeEach(() => {
    redisAvailable = true;
  });

  it("claims through the shared store as a single atomic SET NX EX", async () => {
    expect(await claimOnce("lead:shared")).toBe("claimed");
    expect(fakeRedis.set).toHaveBeenCalledWith("idempotency:lead:shared", "1", {
      nx: true,
      ex: 300,
    });
  });

  it("treats an NX miss as a duplicate", async () => {
    await claimOnce("lead:shared");
    expect(await claimOnce("lead:shared")).toBe("duplicate");
  });

  it("falls back to the in-process ledger when the shared store is unreachable", async () => {
    fakeRedis.set.mockRejectedValue(new Error("upstash unreachable"));

    expect(await claimOnce("lead:shared")).toBe("claimed");
    expect(await claimOnce("lead:shared")).toBe("duplicate");
  });
});
