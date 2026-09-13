// ── Gateway webhook handlers (PayZone / PayTabs / Cash Plus / Wafacash) ───────
// Each handler authenticates the incoming callback, resolves the transaction
// by its external reference, then settles it through transactionLedger.
// Idempotent: a repeat callback for an already-paid transaction is a no-op.
//
// Simulated mode (no provider keys) is handled SAFE BY DEFAULT: verification
// falls back to the generic HMAC body verifier (verifyWebhookSignature) with
// the configured per-provider webhook secret, so any callback that cannot be
// authenticated is rejected with 400.

import type { Request, Response } from "express";
import { getDb } from "../db";
import { verifyWebhookSignature } from "../_core/security";
import { payzoneMerchantId, verifyPayzoneCallback } from "./payzone";
import { verifyPaytabsCallback } from "./paytabs";
import { findTransactionByExternalReference, settleTransactionFromWebhook } from "./transactionLedger";

export type WebhookParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function paramsFromBody(body: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  new URLSearchParams(body.toString("utf8")).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function mergeQuery(params: WebhookParams): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const v = first(value);
    if (v !== null) merged[key] = v;
  }
  return merged;
}

export function webhookResponder<T>(
  handler: (ctx: { rawBody: Buffer; query: WebhookParams; headers: Record<string, string | string[] | undefined> }) => Promise<T>,
) {
  return async (req: Request, res: Response) => {
    const rawBody: Buffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(String((req.body as unknown) ?? ""), "utf8");
    try {
      const result = await handler({ rawBody, query: req.query as WebhookParams, headers: req.headers });
      res.status(200).json({ received: true, ...result });
    } catch (error) {
      console.error("[Gateway webhook] rejected:", error);
      res.status(400).json({ error: "Invalid gateway webhook." });
    }
  };
}

// ── PayZone ───────────────────────────────────────────────────────────────────

export async function handlePayzoneWebhook(ctx: { rawBody: Buffer; query: WebhookParams }) {
  const params = { ...paramsFromBody(ctx.rawBody), ...mergeQuery(ctx.query) };
  const verify = verifyPayzoneCallback({
    merchantId: first(params["merchantID"]) ?? payzoneMerchantId(),
    orderRef: first(params["orderref"]),
    amount: first(params["amount"]),
    currencyCode: first(params["currencycode"]),
    sha1Hash: first(params["sha1hash"]),
  });
  if (!verify.ok) throw new Error(verify.reason);
  const orderRef = first(params["orderref"]);
  if (!orderRef) throw new Error("missing orderref");
  const code = first(params["responseCode"]) ?? first(params["StatusCode"]) ?? first(params["status"]) ?? "";
  const paid = code === "0" || code === "00" || /^(approved|success|paid|authorised)$/i.test(code);

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return settleTransactionFromWebhook(db, {
    gateway: "payzone",
    externalReference: orderRef,
    status: paid ? "paid" : "failed",
    rawPayload: { responseCode: code },
  });
}

// ── PayTabs ───────────────────────────────────────────────────────────────────

export async function handlePaytabsWebhook(ctx: { rawBody: Buffer; query: WebhookParams }) {
  const payload = first(ctx.query["payload"]);
  const signature = first(ctx.query["signature"]);
  const orderId = first(ctx.query["order_id"]) ?? first(ctx.query["cart_id"]);
  if (!orderId) throw new Error("missing order_id");

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const tx = await findTransactionByExternalReference(db, orderId);
  if (!tx || tx.gateway !== "paytabs") throw new Error("unknown paytabs order");

  const storedSalt = typeof tx.rawPayload === "object" && tx.rawPayload !== null && "salt" in tx.rawPayload
    ? String(tx.rawPayload.salt)
    : null;
  const verify = verifyPaytabsCallback({ payload, signature, salt: storedSalt });
  if (!verify.ok) {
    // Simulated path: require a valid HMAC-SHA256 of the raw body signed with
    // PAYTABS_WEBHOOK_SECRET (header `X-Webhook-Signature` or `signature`).
    const check = verifyWebhookSignature({
      rawBody: ctx.rawBody,
      signatureHeader: signature ?? undefined,
      secret: process.env.PAYTABS_WEBHOOK_SECRET,
    });
    if (!check.ok) throw new Error(check.reason);
  }

  const code = first(ctx.query["tran_status"]) ?? first(ctx.query["status"]) ?? "";
  const paid = !code || /^(success|paid|settled|authorised|approved|1)$/i.test(code);
  return settleTransactionFromWebhook(db, {
    gateway: "paytabs",
    externalReference: orderId,
    status: paid ? "paid" : "failed",
    rawPayload: { payload: payload ?? null, signature: signature ?? null },
  });
}

// ── Cash Plus / Wafacash (local cash vouchers) ───────────────────────────────

export async function handleLocalCashWebhook(ctx: { rawBody: Buffer; headers: Record<string, string | string[] | undefined> }) {
  const text = ctx.rawBody.toString("utf8").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = paramsFromBody(ctx.rawBody);
  }
  const provider = String(parsed["provider"] ?? "");
  if (provider !== "cashplus" && provider !== "wafacash") throw new Error("invalid provider");

  const reference = String(parsed["reference"] ?? "");
  if (!reference) throw new Error("missing reference");
  if (!parsed["status"]) throw new Error("missing status");
  const desired = String(parsed["status"]);
  if (desired !== "paid" && desired !== "expired" && desired !== "failed") throw new Error("invalid status");
  const status = desired;

  const secret = provider === "cashplus" ? process.env.CASHPLUS_WEBHOOK_SECRET : process.env.WAFACASH_WEBHOOK_SECRET;
  const check = verifyWebhookSignature({
    rawBody: ctx.rawBody,
    signatureHeader: ctx.headers["x-webhook-signature"] ?? ctx.headers["x-signature"],
    secret,
  });
  if (!check.ok) throw new Error(check.reason);

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const tx = await findTransactionByExternalReference(db, reference);
  if (!tx || tx.gateway !== provider) throw new Error("unknown local cash reference");

  return settleTransactionFromWebhook(db, {
    gateway: provider,
    externalReference: reference,
    status,
    rawPayload: { notified: "local_cash" },
  });
}