// ── Stripe Connect Service ────────────────────────────────────────────────────
// Provides Stripe Connect split-payment capabilities for multi-vendor payouts.
// All functions gracefully degrade when STRIPE_SECRET_KEY is not configured.

let _stripe: any = null;

function getStripe(): any {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    // Dynamic import so the stripe package is optional at install time
    try {
      const Stripe = require("stripe");
      _stripe = new Stripe(key, { apiVersion: "2024-06-20" });
    } catch {
      throw new Error("stripe package not installed. Run: pnpm add stripe");
    }
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export async function createConnectAccount(userId: number, email: string): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    country: "MA",
    email,
    metadata: { userId: String(userId) },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
  });
  return account.id;
}

export async function createAccountLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

export async function createPaymentIntent(amount: number, currency: string, applicationFee: number, transferAccountId: string, metadata: Record<string, string>): Promise<string> {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: currency.toLowerCase(),
    application_fee_amount: Math.round(applicationFee * 100),
    transfer_data: { destination: transferAccountId },
    automatic_payment_methods: { enabled: true },
    metadata,
  });
  return intent.client_secret ?? "";
}

export async function createTransfer(amount: number, currency: string, destinationAccountId: string, metadata: Record<string, string>): Promise<string> {
  const stripe = getStripe();
  const transfer = await stripe.transfers.create({
    amount: Math.round(amount * 100),
    currency: currency.toLowerCase(),
    destination: destinationAccountId,
    metadata,
  });
  return transfer.id;
}

export function verifyWebhookEvent(payload: string | Buffer, signature: string, secret: string): any {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, secret);
}