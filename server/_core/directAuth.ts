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

/**
 * Normalize a secret coming from an env var or the request:
 *  - coerce non-strings to ""
 *  - trim leading/trailing whitespace (guards against a trailing newline when
 *    a value is pasted into a hosting dashboard)
 *  - strip one layer of matching surrounding quotes (`"secret"` / `'secret'`)
 */
export function normalizeSecret(value: unknown): string {
  if (typeof value !== "string") return "";
  let normalized = value.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

/** Constant-time string comparison (hashes first so lengths always match). */
function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a, "utf8").digest();
  const hashB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

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

/**
 * Fallback owner login for deployments without the external OAuth portal.
 *
 * POST /api/auth/direct-login  { password }  (or header `x-owner-password`)
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
    // Read the value fresh at request time (never trust a build-time snapshot)
    // and normalize whitespace/quotes coming from the hosting dashboard.
    const configured = normalizeSecret(
      process.env.DIRECT_LOGIN_PASSWORD ?? ENV.directLoginPassword,
    );
    if (!configured) {
      res.status(404).json({ error: "Direct login is disabled.", reason: "not_configured" });
      return;
    }

    const provided = normalizeSecret(extractPassword(req));
    const match = provided.length > 0 && safeEqual(provided, configured);

    // Diagnostic log (masked): never logs the secret, only shapes/lengths.
    // logger.warn (not .info) because info is suppressed when NODE_ENV=production
    // on Vercel; warn always reaches the function logs.
    logger.warn("[DirectAuth] login attempt", {
      hasConfigured: configured.length > 0,
      configuredLength: configured.length,
      hasProvided: provided.length > 0,
      providedLength: provided.length,
      match,
    });

    if (!match) {
      const reason = provided.length > 0 ? "password_mismatch" : "missing_password";
      res.status(401).json({ error: "Invalid credentials.", reason });
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
      res.status(500).json({ error: "Direct login failed.", reason: "server_error" });
    }
  });
}