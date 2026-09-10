import { describe, expect, it, beforeEach } from "vitest";
import { createRateLimiter } from "../../server/_core/security";

describe("rate limiter", () => {
  beforeEach(() => {
    // Reset buckets between tests by creating fresh limiter instances
  });

  it("allows requests within the limit", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 5,
      namespace: "test:allows",
    });

    const mockReq = { ip: "127.0.0.1", method: "GET", path: "/api/test" } as any;
    const mockRes = {
      status: function () { return this; },
      json: function () { return this; },
      setHeader: function () { return this; },
    } as any;
    const mockNext = () => {};

    // First 5 requests should pass
    for (let i = 0; i < 5; i++) {
      let nextCalled = false;
      limiter(mockReq, mockRes, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }
  });

  it("blocks requests exceeding the limit", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      namespace: "test:blocks",
    });

    const mockReq = { ip: "127.0.0.2", method: "GET", path: "/api/test" } as any;
    const mockRes = {
      status: function () { return this; },
      json: function () { return this; },
      setHeader: function () { return this; },
    } as any;

    // First 3 requests should pass
    for (let i = 0; i < 3; i++) {
      let nextCalled = false;
      limiter(mockReq, mockRes, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }

    // 4th request should be blocked
    let nextCalled = false;
    let statusCalled = false;
    const resMock = {
      status: function () { statusCalled = true; return this; },
      json: function () { return this; },
      setHeader: function () { return this; },
    } as any;
    limiter(mockReq, resMock, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(statusCalled).toBe(true);
  });

  it("skips rate limiting for OPTIONS requests", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
      namespace: "test:options",
    });

    const mockReq = { ip: "127.0.0.3", method: "OPTIONS", path: "/api/test" } as any;
    const mockRes = {
      status: function () { return this; },
      json: function () { return this; },
      setHeader: function () { return this; },
    } as any;

    // Multiple OPTIONS requests should all pass
    for (let i = 0; i < 10; i++) {
      let nextCalled = false;
      limiter(mockReq, mockRes, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }
  });

  it("skips rate limiting for health endpoint", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
      namespace: "test:health",
    });

    const mockReq = { ip: "127.0.0.4", method: "GET", path: "/api/health" } as any;
    const mockRes = {
      status: function () { return this; },
      json: function () { return this; },
      setHeader: function () { return this; },
    } as any;

    // Multiple health requests should all pass
    for (let i = 0; i < 10; i++) {
      let nextCalled = false;
      limiter(mockReq, mockRes, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }
  });

  it("tracks different IPs independently", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 2,
      namespace: "test:ips",
    });

    const mockRes = {
      status: function () { return this; },
      json: function () { return this; },
      setHeader: function () { return this; },
    } as any;

    // IP 1 uses its quota
    const req1 = { ip: "10.0.0.1", method: "GET", path: "/api/test" } as any;
    for (let i = 0; i < 2; i++) {
      let nextCalled = false;
      limiter(req1, mockRes, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }
    // IP 1 is now blocked
    let nextCalled = false;
    limiter(req1, mockRes, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);

    // IP 2 should still be allowed
    const req2 = { ip: "10.0.0.2", method: "GET", path: "/api/test" } as any;
    let nextCalled2 = false;
    limiter(req2, mockRes, () => { nextCalled2 = true; });
    expect(nextCalled2).toBe(true);
  });

  it("sets rate limit headers", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 10,
      namespace: "test:headers",
    });

    const headers: Record<string, string> = {};
    const mockReq = { ip: "127.0.0.5", method: "GET", path: "/api/test" } as any;
    const mockRes = {
      status: function () { return this; },
      json: function () { return this; },
      setHeader: function (key: string, value: string) { headers[key] = value; return this; },
    } as any;

    limiter(mockReq, mockRes, () => {});

    expect(headers["RateLimit-Limit"]).toBe("10");
    expect(headers["RateLimit-Remaining"]).toBe("9");
  });
});
