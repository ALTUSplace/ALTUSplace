import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Burst / spaced-submission idempotency probe for `requestListing.create`
 * (Phase C finalization, STEP 2).
 *
 * ── CONTRACT, AND A CORRECTION TO THE ORIGINAL SPEC ──────────────────────────
 * The original brief for this step assumed that "rapid POSTs with identical
 * payloads but a NEW requestId every 50ms" would still produce a SINGLE admin
 * email, i.e. that the *phone number* alone is the dedupe identity. That is not
 * what the shipped contract does, and the existing suite encodes the opposite
 * on purpose. Asserting the brief as written would require changing production
 * behaviour, which this probe must not do. The real contract is:
 *
 *   - The idempotency key is `lead:${requestId}:${canonicalPhone}`
 *     (server/routers.ts) — identity == (requestId, phone).
 *   - A NEW requestId is, by definition, a new intent: `{ duplicate: false }`
 *     and a fresh `alertAdmins(...)`. N distinct requestIds ⇒ N alerts.
 *   - Reusing the SAME requestId (a double-click / client retry / at-least-once
 *     hop) collapses to `{ duplicate: true }` with NO second alert.
 *   - `alertAdmins` sends its email UNCONDITIONALLY and *before* any dedupe;
 *     only the in-app notification row is keyed (`admin:lead:<phone>`). So even
 *     a phone-level collapse could never have suppressed the email.
 *
 * This probe therefore asserts the REAL contract: exactly one alert per distinct
 * (requestId, phone) intent, and exactly one alert for a burst that reuses a
 * single requestId — including one spread across the whole 5-minute window.
 *
 * `requestId` is a client-generated key. A client that wants a spaced burst to
 * collapse must REUSE its key; generating a fresh one per attempt is how the
 * client declares "this is a new intent".
 */

/**
 * The admin alert is the side effect under test, so it is recorded rather than
 * executed — running the real service would also send an outbound email from
 * the test process.
 */
vi.mock("./notificationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./notificationService")>();
  return {
    ...actual,
    alertAdmins: vi.fn(async () => undefined),
    safeNotifyUser: vi.fn(async () => 1),
  };
});

import { alertAdmins } from "./notificationService";
import { appRouter } from "./routers";
import { resetIdempotencyStore } from "./_core/idempotency";
import { __resetRateLimitBucketsForTests } from "./_core/security";
import type { TrpcContext } from "./_core/context";

/** Spacing between submissions in the "spread across the window" probes. */
const BURST_SPACING_MS = 50;

/** A visitor is anonymous: `requestListing` is a public procedure. */
function visitorContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function leadCapture() {
  return appRouter.createCaller(visitorContext()).requestListing;
}

const lead = {
  name: "Samir Alaoui",
  phone: "+212612345678",
  carModel: "Dacia Duster 2022",
  city: "Casablanca",
};

/** Canonical form of `lead.phone` — the phone half of the idempotency key. */
const CANONICAL_PHONE = "212612345678";
const EXPECTED_DEDUPE_KEY = `lead:${CANONICAL_PHONE}`;

type LeadResponse = { success: true; duplicate: boolean };

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  resetIdempotencyStore();
  // M-6: these fixtures carry no IP, so all of a test's calls share the
  // "unknown" spam bucket; reset it per test so the idempotency contract is
  // exercised on a full budget. The busiest scenario (10 concurrent submits
  // with one requestId) sits exactly at the 10/min leadRequest cap; the guard
  // itself is pinned in server/spam-guard.test.ts.
  __resetRateLimitBucketsForTests();
  vi.mocked(alertAdmins).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requestListing.create — burst idempotency (STEP 2)", () => {
  it("collapses a burst that reuses ONE requestId (spaced 50ms apart) into a single alert", async () => {
    const { create } = leadCapture();
    const requestId = "req-burst-shared";

    const responses: LeadResponse[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      responses.push(await create({ ...lead, requestId }));
      if (attempt < 4) await delay(BURST_SPACING_MS);
    }

    expect(responses[0]).toMatchObject({ success: true, duplicate: false });
    expect(responses.slice(1).every((response) => response.duplicate === true)).toBe(true);
    expect(alertAdmins).toHaveBeenCalledTimes(1);
  });

  it("collapses a same-tick burst that reuses ONE requestId into a single alert", async () => {
    const { create } = leadCapture();
    const requestId = "req-burst-concurrent";

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => create({ ...lead, requestId })),
    );

    expect(responses.filter((response) => response.duplicate === false)).toHaveLength(1);
    expect(responses.filter((response) => response.duplicate === true)).toHaveLength(9);
    expect(alertAdmins).toHaveBeenCalledTimes(1);
  });

  it("treats N distinct requestIds as N distinct intents (N alerts) — the real contract", async () => {
    const { create } = leadCapture();

    for (let attempt = 0; attempt < 3; attempt++) {
      await create({ ...lead, requestId: `req-distinct-${attempt}` });
      if (attempt < 2) await delay(BURST_SPACING_MS);
    }

    expect(alertAdmins).toHaveBeenCalledTimes(3);
    // The in-app row key is stable across all three, even though three emails
    // went out — this is the exact asymmetry the original spec mis-read.
    for (const [input] of vi.mocked(alertAdmins).mock.calls) {
      expect(input.dedupeKey).toBe(EXPECTED_DEDUPE_KEY);
    }
  });

  it("keys the admin dedupe on the CANONICAL phone, so formatting cannot fork it", async () => {
    const { create } = leadCapture();

    // Same human, three spellings, three distinct requestIds.
    await create({ ...lead, phone: "+212612345678", requestId: "req-format-a" });
    await create({ ...lead, phone: "0612345678", requestId: "req-format-b" });
    await create({ ...lead, phone: "212612345678", requestId: "req-format-c" });

    expect(alertAdmins).toHaveBeenCalledTimes(3);
    for (const [input] of vi.mocked(alertAdmins).mock.calls) {
      expect(input.dedupeKey).toBe(EXPECTED_DEDUPE_KEY);
      expect(input.message).toContain(CANONICAL_PHONE);
    }
  });

  it("does not let a reused requestId cross-collapse a DIFFERENT phone", async () => {
    const { create } = leadCapture();
    const requestId = "req-reused-cross";

    const first = await create({ ...lead, requestId });
    const second = await create({ ...lead, phone: "+212699999999", requestId });

    expect(first).toMatchObject({ success: true, duplicate: false });
    expect(second).toMatchObject({ success: true, duplicate: false });
    expect(alertAdmins).toHaveBeenCalledTimes(2);
    expect(vi.mocked(alertAdmins).mock.calls[1][0].dedupeKey).toBe("lead:212699999999");
  });

  it("keeps a shared requestId sticky for the whole idempotency window and releases it after", async () => {
    // Move the clock instead of sleeping five real minutes: the key must stay
    // claimed for the entire window and only release strictly after it.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { create } = leadCapture();
    const requestId = "req-window";

    const before = await create({ ...lead, requestId });

    vi.setSystemTime(new Date("2026-01-01T00:04:59.999Z"));
    const inside = await create({ ...lead, requestId });

    vi.setSystemTime(new Date("2026-01-01T00:05:00.001Z"));
    const after = await create({ ...lead, requestId });

    expect(before).toMatchObject({ duplicate: false });
    expect(inside).toMatchObject({ duplicate: true });
    expect(after).toMatchObject({ duplicate: false });
    expect(alertAdmins).toHaveBeenCalledTimes(2);
  });
});
