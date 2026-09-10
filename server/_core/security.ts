import type { Express, NextFunction, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

type RateLimitOptions = { windowMs: number; max: number; message?: string };
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || req.ip || "unknown";
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function pruneBuckets(now: number): void {
  if (buckets.size < 5000) return;
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) buckets.delete(key);
  });
}

/** Sliding-window in-memory rate limiter (no extra dependency). */
export function createRateLimiter(options: RateLimitOptions & { namespace?: string }) {
  const { windowMs, max } = options;
  const message = options.message ?? "Too many requests, try again later.";
  const namespace = options.namespace ?? `rl:${max}:${windowMs}`;

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS" || req.path === "/api/health") return next();
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

/** Sensitive endpoints: max 100 req / 15 min / IP (anti-DDoS/brute-force). */
export const sensitiveApiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Rate limit exceeded (100 requests per 15 minutes).",
});

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

/**
 * Route-aware dispatcher: tRPC batches every procedure through
 * POST /api/trpc[/<procedure>], so inspect the URL + `batch` query for the
 * procedure name. Legacy REST (/api/auth/*, /api/bookings, /api/payments*)
 * is matched directly. Strict buckets run BEFORE the global bucket so a
 * brute-force burst is stopped at 5/min even though the global budget is 100.
 */
function matchesTrpcProcedure(req: Request, names: string[]): boolean {
  const url = `${req.path}${typeof req.url === "string" ? req.url.slice(req.path.length) : ""}`;
  const haystack = `${req.path} ${req.originalUrl} ${url}`.toLowerCase();
  return names.some(n => haystack.includes(n.toLowerCase()));
}

export function strictRateLimitDispatcher(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS" || req.path === "/api/health") return next();
  const p = req.path.toLowerCase();

  const isAuth =
    p.startsWith("/api/auth/") ||
    p.startsWith("/api/oauth/") ||
    matchesTrpcProcedure(req, ["auth.", "auth/"]) ||
    (p.startsWith("/api/trpc/auth") );
  // tRPC auth surface: auth.me / auth.logout / auth.updateProfile are read-heavy;
  // the login itself happens at /api/oauth/callback which is covered above.

  const isBooking =
    p.startsWith("/api/bookings") ||
    matchesTrpcProcedure(req, ["bookings.", "booking"]) ||
    (p.startsWith("/api/trpc/bookings") || p.startsWith("/api/trpc/messages"));

  const isPayment =
    p.startsWith("/api/payments") ||
    p.startsWith("/api/v1/payments") ||
    matchesTrpcProcedure(req, ["payments.", "payment", "invoices.", "refunds."]) ||
    p.startsWith("/api/trpc/payments") ||
    p.startsWith("/api/trpc/invoices") ||
    p.startsWith("/api/trpc/refunds");

  if (isPayment) return paymentStrictLimiter(req, res, next);
  if (isBooking) return bookingStrictLimiter(req, res, next);
  if (isAuth) return authStrictLimiter(req, res, next);
  return next();
}
/** Helmet-equivalent secure headers (compatible with Maps + Vite HMR). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self), payment=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; object-src 'none'; " +
      "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com https://www.google.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "img-src 'self' data: blob: https: http:; " +
      "connect-src 'self' https: wss: ws:; " +
      "frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
  );
  res.removeHeader("X-Powered-By");
  next();
}

/** CSRF origin guard for state-changing /api/* requests. */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  if (!req.path.startsWith("/api/")) return next();
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
  // Strict per-surface buckets FIRST (5/min for auth/booking/payment),
  // then the global budget (100/15min) for standard read queries.
  app.use("/api/", strictRateLimitDispatcher);
  app.use("/api/", sensitiveApiLimiter);
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
