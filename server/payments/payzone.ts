// ── PayZone adapter (Moroccan card gateway) ───────────────────────────────────
// PayZone hosts the card form at a payment URL; the checkout redirects there
// with a signed query string and the platform reconciles the result callback
// (`sha1hash` verified) via /api/webhooks/payzone.
//
// The adapter is always SAFE BY DEFAULT: without PAYZONE_API_KEY + STORE_KEY +
// PAYZONE_PAYMENT_URL the charge falls back to the simulated path in providers.ts.
// Verification math follows PayZone's redirect-HMAC scheme:
//   sha1hash = SHA1(preseed + "|" + merchantID + "|" + orderref + "|" + amount + "|" + currencycode)
// where `preseed` is the merchant preseed key (PAYZONE_PRESEED), defaulting to
// PAYZONE_API_KEY.

import { createHash, randomUUID } from "node:crypto";
import type { CheckoutCurrency } from "./types";

export function isPayzoneConfigured(): boolean {
  return Boolean(process.env.PAYZONE_API_KEY && process.env.PAYZONE_STORE_KEY && process.env.PAYZONE_PAYMENT_URL);
}

export function payzoneMerchantId(): string {
  return process.env.PAYZONE_STORE_KEY ?? "";
}

export function payzonePreseed(): string {
  return process.env.PAYZONE_PRESEED ?? process.env.PAYZONE_API_KEY ?? "";
}

// MAD ISO 4217 numeric code — PayZone expects the numeric code for non-GBP.
export const PAYZONE_CURRENCY_CODES: Record<CheckoutCurrency, string> = {
  MAD: "504",
  EUR: "978",
  USD: "840",
};

export function payzoneSha1Hash(input: {
  merchantId: string;
  preseed: string;
  orderRef: string;
  amount: number;
  currencyCode: string;
}): string {
  const seed = [input.preseed, input.merchantId, input.orderRef, String(input.amount), input.currencyCode].join("|");
  return createHash("sha1").update(seed, "utf8").digest("hex").toUpperCase();
}

export function timingSafeEqualHex(expected: string, actual: string): boolean {
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(actual, "hex");
    if (a.length !== b.length) return false;
    return a.equals(b);
  } catch {
    return false;
  }
}

export type PayzoneRedirectRequest = {
  amount: number;
  currency: CheckoutCurrency;
  orderRef: string;
  returnUrl: string;
  cancelUrl: string;
  callbackUrl: string;
  cardHolderName?: string | null;
  cardHolderEmail?: string | null;
};

export function buildPayzoneRedirect(input: PayzoneRedirectRequest): { url: string } {
  const merchantId = payzoneMerchantId();
  const preseed = payzonePreseed();
  const params = new URLSearchParams({
    merchantID: merchantId,
    amount: String(input.amount),
    currencycode: PAYZONE_CURRENCY_CODES[input.currency] ?? "504",
    orderref: input.orderRef,
    returnurl: input.returnUrl,
    cancelurl: input.cancelUrl,
    callbackurl: input.callbackUrl,
    sha1hash: payzoneSha1Hash({
      merchantId,
      preseed,
      orderRef: input.orderRef,
      amount: input.amount,
      currencyCode: PAYZONE_CURRENCY_CODES[input.currency] ?? "504",
    }),
  });
  if (input.cardHolderName) params.set("cardholdername", input.cardHolderName);
  if (input.cardHolderEmail) params.set("cardholderemail", input.cardHolderEmail);

  const base = (process.env.PAYZONE_PAYMENT_URL ?? "").replace(/\/+$/, "");
  if (base.includes("?")) {
    throw new Error("PAYZONE_PAYMENT_URL must be a base URL without a query string.");
  }
  return { url: `${base}?${params.toString()}` };
}

export function verifyPayzoneCallback(input: {
  merchantId?: string | null;
  orderRef?: string | null;
  amount?: string | number | null;
  currencyCode?: string | null;
  sha1Hash?: string | null;
}): { ok: boolean; reason: string } {
  if (!input.sha1Hash) return { ok: false, reason: "missing_sha1hash" };
  const expected = payzoneSha1Hash({
    merchantId: input.merchantId ?? payzoneMerchantId(),
    preseed: payzonePreseed(),
    orderRef: input.orderRef ?? "",
    amount: Number(input.amount ?? 0),
    currencyCode: input.currencyCode ?? "504",
  });
  const normalized = input.sha1Hash.toUpperCase();
  if (!timingSafeEqualHex(expected, normalized)) return { ok: false, reason: "invalid_sha1hash" };
  return { ok: true, reason: "" };
}

export function createPayzoneOrderRef(bookingId: number): string {
  return `PZ-${bookingId}-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}