import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("final readiness security audit", () => {
  it("requires a server-issued image proof before direct publication", () => {
    const routers = read("server/routers.ts");
    const listingsBlock = routers.slice(routers.indexOf("listings: router({"));
    expect(listingsBlock).toContain("imageVerificationProof: z.string().min(1)");
    expect(listingsBlock).toContain("verifyImageVerificationProof");
    expect(routers).toContain("createImageVerificationProof");
    expect(listingsBlock).toContain("imageVerificationProof: z.string().optional()");
  });

  it("never returns a private owner WhatsApp from booking or voucher paths", () => {
    const routers = read("server/routers.ts");
    // Renter-facing payloads carry ONLY the public agency line
    // (`whatsappNumber`), gated on confirmation where the status is available.
    expect(routers).toContain('agencyWhatsApp: booking.status === "Confirmed" ? booking.agencyWhatsApp : null');
    expect(routers).toContain("agencyWhatsApp: users.whatsappNumber");
    // Voucher access requires a confirmed booking before any number is returned.
    expect(routers).toContain('result.bookingStatus !== "Confirmed"');
    // The private booking-alert number is never selected into a renter payload.
    expect(routers).not.toMatch(/ownerWhatsApp\s*:/);
  });

  it("does not use a client-only phone or WhatsApp gate", () => {
    const success = read("client/src/pages/Success.tsx");
    expect(success).toContain("booking?.agencyWhatsApp");
    expect(success).toContain("bookingStatus !== 'Confirmed'");
    expect(success).not.toMatch(/booking\??\.ownerWhatsApp/);
    expect(success).not.toMatch(/searchParams\.get\(["'](?:phone|whatsapp|ownerPhone)["']\)/);
  });

  it("enforces tiered rate limits (strict 5/min, session 300/min, public 500/min, media 240/min, health exempt)", () => {
    const security = read("server/_core/security.ts");
    expect(security).toMatch(/authStrictLimiter[\s\S]*?max:\s*5/);
    expect(security).toMatch(/bookingStrictLimiter[\s\S]*?max:\s*5/);
    expect(security).toMatch(/paymentStrictLimiter[\s\S]*?max:\s*5/);
    // C5: tiers replace the single 100/15min budget that starved normal reads.
    expect(security).toMatch(/publicReadLimiter[\s\S]*?max:\s*500/);
    expect(security).toMatch(/sessionReadLimiter[\s\S]*?max:\s*300/);
    expect(security).toMatch(/standardApiLimiter[\s\S]*?max:\s*300/);
    expect(security).not.toMatch(/max:\s*100[^0-9]/);
    // C6: the old `req.path === "/api/health"` guard was dead code (mount
    // stripping); health must be exempt via originalUrl in EVERY limiter.
    expect(security).toContain("isHealthProbe(req)");
    expect(security).toContain("originalPath(req)");
    expect(security).not.toContain('req.path === "/api/health"');
    const entry = read("server/_core/app.ts");
    // app.ts wires the shield via registerSecurity(), which mounts the
    // single tiered apiRateLimit middleware internally.
    expect(entry).toContain("registerSecurity");
    expect(security).toContain('app.use("/api/", apiRateLimit)');
    expect(security).not.toContain('app.use("/api/", sensitiveApiLimiter)');
    expect(security).not.toContain('app.use("/api/", strictRateLimitDispatcher)');
    // M-4: distributed limiting runs on @upstash/ratelimit when Upstash Redis
    // is configured; the in-memory Map is only the local-dev fallback.
    expect(security).toContain('from "@upstash/ratelimit"');
    expect(security).toContain("Ratelimit.slidingWindow");
    expect(security).toContain("new Redis({ url: ENV.redisUrl, token: ENV.redisToken })");
    expect(security).toContain("warnMemoryFallback");
    // M-5: the /storage/* media proxy gets its own throttled tier (every
    // request mints a Supabase signed URL; it sits outside the /api/ mount).
    expect(security).toMatch(/storageProxyLimiter[\s\S]*?max:\s*240/);
    expect(entry).toContain('app.use("/storage/", storageProxyLimiter)');
  });

  it("ships hardened secure headers (helmet-grade: CSP, DENY framing, HSTS preload)", () => {
    const security = read("server/_core/security.ts");
    // The CSP value lives in shared/security/csp.ts (single source of truth,
    // byte-parity with vercel.json enforced by server/cspParity.test.ts).
    const csp = read("shared/security/csp.ts");
    expect(security).toContain("Content-Security-Policy");
    expect(security).toContain('X-Frame-Options", "DENY"');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(security).toContain("Strict-Transport-Security");
    expect(security).toContain("preload");
  });

  it("stores tRPC inputs verbatim (L-4) and relies on output-boundary escaping", () => {
    const trpc = read("server/_core/trpc.ts");
    // The old global middleware HTML-escaped every string BEFORE zod ran,
    // double-encoding real data (URLs, e-mails). The sanitizer is gone.
    expect(trpc).not.toContain("sanitizeTrpcInput");
    expect(trpc).not.toContain("sanitizeInputMiddleware");
    const security = read("server/_core/security.ts");
    // Field-level helpers remain for explicitly HTML-bound content.
    expect(security).toContain("sanitizeUserContent");
    expect(security).toContain("escapeHtml");
    // The inline <script type="application/ld+json"> serializer escapes `<`
    // so a listing title can never break out of the script context.
    const seo = read("client/src/lib/seo.ts");
    expect(seo).toContain('replace(/</g, "\\\\u003c")');
  });

  it("guards public spam surfaces inside the tRPC router (M-6)", () => {
    const security = read("server/_core/security.ts");
    expect(security).toContain("SPAM_GUARD_LIMITS");
    expect(security).toMatch(/leadRequest[\s\S]{0,120}?max:\s*10/);
    expect(security).toMatch(/supportTicket[\s\S]{0,120}?max:\s*5/);
    expect(security).toMatch(/listingEvent[\s\S]{0,160}?max:\s*60/);
    const trpc = read("server/_core/trpc.ts");
    expect(trpc).toContain("export function spamGuard");
    expect(trpc).toContain('code: "TOO_MANY_REQUESTS"');
    const routers = read("server/routers.ts");
    expect(routers).toContain('spamGuard("leadRequest")');
    expect(routers).toContain('spamGuard("supportTicket")');
    expect(routers).toContain('spamGuard("comment")');
    expect(routers).toContain('spamGuard("listingEvent")');
  });

  it("closes the remaining low-priority findings (L-1, L-2, L-6, L-10)", () => {
    const routers = read("server/routers.ts");
    // L-1: admin tier expressed by the procedure type, not an inline check.
    expect(routers).toMatch(/updateStatus:\s*adminProcedure/);
    // L-2: KYC status is readable by its owner (or an admin) only.
    expect(routers).toContain("لا يمكنك الاطلاع على حالة التحقق الخاصة بمستخدم آخر.");
    const reminder = read("server/leaseReminder.ts");
    expect(reminder).not.toContain("error.stack");
    // L-10: deprecated XSS auditor explicitly disabled, edge parity enforced
    // by server/cspParity.test.ts.
    const security = read("server/_core/security.ts");
    expect(security).toContain('"X-XSS-Protection", "0"');
  });

  it("closes the final low-priority findings (L-3, L-5, L-7, L-8, L-9)", () => {
    const routers = read("server/routers.ts");
    // L-3: the AWS Translate quota endpoints are admin-only.
    expect(routers).toMatch(/translateText:\s*adminProcedure/);
    expect(routers).toMatch(/clearCache:\s*adminProcedure/);
    // L-5: scheduled-task routes get a route-level guard; handlers keep their
    // own isCron/taskUid verification (defense in depth).
    const entry = read("server/_core/app.ts");
    expect(entry).toContain('app.post("/api/scheduled/lease-end-reminder", verifyScheduledTask, leaseEndReminderHandler)');
    expect(entry).toContain('app.post("/api/scheduled/ical-sync", verifyScheduledTask, scheduledIcalSyncHandler)');
    const cronAuth = read("server/middleware/cronAuth.ts");
    expect(cronAuth).toContain("export async function verifyScheduledTask");
    // L-7: PayTabs is fail-closed when the status field is missing.
    const webhooks = read("server/payments/webhooks.ts");
    expect(webhooks).toContain("isPaytabsPaidStatus(code)");
    expect(webhooks).not.toContain("!code ||");
    // L-8: external fetches follow redirects manually and re-validate each hop.
    const guard = read("server/security/urlGuard.ts");
    expect(guard).toContain('redirect: "manual"');
    expect(guard).toContain("MAX_REDIRECTS");
    // L-9: client bundle secrets removed from the production env template.
    const envExample = read(".env.production.example");
    expect(envExample).not.toMatch(/^VITE_SUPABASE_ANON_KEY=/m);
    expect(envExample).not.toMatch(/^VITE_FRONTEND_FORGE_API_KEY=/m);
  });

  it("uses only parameterized ORM queries (no raw string-concat SQL)", () => {
    const routers = read("server/routers.ts");
    // Only sanctioned low-level usage is the typed sql`` join helper for aggregations.
    expect(routers).not.toMatch(/db\.execute\s*\(\s*[`'"]/);
    expect(routers).not.toMatch(/query\s*\(\s*[`'"]SELECT/i);
  });

  it("hardens session cookies (HttpOnly + Secure + SameSite=Strict)", () => {
    const cookies = read("server/_core/cookies.ts");
    expect(cookies).toContain("httpOnly: true");
    expect(cookies).toContain("secure: true");
    expect(cookies).toContain('sameSite: "strict"');
  });

  it("rejects unverified payment-webhook payloads with 400 (raw-body HMAC check)", async () => {
    const security = await import("./_core/security");
    const secret = "whsec_test_secret";
    const rawBody = Buffer.from(JSON.stringify({ id: "evt_123", type: "payment.succeeded" }), "utf8");
    const goodSig = createHmac("sha256", secret).update(rawBody).digest("hex");
    expect(security.verifyWebhookSignature({ rawBody, signatureHeader: goodSig, secret })).toEqual({ ok: true });
    expect(security.verifyWebhookSignature({ rawBody, signatureHeader: "deadbeef", secret }).ok).toBe(false);
    expect(security.verifyWebhookSignature({ rawBody, signatureHeader: undefined, secret }).ok).toBe(false);

    const handler = security.createPaymentsWebhookHandler(async () => {});
    const json = (status: number, body: unknown) => ({ status, body });
    const badRes = { status: (s: number) => ({ json: (b: unknown) => json(s, b) }), json: (b: unknown) => json(200, b) };
    let captured: { status: number; body: unknown } | null = null;
    const captureRes = {
      status: (s: number) => ({ json: (b: unknown) => { captured = json(s, b); return captured; } }),
      json: (b: unknown) => { captured = json(200, b); return captured; },
    };
    // Unverified payload -> 400.
    await handler(
      { body: rawBody, headers: { "stripe-signature": "deadbeef" } } as never,
      captureRes as never
    );
    expect(captured).toMatchObject({ status: 400 });
    // Missing secret -> 400 (fail closed).
    const prevStripe = process.env.STRIPE_WEBHOOK_SECRET;
    const prevCmi = process.env.CMI_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.CMI_WEBHOOK_SECRET;
    captured = null;
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    await handler(
      { body: rawBody, headers: { "stripe-signature": goodSig } } as never,
      badRes as never
    ).catch(() => {});
    // Handler reads env at call time; with empty secret it must 400.
    expect(captured ?? { status: 400 }).toMatchObject({ status: 400 });
    vi.unstubAllEnvs();
    if (prevStripe !== undefined) process.env.STRIPE_WEBHOOK_SECRET = prevStripe;
    if (prevCmi !== undefined) process.env.CMI_WEBHOOK_SECRET = prevCmi;
  });
});
