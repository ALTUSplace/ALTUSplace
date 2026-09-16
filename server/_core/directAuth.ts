import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { logger } from "./logger";

// Stable openId used for the fallback owner account when OWNER_OPEN_ID is not
// configured. The account is always persisted as SUPER_ADMIN.
export const DIRECT_OWNER_OPEN_ID = "owner-direct-login";
export const DIRECT_OWNER_NAME = "Platform Owner";

/** Constant-time string comparison (hashes first so lengths always match). */
function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a, "utf8").digest();
  const hashB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Fallback owner login for deployments without the external OAuth portal.
 *
 * POST /api/auth/direct-login  { password }
 *   - 404 when DIRECT_LOGIN_PASSWORD is not configured (fail closed).
 *   - 401 on a wrong password (rate-limited 5/min/IP by registerSecurity).
 *   - On success: upserts the owner as SUPER_ADMIN and mints the same session
 *     cookie the OAuth callback would, so the rest of the app is unchanged.
 *
 * Security: the password is the only gate, so it MUST be a long random value.
 * Disable the endpoint (unset the env var) once OAuth access is restored.
 */
export function registerDirectAuthRoutes(app: Express) {
  app.post("/api/auth/direct-login", async (req: Request, res: Response) => {
    const configured = ENV.directLoginPassword;
    if (!configured) {
      res.status(404).json({ error: "Direct login is disabled." });
      return;
    }

    const body = req.body as { password?: unknown } | undefined;
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password || !safeEqual(password, configured)) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const openId = ENV.ownerOpenId || DIRECT_OWNER_OPEN_ID;

    try {
      await db.upsertUser({
        openId,
        name: DIRECT_OWNER_NAME,
        role: "SUPER_ADMIN",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: DIRECT_OWNER_NAME,
        expiresInMs: ONE_YEAR_MS,
      });

      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });

      res.json({ success: true, role: "SUPER_ADMIN", redirectTo: "/admin/super/dashboard" });
    } catch (error) {
      logger.error("Direct login failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Direct login failed." });
    }
  });
}