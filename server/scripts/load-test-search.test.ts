import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Load test for `listings.search` — Phase C finalization (STEP 1).
 *
 * HONESTY / SCOPE NOTE
 * --------------------
 * This harness drives the REAL tRPC procedure through an in-process
 * `createCaller`, but `../db` is mocked. The numbers it reports are therefore
 * the *in-process* cost of the handler (zod parse → filter → enrich → sort →
 * slice → public shaping), NOT Postgres or network latency. It is a regression
 * guard for the handler and a shape-correctness smoke test; it is not a
 * substitute for an end-to-end load test against a staging replica.
 *
 * Why no live DB: the only configured database in this repository is
 * PRODUCTION (`DATABASE_URL` / `SUPABASE_DB_URL` live in `.env.production.local`)
 * and there is no staging replica. Firing a 50-way concurrent burst at prod is
 * exactly what the safety rules forbid, so the handler is exercised against a
 * deterministic fake instead. See `--allow-prod-tests` (default false) in the
 * project runbook; this file never opens a connection.
 */

// The handler reaches Postgres only through `getDb()`. Swapping that one seam
// keeps the router, its zod validation and its response shaping under test
// without touching a line of production code.
vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return { ...actual, getDb: vi.fn() };
});

import { getDb } from "../db";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

/** Burst size. Deliberately below the harness-wide concurrency cap of 100. */
const CONCURRENCY = 50;

/** Rows the fake DB serves per search. */
const ROW_COUNT = 50;

/** Task budget: average latency must stay under this. */
const AVG_BUDGET_MS = 200;

/** Fields `toPublicListing` must strip before a row leaves the server. */
const PRIVATE_FIELDS = ["icalImportUrl", "icalExportToken"] as const;

/** tRPC codes that would surface to a client as a 5xx. */
const SERVER_ERROR_CODES = new Set([
  "INTERNAL_SERVER_ERROR",
  "TIMEOUT",
  "NOT_IMPLEMENTED",
]);

/** One listing row, deliberately carrying the two private iCal fields. */
function listingRow(id: number) {
  return {
    id,
    ownerId: 1000 + id,
    title: `Dacia Duster ${id}`,
    titleFr: null,
    description: `Listing number ${id}`,
    category: id % 2 === 0 ? "car" : "property",
    pricePerDay: 250 + id,
    imageUrl: `https://cdn.example.com/listing-${id}.jpg`,
    status: "Published",
    city: "Casablanca",
    lat: 33.5731,
    lng: -7.5898,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    // These two must never reach a public caller.
    icalImportUrl: `https://calendar.example.com/private-${id}.ics`,
    icalExportToken: `secret-token-${id}`,
  };
}

const searchRows = Array.from({ length: ROW_COUNT }, (_, index) => ({
  listing: listingRow(index + 1),
  ownerName: index % 3 === 0 ? "Agence X" : null,
  ownerRole: index % 3 === 0 ? "partner" : "user",
}));

/**
 * Minimal drizzle chain fake. With no date range supplied, `listings.search`
 * issues exactly two SELECTs:
 *   1. listings … leftJoin(users) … where(…) … orderBy(…)
 *   2. reviews  … where(…)        … groupBy(…)
 * Both are modelled. The optional `bookings` scan is never reached because this
 * harness omits startDate/endDate.
 */
function makeFakeDb() {
  const listingThenable = {
    then: (resolve: (value: unknown) => void) => resolve(searchRows),
  };
  const emptyThenable = {
    then: (resolve: (value: unknown) => void) => resolve([]),
  };
  const where = () => ({
    orderBy: () => listingThenable,
    groupBy: () => emptyThenable,
  });
  return {
    select: () => ({
      from: () => ({ leftJoin: () => ({ where }), where }),
    }),
  };
}

function visitorContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/** Nearest-rank percentile so p95 is stable for small samples. */
function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)] ?? 0;
}

/** Own enumerable keys of a value, without assuming its concrete type. */
function keysOf(value: unknown): string[] {
  return value !== null && typeof value === "object"
    ? Object.keys(value as Record<string, unknown>)
    : [];
}

type Outcome =
  | { ok: true; ms: number; result: { items: unknown[]; total: number; page: number; hasMore: boolean } }
  | { ok: false; ms: number; code: string };

describe("listings.search — 50-way concurrent load (mocked DB)", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockResolvedValue(
      makeFakeDb() as unknown as Awaited<ReturnType<typeof getDb>>,
    );
  });

  it(`serves ${CONCURRENCY} concurrent searches with zero errors inside the ${AVG_BUDGET_MS}ms average budget`, async () => {
    const caller = appRouter.createCaller(visitorContext());

    const wallStart = performance.now();
    const outcomes: Outcome[] = await Promise.all(
      Array.from({ length: CONCURRENCY }, async (): Promise<Outcome> => {
        const start = performance.now();
        try {
          const result = await caller.listings.search({ type: "all", pageSize: ROW_COUNT });
          return { ok: true, ms: performance.now() - start, result };
        } catch (error) {
          const code = (error as { code?: string } | null)?.code ?? "UNKNOWN";
          return { ok: false, ms: performance.now() - start, code };
        }
      }),
    );
    const wallMs = performance.now() - wallStart;

    const latencies = outcomes.map((outcome) => outcome.ms);
    const failures = outcomes.filter((outcome): outcome is Extract<Outcome, { ok: false }> => !outcome.ok);
    const serverErrors = failures.filter((failure) => SERVER_ERROR_CODES.has(failure.code));
    const avg = latencies.reduce((sum, ms) => sum + ms, 0) / latencies.length;
    const p95 = percentile(latencies, 95);
    const max = Math.max(...latencies);

    // Logged (not just asserted) so the CI transcript carries the evidence even
    // when the thresholds pass.
    console.log(
      `[load-test] listings.search x${CONCURRENCY} | avg=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms wall=${wallMs.toFixed(2)}ms errors=${failures.length} rows=${ROW_COUNT}`,
    );

    expect(failures.map((failure) => failure.code)).toEqual([]);
    expect(serverErrors).toEqual([]);
    expect(avg).toBeLessThan(AVG_BUDGET_MS);

    // Every successful response must be JSON-serialisable (no circular refs, no
    // raw SQL objects) and shaped like a real search page.
    for (const outcome of outcomes) {
      if (!outcome.ok) continue;
      const { result } = outcome;

      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items).toHaveLength(ROW_COUNT);
      expect(result.total).toBe(ROW_COUNT);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(false);

      const serialized = JSON.stringify(result);
      expect(() => JSON.parse(serialized)).not.toThrow();
      expect(serialized).not.toMatch(/secret-token-/);

      const first = result.items[0];
      for (const key of [
        "id",
        "title",
        "pricePerDay",
        "ownerName",
        "ownerRole",
        "averageRating",
        "reviewCount",
        "distanceKm",
      ]) {
        expect(keysOf(first)).toContain(key);
      }
    }
  });

  it("never leaks the private iCal fields to a public caller", async () => {
    const caller = appRouter.createCaller(visitorContext());
    const result = await caller.listings.search({ type: "all" });

    for (const item of result.items) {
      for (const field of PRIVATE_FIELDS) {
        expect(keysOf(item)).not.toContain(field);
      }
    }

    const serialized = JSON.stringify(result);
    for (const field of PRIVATE_FIELDS) {
      expect(serialized).not.toContain(field);
    }
    expect(serialized).not.toContain("secret-token-");
  });
});
