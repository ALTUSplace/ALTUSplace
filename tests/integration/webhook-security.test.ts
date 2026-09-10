import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../../server/_core/security";

describe("webhook signature verification", () => {
  const secret = "whsec_test_secret_key";

  it("verifies a valid plain HMAC-SHA256 signature", () => {
    const rawBody = Buffer.from('{"event":"payment.succeeded"}');
    const crypto = require("node:crypto");
    const expectedDigest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    const result = verifyWebhookSignature({
      rawBody,
      signatureHeader: expectedDigest,
      secret,
    });

    expect(result.ok).toBe(true);
  });

  it("verifies a valid Stripe-style timestamped signature", () => {
    const rawBody = Buffer.from('{"event":"payment.succeeded"}');
    const crypto = require("node:crypto");
    const timestamp = Math.floor(Date.now() / 1000);
    const tsPayload = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), rawBody]);
    const expectedDigest = crypto.createHmac("sha256", secret).update(tsPayload).digest("hex");
    const signatureHeader = `t=${timestamp},v1=${expectedDigest}`;

    const result = verifyWebhookSignature({
      rawBody,
      signatureHeader,
      secret,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const rawBody = Buffer.from('{"event":"payment.succeeded"}');

    const result = verifyWebhookSignature({
      rawBody,
      signatureHeader: "invalidsignature",
      secret,
    });

    expect(result.ok).toBe(false);
  });

  it("rejects when secret is not configured", () => {
    const rawBody = Buffer.from('{"event":"payment.succeeded"}');

    const result = verifyWebhookSignature({
      rawBody,
      signatureHeader: "somesignature",
      secret: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("webhook_secret_not_configured");
    }
  });

  it("rejects when signature header is missing", () => {
    const rawBody = Buffer.from('{"event":"payment.succeeded"}');

    const result = verifyWebhookSignature({
      rawBody,
      signatureHeader: undefined,
      secret,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("missing_signature");
    }
  });

  it("rejects when signature format is invalid", () => {
    const rawBody = Buffer.from('{"event":"payment.succeeded"}');

    const result = verifyWebhookSignature({
      rawBody,
      signatureHeader: "not-a-hex-or-stripe-signature",
      secret,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_signature");
    }
  });

  it("handles string rawBody input", () => {
    const rawBody = '{"event":"payment.succeeded"}';
    const crypto = require("node:crypto");
    const expectedDigest = crypto.createHmac("sha256", secret).update(Buffer.from(rawBody, "utf8")).digest("hex");

    const result = verifyWebhookSignature({
      rawBody,
      signatureHeader: expectedDigest,
      secret,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a signature computed over a different body", () => {
    const rawBody = Buffer.from('{"event":"payment.succeeded"}');
    const differentBody = Buffer.from('{"event":"payment.failed"}');
    const crypto = require("node:crypto");
    const wrongDigest = crypto.createHmac("sha256", secret).update(differentBody).digest("hex");

    const result = verifyWebhookSignature({
      rawBody,
      signatureHeader: wrongDigest,
      secret,
    });

    expect(result.ok).toBe(false);
  });
});
