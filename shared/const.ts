import { REVIEW_CRITERIA } from "./rating";

export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// One-time nonce cookie that binds an OAuth login to the browser that started
// it. The `__Host-` prefix forces the cookie host-only (Secure, Path=/, no
// Domain), so a sibling *.manus.space site cannot plant a matching value in a
// victim's browser.
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";

// `state` carries the callback redirect URI (used at token exchange) plus the
// CSRF nonce. Defined here so the client encoder and server decoder never drift.
export type OAuthState = { redirectUri: string; nonce?: string };

export const encodeOAuthState = (state: OAuthState): string =>
  btoa(JSON.stringify(state));

export const decodeOAuthState = (state: string): OAuthState => {
  let decoded: string;
  try {
    decoded = atob(state);
  } catch {
    // Malformed base64 (e.g. attacker-supplied garbage). Return no nonce so the
    // callback's CSRF guard rejects it with 403 — never throw, since the caller
    // runs outside the request handler's try/catch.
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
    // Legacy links: `state` was a bare base64(redirectUri) with no nonce.
  }
  return { redirectUri: decoded };
};

/** Criterion keys of the multi-criteria review breakdown (see shared/rating.ts). */
export type RatingCriterionKey = (typeof REVIEW_CRITERIA)[number]["key"];

/**
 * Platform-wide median per criterion (1-5 scale).
 *
 * Hardcoded for now: the live review volume is still thin, so a computed median
 * would swing listing to listing. These values only feed the +/-15% colour band
 * of the listing-detail breakdown bars — they never back a stored rating or a
 * displayed "average". Once enough reviews exist, replace this constant with a
 * value computed from the `reviews` sub-score columns.
 */
export const PLATFORM_RATING_MEDIANS: Record<RatingCriterionKey, number> = {
  cleanliness: 4.2,
  location: 4.3,
  value: 4.0,
  communication: 4.4,
  accuracy: 4.2,
};
