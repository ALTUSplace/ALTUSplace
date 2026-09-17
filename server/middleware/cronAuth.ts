import type { NextFunction, Request, Response } from "express";

/**
 * Protects scheduled endpoints from unauthorised requests.
 * Vercel marks requests originating from its Cron service with x-vercel-cron.
 * For production requests without that header, a Bearer CRON_SECRET is required.
 */
export function verifyCron(req: Request, res: Response, next: NextFunction): void {
  const vercelCronHeader = req.get("x-vercel-cron");

  if (vercelCronHeader) {
    next();
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  const authorization = req.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!expectedSecret || !match || match[1] !== expectedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
