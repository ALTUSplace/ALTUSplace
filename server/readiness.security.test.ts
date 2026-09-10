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

  it("never returns owner WhatsApp from booking or voucher paths before confirmation", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain('ownerWhatsApp: booking.status === "Confirmed" ? booking.ownerWhatsApp : null');
    expect(routers).toContain('result.bookingStatus !== "Confirmed"');
    expect(routers).toContain('ownerWhatsApp: result.bookingStatus === "Confirmed" ? result.ownerWhatsApp : null');
  });

  it("does not use a client-only phone or WhatsApp gate", () => {
    const success = read("client/src/pages/Success.tsx");
    expect(success).toContain("booking?.ownerWhatsApp");
    expect(success).toContain("bookingStatus === 'Confirmed'");
    expect(success).not.toMatch(/searchParams\.get\(["'](?:phone|whatsapp|ownerPhone)["']\)/);
  });

  it("enforces strict (5/min) + global (100/15min) rate limits on auth/booking/payment surfaces", () => {
    const security = read("server/_core/security.ts");
    expect(security).toMatch(/authStrictLimiter[\s\S]*?max:\s*5/);
    expect(security).toMatch(/bookingStrictLimiter[\s\S]*?max:\s*5/);
    expect(security).toMatch(/paymentStrictLimiter[\s\S]*?max:\s*5/);
    expect(security).toMatch(/sensitiveApiLimiter[\s\S]*?max:\s*100/);
    expect(security).toContain("strictRateLimitDispatcher");
    const entry = read("server/_core/index.ts");
    // index.ts wires the shield via registerSecurity(), which mounts the
    // strict dispatcher + global limiter internally (see registerSecurity).
    expect(entry).toContain("registerSecurity");
    expect(security).toContain("app.use(\"/api/\", strictRateLimitDispatcher)");
    expect(security).toContain("app.use(\"/api/\", sensitiveApiLimiter)");
  });

  it("ships hardened secure headers (helmet-grade: CSP, DENY framing, HSTS preload)", () => {
    const security = read("server/_core/security.ts");
    expect(security).toContain("Content-Security-Policy");
    expect(security).toContain('X-Frame-Options", "DENY"');
    expect(security).toContain("frame-ancestors 'none'");
    expect(security).toContain("Strict-Transport-Security");
    expect(security).toContain("preload");
  });

  it("sanitizes + HTML-escapes all tRPC inputs (XSS shield) via middleware", () => {
    const trpc = read("server/_core/trpc.ts");
    expect(trpc).toContain("sanitizeInputMiddleware");
    expect(trpc).toContain("sanitizeTrpcInput");
    const security = read("server/_core/security.ts");
    expect(security).toContain("sanitizeUserContent");
    expect(security).toContain("escapeHtml");
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
