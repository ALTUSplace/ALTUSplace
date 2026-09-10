import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  applyVerificationWebhook,
  isSignatureFresh,
  parseSignatureHeader,
  resolveProviderEvent,
  verifyWebhookSignature,
} from "./webhook";

const secret = "whsec_test_secret";
const nowSeconds = Math.floor(Date.now() / 1000);

function signedPayload(body: string, timestamp: number = nowSeconds, key: string = secret) {
  const signature = createHmac("sha256", key).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("verification webhook signature", () => {
  it("parses t/v1 envelopes", () => {
    expect(parseSignatureHeader(`t=123,v1=abc`)).toEqual({ t: "123", v1: "abc" });
    expect(parseSignatureHeader(undefined)).toBeNull();
    expect(parseSignatureHeader("v1=abc")).toBeNull();
  });

  it("rejects stale timestamps", () => {
    expect(isSignatureFresh(String(nowSeconds))).toBe(true);
    expect(isSignatureFresh(String(nowSeconds - 3600))).toBe(false);
    expect(isSignatureFresh("not-a-number")).toBe(false);
  });

  it("accepts a valid signature and rejects tampered payloads", () => {
    const body = JSON.stringify({ type: "identity.verification_session.verified", data: { object: { id: "vs_123" } } });
    expect(verifyWebhookSignature({ rawBody: body, header: signedPayload(body), secret })).toBe(true);
    expect(verifyWebhookSignature({ rawBody: body + " ", header: signedPayload(body), secret })).toBe(false);
    expect(verifyWebhookSignature({ rawBody: body, header: signedPayload(body, nowSeconds, "wrong"), secret })).toBe(false);
  });
});

describe("provider event mapping", () => {
  it("maps verified/approved events", () => {
    expect(resolveProviderEvent("stripe_identity", "identity.verification_session.verified")).toBe("verified");
    expect(resolveProviderEvent("persona", "inquiry.approved")).toBe("verified");
  });

  it("maps declined/failed events and ignores cancellations", () => {
    expect(resolveProviderEvent("persona", "inquiry.declined")).toBe("rejected");
    expect(resolveProviderEvent("stripe_identity", "identity.verification_session.canceled")).toBeNull();
    expect(resolveProviderEvent("stripe_identity", "unknown.event")).toBeNull();
  });
});

describe("applyVerificationWebhook", () => {
  const submission = { id: 3, userId: 7, status: "Pending" };
  function dbWith(rows: unknown[]) {
    const local = {
      from: () => local,
      where: () => local,
      orderBy: () => local,
      limit: () => Promise.resolve(rows),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    };
    return { select: () => local, update: () => ({ set: () => ({ where: () => Promise.resolve() }) }) } as never;
  }

  it("resolves a pending submission to verified", async () => {
    void submission;
    const outcome = await applyVerificationWebhook({
      db: dbWith([{ id: 3, userId: 7, status: "Pending" }]),
      provider: "stripe_identity",
      rawBody: JSON.stringify({ type: "identity.verification_session.verified", data: { object: { id: "vs_123" } } }),
    });
    expect(outcome.handled).toBe(true);
    expect(outcome.result).toBe("verified");
  });

  it("ignores payloads without a session id", async () => {
    const outcome = await applyVerificationWebhook({
      db: dbWith([]),
      provider: "persona",
      rawBody: JSON.stringify({ type: "inquiry.approved" }),
    });
    expect(outcome.handled).toBe(false);
  });
});