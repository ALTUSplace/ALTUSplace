import type { Express, NextFunction, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { CSP_HEADER_VALUE } from "../../shared/security/csp";

type RateLimitOptions = { windowMs: number; max: number; message?: string };
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
  // Use Express's trust-proxy resolved address (app.set("trust proxy", 1))
  // instead of the client-supplied X-Forwarded-For header, whose left-most
  // entry can be spoofed to rotate the rate-limit bucket and bypass every
  // limit (auth/payment brute-force included).
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function pruneBuckets(now: number): void {
  if (buckets.size < 5000) return;
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) buckets.delete(key);
  });
}

/**
 * Query-stripped path of the ORIGINAL url, i.e. with the `/api` mount prefix
 * still attached.
 *
 * `app.use("/api/", fn)` strips the mount path from `req.url` (and therefore
 * from `req.path`), so a health check arrives with `req.path` equal to
 * "/health". That is exactly why the old health guard — which compared
 * `req.path` against the full `/api`-prefixed string — was dead code (audit
 * finding C6) and why `/api/health` returned 429 under load.
 * `originalUrl` is the only reliable input for a mount-agnostic matcher.
 */
function originalPath(req: { originalUrl?: string; url?: string; path?: string }): string {
  const raw = req.originalUrl || req.url || req.path || "";
  const q = raw.indexOf("?");
  return q === -1 ? raw : raw.slice(0, q);
}

/** Health probes are exempt from EVERY tier (monitoring must never be throttled). */
function isHealthProbe(req: { originalUrl?: string; url?: string; path?: string }): boolean {
  const p = originalPath(req);
  return p === "/api/health" || p === "/health" || p === "/healthz";
}

/** Sliding-window in-memory rate limiter (no extra dependency). */
export function createRateLimiter(options: RateLimitOptions & { namespace?: string }) {
  const { windowMs, max } = options;
  const message = options.message ?? "Too many requests, try again later.";
  const namespace = options.namespace ?? `rl:${max}:${windowMs}`;

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS" || isHealthProbe(req)) return next();
    const now = Date.now();
    pruneBuckets(now);
    const key = `${namespace}:${clientIp(req)}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(max - 1));
      return next();
    }
    current.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - current.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil((current.resetAt - now) / 1000)));
    if (current.count > max) {
      res.status(429).json({ error: message });
      return;
    }
    next();
  };
}

/**
 * ---------------------------------------------------------------------------
 * TIERED API RATE LIMITING (audit findings C5 / C6 / C7)
 * ---------------------------------------------------------------------------
 *
 * C5 — the old design funnelled EVERY /api request through one 100-req/15-min
 *       bucket (~6.7 req/min/IP) *and* routed `auth.me` through the 5/min
 *       strict bucket. In the audit load test that produced 58% 429s on
 *       ordinary listing reads and 100% 429s on session checks: legitimate
 *       users were locked out while a brute-forcer got the same 5/min budget
 *       as a page load. It also meant a client polling `auth.me` on every
 *       mount could spend the whole shared budget and break every other API
 *       call on that IP.
 *
 * C6 — the health guard compared `req.path` against the full `/api`-prefixed
 *       path. That check was dead code: `app.use("/api/", fn)` strips the
 *       mount prefix, so health checks arrived as "/health" and were
 *       throttled. The audit's health probe returned 429.
 *
 * C7 — buckets live in process memory. On Vercel each serverless instance has
 *       its own Map, so the effective ceiling is `max x instances` and it
 *       resets on every cold start (and is not shared across regions).
 *       DOCUMENTED, NOT FIXED: a shared store (Redis / Upstash / Vercel KV)
 *       is explicitly out of scope for this emergency PR. When one is added,
 *       swap the `buckets` Map in `createRateLimiter` for a shared counter
 *       and everything above keeps working unchanged.
 *
 * Tiers (per tier+IP bucket, independent of each other):
 *   exempt        OPTIONS, /api/health                 — never throttled
 *   public-read   listings.*, cities.* (GET only)      — 500/min
 *   session-read  auth.me, notifications.* (GET only)  — 300/min
 *   standard      everything else                      — 300/min
 *   strict-*      auth / booking / payment surfaces    — 5/min (own buckets)
 *
 * Batches: tRPC GET batches arrive as `/api/trpc/a,b,c`, so a single HTTP
 * request can carry several procedures. One response cannot be half-throttled,
 * therefore the batch takes its MOST RESTRICTIVE member's tier. With the
 * client-side fix (`AUTH_ME_QUERY_OPTIONS`: staleTime 5min, no refetch on
 * mount) `auth.me` is fetched once per session, so real navigation stays out
 * of the session-read tier.
 */
export type ApiRateTier =
  | "exempt"
  | "public-read"
  | "session-read"
  | "standard"
  | "strict-auth"
  | "strict-booking"
  | "strict-payment";

/** Strict buckets: 5 req / 1 min / IP for auth, booking & payment surfaces. */
export const authStrictLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  namespace: "rl:strict:auth:5:60000",
  message: "Too many auth attempts. Try again in a minute.",
});
export const bookingStrictLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  namespace: "rl:strict:booking:5:60000",
  message: "Too many booking attempts. Try again in a minute.",
});
export const paymentStrictLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  namespace: "rl:strict:payment:5:60000",
  message: "Too many payment attempts. Try again in a minute.",
});

/** Tier A — public catalogue reads. */
export const publicReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 500,
  namespace: "rl:tier:public-read:500:60000",
  message: "Too many requests. Try again in a minute.",
});
/** Tier C — session reads (auth.me / notifications), its OWN bucket. */
export const sessionReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  namespace: "rl:tier:session-read:300:60000",
  message: "Too many session checks. Try again in a minute.",
});
/** Residual bucket for everything else (replaces the old 100/15min budget). */
export const standardApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  namespace: "rl:tier:standard:300:60000",
  message: "Too many requests. Try again in a minute.",
});

/**
 * Least -> most restrictive. A batch takes the max over its members, and
 * `exempt` is dropped as soon as anything else in the batch needs a bucket.
 */
const TIER_RESTRICTIVENESS: Record<ApiRateTier, number> = {
  exempt: 0,
  "public-read": 1,
  standard: 2,
  "session-read": 3,
  "strict-auth": 4,
  "strict-booking": 4,
  "strict-payment": 4,
};

function mostRestrictive(tiers: ApiRateTier[]): ApiRateTier {
  let best: ApiRateTier = "exempt";
  for (const tier of tiers) {
    if (TIER_RESTRICTIVENESS[tier] > TIER_RESTRICTIVENESS[best]) best = tier;
  }
  return best;
}

/** tRPC procedure names carried by a request path (`a,b` for GET batches). */
function trpcProcedures(path: string): string[] | null {
  const m = /^\/api\/trpc\/([^/?#]+)/.exec(path);
  if (!m?.[1]) return null;
  return m[1].split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Tier for a single tRPC procedure. Read-only procedures only ever classify
 * into a read tier — mutations fall through to `standard`, so `listings.create`
 * cannot ride the public-read budget.
 */
function classifyProcedure(name: string): ApiRateTier {
  const n = name.toLowerCase();
  // Tier C: session reads. Deliberately NOT `auth.*` — auth.logout /
  // auth.updateProfile are user-initiated and sit in `standard`.
  if (n === "auth.me" || n.startsWith("notifications.")) return "session-read";
  // Tier A: public catalogue reads.
  if (n === "payments.exchangerates") return "public-read";
  if (n.startsWith("listings.") || n.startsWith("cities.")) return "public-read";
  // Strict surfaces (unchanged from the original policy).
  if (n.startsWith("bookings.") || n.startsWith("messages.")) return "strict-booking";
  if (n.startsWith("payments.") || n.startsWith("invoices.") || n.startsWith("refunds.")) return "strict-payment";
  // Privilege-elevation mutation (H1 fix gates it on an approved application;
  // the 5/min bucket is defence in depth).
  if (n === "auth.becomeagency") return "strict-auth";
  return "standard";
}

/** Tier for a legacy REST /api path. */
function classifyRestPath(path: string, method: string): ApiRateTier {
  const p = path.toLowerCase();
  if (p === "/api/health" || p === "/health" || p === "/healthz") return "exempt";
  // Credential endpoints — POST only; GETs under /api/auth are status reads.
  if (method !== "GET" && method !== "HEAD" && p.startsWith("/api/auth/")) return "strict-auth";
  // OAuth start/callback are credential exchanges regardless of method.
  if (p.startsWith("/api/oauth/")) return "strict-auth";
  if (p.startsWith("/api/bookings") || p.startsWith("/api/messages")) return "strict-booking";
  if (
    p.startsWith("/api/payments") ||
    p.startsWith("/api/v1/payments") ||
    p.startsWith("/api/invoices") ||
    p.startsWith("/api/refunds") ||
    p.startsWith("/api/escrow")
  ) return "strict-payment";
  // SEO/prerender is a public read used by the edge bot proxy.
  if (p.startsWith("/api/prerender")) return "public-read";
  return "standard";
}

/**
 * Pure classifier: which bucket does this request belong to?
 * Exported so guard tests can assert the policy without spinning up Express.
 */
export function classifyApiRequest(req: {
  method?: string;
  originalUrl?: string;
  url?: string;
  path?: string;
}): ApiRateTier {
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "OPTIONS") return "exempt";
  const path = originalPath(req);
  if (isHealthProbe(req)) return "exempt";

  const procedures = trpcProcedures(path);
  if (procedures && procedures.length > 0) {
    const isRead = method === "GET" || method === "HEAD";
    const tiers = procedures.map(name => {
      const tier = classifyProcedure(name);
      // tRPC GET = query, POST = mutation. A mutation must never ride a
      // read-only tier's budget, so `listings.create` cannot spend the
      // public-read 500/min allowance.
      if (!isRead && (tier === "public-read" || tier === "session-read")) return "standard" as const;
      return tier;
    });
    return mostRestrictive(tiers);
  }
  return classifyRestPath(path, method);
}

const TIER_LIMITERS: Record<Exclude<ApiRateTier, "exempt">, ReturnType<typeof createRateLimiter>> = {
  "public-read": publicReadLimiter,
  "session-read": sessionReadLimiter,
  standard: standardApiLimiter,
  "strict-auth": authStrictLimiter,
  "strict-booking": bookingStrictLimiter,
  "strict-payment": paymentStrictLimiter,
};

/** Single mount: `app.use("/api/", apiRateLimit)`. */
export function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const tier = classifyApiRequest(req);
  if (tier === "exempt") return next();
  return TIER_LIMITERS[tier](req, res, next);
}
/** Helmet-equivalent secure headers (compatible with Maps + Vite HMR). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  // Single source of truth: identical to the vercel.json edge policy so server
  // and edge responses can never drift (enforced by server/cspParity.test.ts).
  res.setHeader("Content-Security-Policy", CSP_HEADER_VALUE);
  res.removeHeader("X-Powered-By");
  next();
}

/** CSRF origin guard for state-changing /api/* requests. */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  if (!req.path.startsWith("/api/")) return next();
  // Bearer-authenticated requests (sessionStorage fallback or pure token auth)
  // carry no cookies and are immune to CSRF; skip the origin check.
  if (req.headers.authorization?.startsWith("Bearer ")) return next();
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (!origin && !referer) return next();
  const host = (req.headers.host ?? "").toLowerCase();
  const allowed = new Set<string>();
  if (host) {
    allowed.add(host);
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  const candidate = origin ?? referer ?? "";
  let candidateHost = "";
  try {
    candidateHost = new URL(candidate).host.toLowerCase();
  } catch {
    res.status(403).json({ error: "CSRF check failed: invalid origin." });
    return;
  }
  if (candidateHost && candidateHost !== host) {
    if (req.path.startsWith("/api/oauth/")) return next();
    res.status(403).json({ error: "CSRF check failed: origin not allowed." });
    return;
  }
  next();
}


/** Defense-in-depth text sanitizer (XSS): strip NUL + control chars, trim, cap length. */
export function sanitizeText(value: string, maxLength = 5000): string {
  return value
    .replace(/\0/g, "")
    // Strip ASCII control chars (except \n \r \t which are legitimate in descriptions)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

/** HTML-escape user content before DB persistence / email / hydration. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Sanitize + escape in one step for user-generated rich text fields. */
export function sanitizeUserContent(value: string, maxLength = 5000): string {
  return escapeHtml(sanitizeText(value, maxLength));
}

/** Open-redirect guard: only allow same-origin absolute paths. */
export function isSafeRedirectPath(value: string): boolean {
  return /^\/(?!\/)[^\s]*$/.test(value);
}

/** Register all security middleware in the correct order. */
export function registerSecurity(app: Express) {
  app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.use(csrfProtection);
  // One tiered bucket per request: see `classifyApiRequest`. Replaces the old
  // `strictRateLimitDispatcher` + `sensitiveApiLimiter` pair, whose mount-stripped
  // `req.path` matching (C6) and shared 100/15min budget (C5) mis-classified
  // almost every route.
  app.use("/api/", apiRateLimit);
}

/** Test helper: reset in-memory buckets between unit tests. */
export function __resetRateLimitBucketsForTests() {
  buckets.clear();
}

/**
 * tRPC input sanitizer: recursively sanitize every string in a parsed input
 * object (defense-in-depth XSS layer on top of zod length limits).
 * Numbers/booleans/dates pass through untouched; keys are preserved.
 */
export function sanitizeTrpcInput<T>(input: T, maxLength = 5000): T {
  if (typeof input === "string") return sanitizeUserContent(input, maxLength) as unknown as T;
  if (Array.isArray(input)) return input.map(v => sanitizeTrpcInput(v, maxLength)) as unknown as T;
  if (input && typeof input === "object" && (input as object).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input as Record<string, unknown>)) {
      out[key] = sanitizeTrpcInput((input as Record<string, unknown>)[key], maxLength);
    }
    return out as unknown as T;
  }
  return input;
}

// ---------------------------------------------------------------------------
// Payment webhook signature verification (anti-spoofing).
//
// This codebase currently simulates CMI/bank-transfer payments server-side
// (see server/billing.ts + payments.create in server/routers.ts) and has no
// live Stripe webhook. When a live provider webhook is enabled at
// POST /api/v1/payments/webhook, it MUST:
//   1. mount with express.raw({ type: "application/json" }) BEFORE any
//      express.json() body parser so `req.body` is the exact raw Buffer the
//      provider signed;
//   2. verify the HMAC signature with a timing-safe compare against the
//      provider secret (STRIPE_WEBHOOK_SECRET / CMI secret) and reject any
//      unverified payload instantly with 400;
//   3. sit behind paymentStrictLimiter (5/min/IP).
// verifyWebhookSignature() implements step 2 in a provider-agnostic way so
// the future route handler only needs to pass the raw body + signature.
// ---------------------------------------------------------------------------

export type WebhookVerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyWebhookSignature(input: {
  rawBody: Buffer | string;
  signatureHeader: string | string[] | undefined;
  secret: string | undefined;
}): WebhookVerifyResult {
  const { rawBody, signatureHeader, secret } = input;
  if (!secret) return { ok: false, reason: "webhook_secret_not_configured" };
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature) return { ok: false, reason: "missing_signature" };
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  // Support both `t=` timestamped Stripe-style headers ("t=...,v1=...") and
  // plain hex HMAC digests. The digest is always computed over the raw body.
  // `expectedDigests` holds ONLY server-computed HMACs; the claimed header
  // value is kept separate in `claimedHex` so it can never match itself.
  const expectedDigests: string[] = [];
  const v1Match = /v1=([a-fA-F0-9]+)/.exec(signature);
  const bareHex = signature.trim().toLowerCase();
  // Timestamped payload variant: HMAC(secret, `${t}.${rawBody}`).
  const tMatch = /t=(\d+)/.exec(signature);
  if (tMatch?.[1]) {
    const tsPayload = Buffer.concat([Buffer.from(`${tMatch[1]}.`, "utf8"), body]);
    expectedDigests.push(createHmac("sha256", secret).update(tsPayload).digest("hex"));
  }
  expectedDigests.push(createHmac("sha256", secret).update(body).digest("hex"));
  const claimedHex =
    v1Match?.[1]?.toLowerCase() ?? (/^[a-f0-9]+$/.test(bareHex) ? bareHex : null);
  if (!claimedHex) return { ok: false, reason: "invalid_signature" };
  let claimed: Buffer;
  try {
    claimed = Buffer.from(claimedHex, "hex");
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
  // timingSafeEqual requires equal-length buffers; compare each computed
  // digest against the claimed digest in constant time.
  for (const candidate of Array.from(new Set(expectedDigests))) {
    try {
      const expected = Buffer.from(candidate, "hex");
      if (expected.length !== claimed.length) continue;
      if (timingSafeEqual(expected, claimed)) return { ok: true };
    } catch {
      continue;
    }
  }
  return { ok: false, reason: "invalid_signature" };
}

/** Express handler factory for POST /api/v1/payments/webhook. */
export function createPaymentsWebhookHandler(onVerified: (rawBody: Buffer) => Promise<void> | void) {
  return async (req: Request, res: Response) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? process.env.CMI_WEBHOOK_SECRET;
    const rawBody: Buffer = Buffer.isBuffer((req as unknown as { body: unknown }).body)
      ? ((req as unknown as { body: Buffer }).body)
      : Buffer.from(
          typeof (req as unknown as { body: unknown }).body === "string"
            ? ((req as unknown as { body: string }).body as string)
            : JSON.stringify((req as unknown as { body: unknown }).body ?? ""),
          "utf8"
        );
    const signatureHeader = req.headers["stripe-signature"] ?? req.headers["x-webhook-signature"];
    const check = verifyWebhookSignature({ rawBody, signatureHeader, secret });
    if (!check.ok) {
      res.status(400).json({ error: "Invalid webhook signature." });
      return;
    }
    try {
      await onVerified(rawBody);
    } catch (error) {
      console.error("[Webhook] handler failed", error);
      res.status(400).json({ error: "Webhook processing failed." });
      return;
    }
    res.json({ received: true });
  };
}
