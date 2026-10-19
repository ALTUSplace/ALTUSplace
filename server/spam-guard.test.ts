import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M-6 — in-router spam guards.
 *
 * The public side-effect mutations carry their own per-IP budget inside the
 * tRPC router, so a script cannot flood admins (lead form / support tickets)
 * or write unbounded rows even while staying under the HTTP `standard` tier
 * (300/min). These tests exercise the guard end-to-end through the real
 * router: the 11th lead submit from one IP is rejected, another IP is
 * unaffected, and the guard sits BEHIND requireUser (failed auth never spends
 * an authenticated caller's quota).
 */
vi.mock("./notificationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./notificationService")>();
  return {
    ...actual,
    alertAdmins: vi.fn(async () => undefined),
    safeNotifyUser: vi.fn(async () => 1),
  };
});

import { appRouter } from "./routers";
import { __resetRateLimitBucketsForTests, SPAM_GUARD_LIMITS } from "./_core/security";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const LEAD_IP = "203.0.113.7";
const OTHER_IP = "203.0.113.8";

const baseUser: AuthenticatedUser = {
  id: 7,
  openId: "spam-guard-user",
  email: "guard@example.com",
  name: "Guard",
  loginMethod: "manus",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function context(ip: string, user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { ip, protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const lead = {
  name: "Samir Alaoui",
  phone: "+212612345678",
  carModel: "Dacia Duster 2022",
  city: "Casablanca",
};

beforeEach(() => {
  __resetRateLimitBucketsForTests();
});

describe("M-6 — in-router spam guards", () => {
  it("blocks the (max+1)th lead submission from one IP (requestListing.create)", async () => {
    const caller = appRouter.createCaller(context(LEAD_IP, null)).requestListing;
    const { max } = SPAM_GUARD_LIMITS.leadRequest;

    for (let i = 0; i < max; i++) {
      const response = await caller.create({ ...lead, requestId: `req-${i}` });
      expect(response.success).toBe(true);
    }

    await expect(caller.create({ ...lead, requestId: "req-over" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("keeps another IP's budget untouched", async () => {
    const { max } = SPAM_GUARD_LIMITS.leadRequest;
    const first = appRouter.createCaller(context(LEAD_IP, null)).requestListing;
    for (let i = 0; i < max; i++) {
      await first.create({ ...lead, requestId: `req-a-${i}` });
    }
    await expect(first.create({ ...lead, requestId: "req-a-over" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });

    const other = appRouter.createCaller(context(OTHER_IP, null)).requestListing;
    await expect(other.create({ ...lead, requestId: "req-b-0" })).resolves.toMatchObject({
      success: true,
    });
  });

  it("blocks comment spam from one authenticated IP (comments.create)", async () => {
    const caller = appRouter.createCaller(context(LEAD_IP, baseUser)).comments;
    const { max } = SPAM_GUARD_LIMITS.comment;

    // The handler still runs (and fails) while the budget lasts: this test
    // environment has no DATABASE_URL, so reaching the handler surfaces as
    // INTERNAL_SERVER_ERROR — which is also the signal the guard did NOT fire.
    for (let i = 0; i < max; i++) {
      await expect(caller.create({ listingId: 42, body: "مرحباً" })).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    }

    await expect(caller.create({ listingId: 42, body: "مرحباً" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("never spends an authenticated caller's quota on unauthenticated attempts", async () => {
    const anonymous = appRouter.createCaller(context(LEAD_IP, null)).comments;

    // Exhaust more than the whole bucket worth of UNAUTHORIZED calls: the
    // guard runs AFTER requireUser, so none of them may consume the IP quota.
    for (let i = 0; i < SPAM_GUARD_LIMITS.comment.max + 2; i++) {
      await expect(anonymous.create({ listingId: 42, body: "مرحباً" })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    }

    const authenticated = appRouter.createCaller(context(LEAD_IP, baseUser)).comments;
    await expect(authenticated.create({ listingId: 42, body: "مرحباً" })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
