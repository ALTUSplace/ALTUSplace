import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { verifyCron } from "../middleware/cronAuth";

function makeHarness() {
  const next = vi.fn();
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  const req = { headers: {} as Record<string, string> } as Request;
  return { req, res, next };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyCron", () => {
  it("accepts a request with the x-vercel-cron header", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { req, res, next } = makeHarness();
    req.headers["x-vercel-cron"] = "1";

    verifyCron(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("accepts a request with a valid CRON_SECRET bearer token", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const { req, res, next } = makeHarness();
    req.headers.authorization = "Bearer s3cret-value";

    verifyCron(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("rejects a request without the header or secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const { req, res, next } = makeHarness();

    verifyCron(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a mismatched bearer token in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    const { req, res, next } = makeHarness();
    req.headers.authorization = "Bearer wrong";

    verifyCron(req as Request, res as Response, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows unauthenticated requests in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const { req, res, next } = makeHarness();

    verifyCron(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("allows unauthenticated requests when NODE_ENV is unset (test env)", () => {
    vi.stubEnv("NODE_ENV", "");
    const { req, res, next } = makeHarness();

    verifyCron(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });
});