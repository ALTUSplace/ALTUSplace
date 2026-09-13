// ── PayTabs adapter (regional cards in MAD) ───────────────────────────────────
// PayTabs hosts the card form and returns a redirect_url + tran_ref + salt.
// The platform records the salt on the transaction so the callback signature
// (HMAC-SHA256 over the `payload` with the per-transaction salt) can be
// re-verified on /api/webhooks/paytabs.
//
// SAFE BY DEFAULT: without PAYTABS_SERVER_KEY + PAYTABS_PROFILE_ID +
// PAYTABS_BASE_URL the charge falls back to the simulated path in providers.ts.

import { createHmac } from "node:crypto";
import { timingSafeEqualHex } from "./payzone";
import type { CheckoutCurrency } from "./types";

export function isPaytabsConfigured(): boolean {
  return Boolean(process.env.PAYTABS_SERVER_KEY && process.env.PAYTABS_PROFILE_ID && process.env.PAYTABS_BASE_URL);
}

export function paytabsBaseUrl(): string {
  return (process.env.PAYTABS_BASE_URL ?? "https://secure.paytabs.sa").replace(/\/+$/, "");
}

export type PaytabsTransactionRequest = {
  amount: number;
  currency: CheckoutCurrency;
  orderId: string;
  returnUrl: string;
  callbackUrl: string;
  customer: { name?: string | null; email?: string | null };
};

export type PaytabsTransactionResult = {
  redirectUrl: string;
  tranRef: string;
  salt: string;
};

export async function createPaytabsTransaction(input: PaytabsTransactionRequest): Promise<PaytabsTransactionResult> {
  const serverKey = process.env.PAYTABS_SERVER_KEY;
  const profileId = Number(process.env.PAYTABS_PROFILE_ID ?? 0);
  if (!serverKey || !profileId) {
    throw new Error("PAYTABS_SERVER_KEY and PAYTABS_PROFILE_ID must be configured for a real PayTabs charge.");
  }

  const payload = {
    profile_id: profileId,
    tran_type: "sale",
    tran_class: "ecom",
    cart_id: input.orderId,
    cart_currency: input.currency === "MAD" ? "MAD" : input.currency,
    cart_amount: input.amount.toFixed(2),
    cart_description: `ALTUSplace booking ${input.orderId}`,
    customer_details: {
      name: input.customer.name ?? "ALTUSplace Renter",
      email: input.customer.email ?? undefined,
      phone: "",
    },
    order_id: input.orderId,
    return: input.returnUrl,
    callback: input.callbackUrl,
  };

  const res = await fetch(`${paytabsBaseUrl()}/payment/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`PayTabs /payment/request failed with HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { redirect_url?: string; tran_ref?: string; salt?: string; message?: string };
  if (!data.redirect_url || !data.tran_ref) {
    throw new Error(`PayTabs did not return a redirect URL: ${data.message ?? "unknown provider error"}`);
  }
  return {
    redirectUrl: data.redirect_url,
    tranRef: data.tran_ref,
    salt: data.salt ?? "",
  };
}

/** Verifies the PayTabs callback with the per-transaction salt (HS256). */
export function verifyPaytabsCallback(input: {
  payload?: string | null;
  signature?: string | null;
  salt?: string | null;
}): { ok: boolean; reason: string } {
  // Real path: signature = HMAC-SHA256(payload, salt)
  if (input.payload && input.signature && input.salt) {
    const expected = createHmac("sha256", input.salt).update(input.payload, "utf8").digest("hex");
    const claimed = input.signature.toLowerCase();
    if (timingSafeEqualHex(expected, claimed)) return { ok: true, reason: "" };
    return { ok: false, reason: "invalid_signature" };
  }
  // Without the per-transaction salt the caller can fall back to the generic
  // HMAC body verifier (verifyWebhookSignature) for the simulated path.
  return { ok: false, reason: "salt_required" };
}

export function createPaytabsOrderId(bookingId: number): string {
  return `PT-${bookingId}-${Date.now()}`;
}