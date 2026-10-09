import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetRateLimitBucketsForTests,
  apiRateLimit,
  classifyApiRequest,
} from "./_core/security";

/**
 * Guard tests for audit findings C5 / C6 / C7 (tiered API rate limiting).
 *
 * These drive the real `apiRateLimit` middleware with mock req/res objects so
 * the assertions hold without booting Express:
 *
 *   C5  public catalogue reads must not be starved by the old shared
 *       100-req/15-min budget, and session reads (`auth.me`) must have their
 *       OWN bucket so a polling client can never spend the login budget.
 *   C6  /api/health must be exempt from every tier (the old guard matched the
 *       mount-stripped `req.path`, so it never fired).
 *   C7  buckets are per-instance in-memory; the per-instance ceiling is
 *       documented in security.ts and deliberately NOT fixed here.
 */

type MockReq = {
  method: string;
  originalUrl: string;
  ip: string;
  socket?: { remoteAddress?: string };
};

function req(method: string, originalUrl: string, ip = "203.0.113.10"): MockReq {
  return { method, originalUrl, ip };
}

function res() {
  const headers: Record<string, string> = {};
  const state = { statusCode: 200, body: null as unknown };
  return {
    headers,
    state,
    setHeader(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    removeHeader(name: string) {
      delete headers[name];
      return this;
    },
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      state.body = payload;
      return this;
    },
  };
}

type MockRes = ReturnType<typeof res>;

/** Run one request through the real middleware; returns the HTTP status. */
function fire(r: MockReq, mockRes: MockRes = res()): number {
  apiRateLimit(
    r as never,
    mockRes as never,
    (() => undefined) as never
  );
  return mockRes.state.statusCode;
}

beforeEach(() => {
  __resetRateLimitBucketsForTests();
});

describe("classifyApiRequest policy (pure)", () => {
  it("routes catalogue reads to the public-read tier", () => {
    expect(classifyApiRequest(req("GET", "/api/trpc/listings.list?batch=1&input=%7B%7D"))).toBe("public-read");
    expect(classifyApiRequest(req("GET", "/api/trpc/listings.list,listings.get?batch=2"))).toBe("public-read");
    expect(classifyApiRequest(req("GET", "/api/trpc/cities.list?batch=1"))).toBe("public-read");
    expect(classifyApiRequest(req("GET", "/api/trpc/payments.exchangeRates?batch=1"))).toBe("public-read");
  });

  it("routes session reads to their OWN tier, separate from login", () => {
    expect(classifyApiRequest(req("GET", "/api/trpc/auth.me?batch=1"))).toBe("session-read");
    expect(classifyApiRequest(req("GET", "/api/trpc/notifications.list?batch=1"))).toBe("session-read");
    expect(classifyApiRequest(req("GET", "/api/trpc/notifications.unreadCount?batch=1"))).toBe("session-read");
  });

  it("routes credential endpoints to the strict tier (5/min)", () => {
    expect(classifyApiRequest(req("POST", "/api/auth/direct-login"))).toBe("strict-auth");
    expect(classifyApiRequest(req("POST", "/api/auth/register"))).toBe("strict-auth");
    expect(classifyApiRequest(req("POST", "/api/auth/login"))).toBe("strict-auth");
    expect(classifyApiRequest(req("POST", "/api/auth/partner/register"))).toBe("strict-auth");
    expect(classifyApiRequest(req("GET", "/api/oauth/callback?code=x"))).toBe("strict-auth");
    expect(classifyApiRequest(req("POST", "/api/trpc/auth.becomeAgency"))).toBe("strict-auth");
  });

  it("keeps booking and payment surfaces on their own strict buckets", () => {
    expect(classifyApiRequest(req("POST", "/api/trpc/bookings.create"))).toBe("strict-booking");
    expect(classifyApiRequest(req("POST", "/api/trpc/payments.create"))).toBe("strict-payment");
    expect(classifyApiRequest(req("POST", "/api/v1/payments/webhook"))).toBe("strict-payment");
  });

  it("exempts OPTIONS and health probes from every tier (C6)", () => {
    expect(classifyApiRequest(req("OPTIONS", "/api/trpc/listings.list"))).toBe("exempt");
    expect(classifyApiRequest(req("GET", "/api/health"))).toBe("exempt");
    expect(classifyApiRequest(req("GET", "/api/health?full=1"))).toBe("exempt");
    expect(classifyApiRequest({ method: "GET", path: "/health" })).toBe("exempt");
  });

  it("never lets a mutation ride a read-only tier's budget", () => {
    // tRPC POST = mutation, even for a procedure whose name says "listings".
    expect(classifyApiRequest(req("POST", "/api/trpc/listings.create"))).toBe("standard");
    expect(classifyApiRequest(req("POST", "/api/trpc/favorites.add"))).toBe("standard");
    expect(classifyApiRequest(req("POST", "/api/trpc/auth.updateProfile"))).toBe("standard");
  });

  it("gives a batch its most restrictive member's tier", () => {
    // One response cannot be half-throttled.
    expect(classifyApiRequest(req("GET", "/api/trpc/listings.list,auth.me?batch=2"))).toBe("session-read");
    expect(classifyApiRequest(req("GET", "/api/trpc/listings.list,bookings.create?batch=2"))).toBe("strict-booking");
    expect(classifyApiRequest(req("GET", "/api/trpc/listings.list,favorites.list?batch=2"))).toBe("standard");
  });

  it("classifies non-trpc API routes into the residual standard tier", () => {
    expect(classifyApiRequest(req("GET", "/api/trpc/listings.list"))).not.toBe("standard");
    expect(classifyApiRequest(req("POST", "/api/ical/export"))).toBe("standard");
    expect(classifyApiRequest(req("GET", "/api/sitemap-listings.xml"))).toBe("standard");
    expect(classifyApiRequest(req("GET", "/api/auth/owner-status"))).toBe("standard");
  });
});

describe("C5 — public listing reads are not starved (50 req/min)", () => {
  it("returns 200 for 50 consecutive listings.list requests", () => {
    const statuses: number[] = [];
    for (let i = 0; i < 50; i++) {
      statuses.push(fire(req("GET", "/api/trpc/listings.list?batch=1&input=%7B%7D")));
    }
    expect(statuses.every(s => s === 200)).toBe(true);
    expect(statuses.filter(s => s === 429)).toHaveLength(0);
  });

  it("still refuses after the 500/min public-read ceiling", () => {
    let last = 200;
    for (let i = 0; i < 501; i++) last = fire(req("GET", "/api/trpc/listings.list?batch=1"));
    expect(last).toBe(429);
  });
});

describe("C5 — strict credential bucket stays at 5/min", () => {
  it("allows 5 direct-login attempts and 429s the 6th", () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push(fire(req("POST", "/api/auth/direct-login")));
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

describe("C5 — auth.me uses a SEPARATE bucket from login", () => {
  it("keeps serving auth.me after the strict-auth bucket is exhausted", () => {
    const loginStatuses: number[] = [];
    for (let i = 0; i < 6; i++) loginStatuses.push(fire(req("POST", "/api/auth/direct-login")));
    expect(loginStatuses[5]).toBe(429);
    // Login is now blocked, but session reads still work: distinct bucket.
    expect(fire(req("GET", "/api/trpc/auth.me?batch=1"))).toBe(200);
    expect(fire(req("GET", "/api/trpc/auth.me?batch=1"))).toBe(200);
    // ...and the reverse: burning auth.me must not block a login.
    __resetRateLimitBucketsForTests();
    for (let i = 0; i < 301; i++) fire(req("GET", "/api/trpc/auth.me?batch=1"));
    expect(fire(req("POST", "/api/auth/direct-login"))).toBe(200);
  });

  it("caps session reads at 300/min so polling cannot be free", () => {
    const statuses: number[] = [];
    for (let i = 0; i < 301; i++) statuses.push(fire(req("GET", "/api/trpc/auth.me?batch=1")));
    expect(statuses.slice(0, 300).every(s => s === 200)).toBe(true);
    expect(statuses[300]).toBe(429);
  });

  it("keeps notifications on the same session tier as auth.me", () => {
    for (let i = 0; i < 301; i++) fire(req("GET", "/api/trpc/notifications.unreadCount?batch=1"));
    // 300 spent: auth.me shares the session-read budget, NOT the login budget.
    expect(fire(req("GET", "/api/trpc/auth.me?batch=1"))).toBe(429);
    expect(fire(req("POST", "/api/auth/direct-login"))).toBe(200);
  });
});

describe("C6 — /api/health is exempt from every tier", () => {
  it("returns 200 after 100 rapid health calls", () => {
    const statuses: number[] = [];
    for (let i = 0; i < 100; i++) statuses.push(fire(req("GET", "/api/health")));
    expect(statuses.every(s => s === 200)).toBe(true);
  });

  it("does not consume any other tier's budget", () => {
    for (let i = 0; i < 100; i++) fire(req("GET", "/api/health"));
    // Strict bucket still has its full 5.
    for (let i = 0; i < 5; i++) expect(fire(req("POST", "/api/auth/direct-login"))).toBe(200);
    expect(fire(req("POST", "/api/auth/direct-login"))).toBe(429);
  });

  it("exempts health even when reached through the mount-stripped req.path", () => {
    // Regression guard for the dead-code check: `req.path === "/api/health"`
    // never matches under `app.use("/api/", ...)`.
    const stripped = { method: "GET", path: "/health", url: "/health", originalUrl: "/api/health", ip: "203.0.113.9" };
    expect(classifyApiRequest(stripped)).toBe("exempt");
    expect(fire(stripped as never)).toBe(200);
  });
});
