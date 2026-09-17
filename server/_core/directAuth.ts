import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { logger } from "./logger";
import { normalizeSecret } from "./secretUtils";
import { isOwnerConfigured, setOwnerPassword, verifyOwnerPassword } from "./ownerAuth";

// Stable openId used for the fallback owner account when OWNER_OPEN_ID is not
// configured. The account is always persisted as SUPER_ADMIN.
export const DIRECT_OWNER_OPEN_ID = "owner-direct-login";
export const DIRECT_OWNER_NAME = "Platform Owner";
const MIN_PASSWORD_LENGTH = 8;

export { normalizeSecret } from "./secretUtils";

/**
 * Extract the candidate password from every place a runtime/framework might
 * put it:
 *  1. a pre-parsed JSON object on req.body (Vercel populates this before the
 *     Express handler runs);
 *  2. a raw string body (JSON, urlencoded, or plain text);
 *  3. the `x-owner-password` header — immune to serverless body-parsing quirks.
 */
export function extractPassword(req: Request): string | null {
  const body = (req as unknown as { body?: unknown }).body;

  if (typeof body === "string") {
    const text = body.trim();
    if (text.startsWith("{")) {
      try {
        const parsed = JSON.parse(text) as { password?: unknown };
        if (typeof parsed?.password === "string") return parsed.password;
      } catch {
        // fall through to other strategies
      }
    }
    const match = /(?:^|&)password=([^&]*)/.exec(body);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    if (text) return text;
  } else if (body && typeof body === "object") {
    const candidate = (body as { password?: unknown }).password;
    if (typeof candidate === "string") return candidate;
  }

  const header = req.headers["x-owner-password"];
  if (typeof header === "string" && header) return header;
  if (Array.isArray(header) && header[0]) return header[0];

  return null;
}

/** Upsert the owner as SUPER_ADMIN and mint the standard session cookie. */
async function issueOwnerSession(req: Request, res: Response): Promise<void> {
  const openId = ENV.ownerOpenId || DIRECT_OWNER_OPEN_ID;
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
}

/**
 * Owner authentication without the external OAuth portal.
 *
 *  GET  /api/auth/owner-status  -> { configured }
 *  POST /api/auth/owner-setup   -> first-run password claim (only when unset)
 *  POST /api/auth/direct-login  -> password login (env or DB hash)
 *
 * No credential is stored in the repository: the password hash and the session
 * signing secret live in the database (see ownerAuth.ts / sessionSecret.ts).
 */
export function registerDirectAuthRoutes(app: Express) {
  app.get("/api/auth/owner-status", async (_req: Request, res: Response) => {
    try {
      res.json({ configured: await isOwnerConfigured() });
    } catch (error) {
      logger.warn("[DirectAuth] owner-status failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.json({ configured: false });
    }
  });

  app.post("/api/auth/owner-setup", async (req: Request, res: Response) => {
    if (await isOwnerConfigured()) {
      res.status(403).json({ error: "Owner login is already configured.", reason: "already_configured" });
      return;
    }

    const provided = normalizeSecret(extractPassword(req));
    if (provided.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        reason: "weak_password",
      });
      return;
    }

    try {
      await setOwnerPassword(provided);
      await issueOwnerSession(req, res);
      logger.warn("[DirectAuth] owner password set via first-run setup");
      res.json({ success: true, role: "SUPER_ADMIN", redirectTo: "/admin/super/dashboard" });
    } catch (error) {
      logger.error("Owner setup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Owner setup failed.", reason: "server_error" });
    }
  });

  app.post("/api/auth/direct-login", async (req: Request, res: Response) => {
    const configured = await isOwnerConfigured();
    if (!configured) {
      res.status(404).json({ error: "Direct login is disabled.", reason: "not_configured" });
      return;
    }

    const provided = normalizeSecret(extractPassword(req));
    const match = provided.length > 0 && (await verifyOwnerPassword(provided));

    // Diagnostic log (masked): never logs the secret, only shapes/lengths.
    // logger.warn (not .info) because info is suppressed when NODE_ENV=production
    // on Vercel; warn always reaches the function logs.
    logger.warn("[DirectAuth] login attempt", {
      hasProvided: provided.length > 0,
      providedLength: provided.length,
      match,
    });

    if (!match) {
      const reason = provided.length > 0 ? "password_mismatch" : "missing_password";
      res.status(401).json({ error: "Invalid credentials.", reason });
      return;
    }

    try {
      await issueOwnerSession(req, res);
      res.json({ success: true, role: "SUPER_ADMIN", redirectTo: "/admin/super/dashboard" });
    } catch (error) {
      logger.error("Direct login failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: "Direct login failed.", reason: "server_error" });
    }
  });
}