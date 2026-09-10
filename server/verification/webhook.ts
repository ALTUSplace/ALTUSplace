/**
 * Signed webhook intake for external identity providers (Stripe Identity /
 * Persona). Verifies the `t=...,v1=...` HMAC-SHA256 envelope in constant time,
 * resolves the matching `kyc_submissions` row by `provider_session_id`, and
 * propagates the outcome to `users.kyc_verification_status`.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { kycSubmissions, users } from "../../drizzle/schema";
import type { KycDb } from "./eligibility";
import type { VerificationProviderName } from "./provider";

export const VERIFICATION_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

type SignatureEnvelope = { t: string; v1: string };

export function parseSignatureHeader(header: string | undefined | null): SignatureEnvelope | null {
  if (!header) return null;
  const parts = header.split(",").map((part) => part.trim());
  const t = parts.find((part) => part.startsWith("t="))?.slice(2);
  const v1 = parts.find((part) => part.startsWith("v1="))?.slice(3);
  if (!t || !v1) return null;
  return { t, v1 };
}

export function isSignatureFresh(timestamp: string, now: number = Date.now()): boolean {
  const parsed = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(parsed)) return false;
  const ageSeconds = Math.abs(now / 1000 - parsed);
  return ageSeconds <= VERIFICATION_WEBHOOK_TOLERANCE_SECONDS;
}

export function verifyWebhookSignature(input: {
  rawBody: string;
  header: string | undefined | null;
  secret: string;
  now?: number;
}): boolean {
  const envelope = parseSignatureHeader(input.header);
  if (!envelope) return false;
  if (!isSignatureFresh(envelope.t, input.now)) return false;
  const expected = createHmac("sha256", input.secret).update(`${envelope.t}.${input.rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(envelope.v1, "utf8");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export type VerificationWebhookOutcome = {
  handled: boolean;
  sessionId: string | null;
  result: "verified" | "rejected" | null;
  message: string;
};

/** Maps provider event names to a resolution. Unknown events are acknowledged, not acted on. */
export function resolveProviderEvent(provider: VerificationProviderName, eventType: string): "verified" | "rejected" | null {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("verified") || normalized.includes("approved") || normalized.includes("succeeded")) {
    return "verified";
  }
  if (normalized.includes("canceled") || normalized.includes("cancelled")) {
    return null; // user abandoned the flow — keep the submission pending
  }
  if (normalized.includes("failed") || normalized.includes("declined") || normalized.includes("rejected") || normalized.includes("expired")) {
    return "rejected";
  }
  if (provider === "stripe_identity" && normalized.includes("requires_input")) {
    return "rejected";
  }
  return null;
}

function extractSessionId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const nested = (data as { object?: unknown }).object;
  for (const candidate of [nested, data]) {
    if (candidate && typeof candidate === "object") {
      const id = (candidate as { id?: unknown }).id;
      if (typeof id === "string" && id.length > 0 && id.length <= 128) return id;
    }
  }
  return null;
}

function extractEventType(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const type = (payload as { type?: unknown }).type;
  const event = (payload as { event?: unknown }).event;
  return typeof type === "string" ? type : typeof event === "string" ? event : "";
}

/**
 * Applies a verified webhook payload to the database. Returns whether an
 * identity submission was transitioned and the outcome applied.
 */
export async function applyVerificationWebhook(input: {
  db: KycDb;
  provider: VerificationProviderName;
  rawBody: string;
}): Promise<VerificationWebhookOutcome> {
  const db = input.db;
  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return { handled: false, sessionId: null, result: null, message: "Invalid JSON payload." };
  }

  const sessionId = extractSessionId(payload);
  if (!sessionId) {
    return { handled: false, sessionId: null, result: null, message: "No session id in payload." };
  }
  const result = resolveProviderEvent(input.provider, extractEventType(payload));
  if (!result) {
    return { handled: true, sessionId, result: null, message: "Event ignored." };
  }

  const [submission] = await db
    .select({ id: kycSubmissions.id, userId: kycSubmissions.userId, status: kycSubmissions.status })
    .from(kycSubmissions)
    .where(and(eq(kycSubmissions.providerSessionId, sessionId), eq(kycSubmissions.provider, input.provider)))
    .limit(1);
  if (!submission) {
    return { handled: false, sessionId, result, message: "No matching verification submission." };
  }
  if (submission.status !== "Pending") {
    return { handled: true, sessionId, result, message: "Submission already resolved." };
  }

  const submissionStatus = result === "verified" ? "Approved" as const : "Rejected" as const;
  const userStatus = result === "verified" ? "verified" : "rejected";
  await db.update(kycSubmissions).set({
    status: submissionStatus,
    reviewedAt: new Date(),
    rejectionReason: submissionStatus === "Rejected" ? "فشل التحقق الآلي من الهوية." : null,
  }).where(eq(kycSubmissions.id, submission.id));
  await db.update(users).set({
    kycVerificationStatus: userStatus,
    ...(result === "verified" ? { kycVerifiedAt: new Date() } : {}),
  }).where(eq(users.id, submission.userId));

  return { handled: true, sessionId, result, message: "Submission resolved." };
}

/**
 * Express handler factory — mirrors `createPaymentsWebhookHandler`: raw body,
 * HMAC signature verification (Stripe/Persona envelope), then resolution.
 * Unverified or unconfigured webhooks are rejected without touching the DB.
 */
export function createVerificationWebhookHandler(options: {
  getSecret: () => string;
  getProvider: () => VerificationProviderName;
}) {
  return async (req: import("express").Request, res: import("express").Response) => {
    const secret = options.getSecret();
    if (!secret) {
      res.status(503).json({ error: "Verification webhook is not configured." });
      return;
    }
    const rawBody = typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : "";
    const header = (req.headers["stripe-signature"] ?? req.headers["persona-signature"]) as string | undefined;
    if (!verifyWebhookSignature({ rawBody, header, secret })) {
      res.status(400).json({ error: "Invalid webhook signature." });
      return;
    }
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "Database unavailable." });
      return;
    }
    const outcome = await applyVerificationWebhook({ db, provider: options.getProvider(), rawBody });
    res.json(outcome);
  };
}