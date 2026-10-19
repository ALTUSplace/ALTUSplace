import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { verifyCron, verifyScheduledTask } from "../middleware/cronAuth";
import { sdk } from "../_core/sdk";

// Manus platform cron sessions are validated through the SDK; mock it so the
// route guard's decision logic is tested without any platform call.
vi.mock("../_core/sdk", () => ({
  sdk: { authenticateRequest: vi.fn() },
}));

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
  vi.mocked(sdk.authenticateRequest).mockReset();
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

describe("verifyScheduledTask", () => {
  it("allows unauthenticated requests outside production (dev/test bypass)", async () => {
    vi.stubEnv("NODE_ENV", "");
    const { req, res, next } = makeHarness();

    await verifyScheduledTask(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(sdk.authenticateRequest).not.toHaveBeenCalled();
  });

  it("accepts the x-vercel-cron credential without a session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { req, res, next } = makeHarness();
    req.headers["x-vercel-cron"] = "1";

    await verifyScheduledTask(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(sdk.authenticateRequest).not.toHaveBeenCalled();
  });

  it("accepts a valid platform cron session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ isCron: true, taskUid: "task-1" } as never);
    const { req, res, next } = makeHarness();

    await verifyScheduledTask(req as Request, res as Response, next as NextFunction);

    expect(sdk.authenticateRequest).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects an authenticated non-cron session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(sdk.authenticateRequest).mockResolvedValue({ isCron: false } as never);
    const { req, res, next } = makeHarness();

    await verifyScheduledTask(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("rejects when no session can be authenticated", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(sdk.authenticateRequest).mockRejectedValue(new Error("Invalid session cookie"));
    const { req, res, next } = makeHarness();

    await verifyScheduledTask(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});