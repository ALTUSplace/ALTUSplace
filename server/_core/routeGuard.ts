import type { NextFunction, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import { sdk } from "./sdk";
import { logger } from "./logger";

/**
 * Strict public/private route isolation for the SPA.
 *
 * These paths belong to the authentication/ownership flow only: anonymous
 * visitors (no valid session) are redirected straight to the public homepage
 * "/" instead of being shown the login/consent/terms UI — including crawlers
 * and direct hotlinks. A short-lived `b2_auth_intent` cookie, written by
 * startLogin() / login buttons immediately before navigating, lets an ACTIVE
 * login/consent flow pass through before a session exists.
 */
export const AUTH_ONLY_PATHS = ["/register", "/terms", "/owner-login"] as const;

/** Cookie set by startLogin() right before navigating into the auth flow. */
export const AUTH_INTENT_COOKIE = "b2_auth_intent";

/** Normalize a request path (strip query, trailing slash) for matching. */
export function isAuthOnlyPath(pathname: string): boolean {
  const clean = (pathname || "/").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return (AUTH_ONLY_PATHS as readonly string[]).includes(clean);
}

/**
 * Pure decision helper. Testable without a live HTTP request:
 * - non-auth-only paths are never redirected;
 * - an active login flow (intent marker) is allowed through;
 * - a valid session token is allowed through;
 * - everything else (anonymous, no intent) is redirected to "/".
 */
export function shouldRedirectAuthOnlyPage(params: {
  pathname: string;
  sessionToken: string | null;
  hasAuthIntent: boolean;
}): boolean {
  if (!isAuthOnlyPath(params.pathname)) return false;
  if (params.hasAuthIntent) return false;
  return !params.sessionToken;
}

/** Session token from the HttpOnly cookie, falling back to the Bearer header. */
function sessionTokenFrom(req: Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const parsed = parseCookieHeader(cookieHeader);
    const cookie = parsed[COOKIE_NAME];
    if (cookie) return cookie;
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

/**
 * Express middleware. Mount BEFORE the SPA static/fallback handlers (and
 * before express.static, so prerendered artifacts for these paths cannot
 * leak to anonymous visitors either). Fails closed on any guard error.
 */
export async function protectAuthOnlyPages(req: Request, res: Response, next: NextFunction) {
  try {
    const pathname = req.path || req.originalUrl || "/";
    if (!isAuthOnlyPath(pathname)) return next();

    // Active login/consent flow (startLogin() set the marker just before
    // navigating here) is allowed through without a session yet.
    const hasAuthIntent = parseCookieHeader(req.headers.cookie ?? "")[AUTH_INTENT_COOKIE] === "1";
    if (hasAuthIntent) return next();

    const token = sessionTokenFrom(req);
    if (token) {
      const session = await sdk.verifySession(token);
      if (session?.openId) return next();
    }

    // Anonymous visitor on an auth-only page → back to the public homepage.
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, "/");
  } catch (error) {
    logger.warn("[routeGuard] guard error — redirecting to home", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) res.redirect(302, "/");
  }
}