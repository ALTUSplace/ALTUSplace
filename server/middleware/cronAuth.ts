import type { NextFunction, Request, Response } from "express";

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
  // Development / test: allow unauthenticated cron pings.
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  // Vercel adds this header automatically to scheduled invocations.
  if (req.headers["x-vercel-cron"]) {
    next();
    return;
  }

  // Self-hosted fallback: require "Authorization: Bearer <CRON_SECRET>".
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization === `Bearer ${secret}`) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}