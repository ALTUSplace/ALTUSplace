import type { NextFunction, Request, Response } from "express";
import { sdk } from "../_core/sdk";

/**
 * Guards Vercel Cron endpoints (/api/cron/*).
 *
 * Vercel's scheduler automatically attaches an `x-vercel-cron` header to cron
 * requests, so that is the primary trust signal. When the job runs on a
 * self-hosted scheduler (or the header cannot be trusted), fall back to a
 * bearer token matching CRON_SECRET. Outside production the guard is bypassed
 * so cron flows can be exercised locally and in tests.
 *
 * @param req  Incoming HTTP request
 * @param res  HTTP response
 * @param next Next middleware in the chain
 */
export function verifyCron(req: Request, res: Response, next: NextFunction): void {
  if (hasSchedulerCredential(req)) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}

/**
 * Defense-in-depth route guard for platform scheduled-task callbacks
 * (/api/scheduled/*, L-5).
 *
 * These endpoints are invoked by the Manus heartbeat scheduler with a signed
 * cron session (`cron_*` openId + `task_uid`), NOT by Vercel Cron, so
 * verifyCron alone would reject every production callback. This guard accepts
 * the same scheduler credentials as /api/cron/* AND a valid platform cron
 * session; the handler still re-verifies `isCron && taskUid` before doing any
 * work, so the route can never run unauthenticated in production.
 *
 * @param req  Incoming HTTP request
 * @param res  HTTP response
 * @param next Next middleware in the chain
 */
export async function verifyScheduledTask(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (hasSchedulerCredential(req)) {
    next();
    return;
  }

  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isCron && user.taskUid) {
      next();
      return;
    }
  } catch {
    // Invalid or expired platform session: fall through to a 401 below.
  }

  res.status(401).json({ error: "Unauthorized" });
}

/**
 * Shared scheduler trust signals. Outside production the checks are bypassed
 * so cron flows can be exercised locally and in tests (unchanged behavior);
 * production accepts the Vercel cron header or "Authorization: Bearer
 * <CRON_SECRET>".
 */
function hasSchedulerCredential(req: Request): boolean {
  // Development / test: allow unauthenticated cron pings.
  if (process.env.NODE_ENV !== "production") return true;

  // Vercel adds this header automatically to scheduled invocations.
  if (req.headers["x-vercel-cron"]) return true;

  // Self-hosted fallback: require "Authorization: Bearer <CRON_SECRET>".
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}
