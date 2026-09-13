// ── Payment Gateway Abstraction ──────────────────────────────────────────────
// Provides a registry of supported checkout methods and a simulated charge
// intent that mirrors the real Stripe Connect flow. When STRIPE_SECRET_KEY is
// configured the Stripe adapter is invoked; otherwise every gateway degrades
// to a deterministic simulation (status + prefixed reference) so the entire
// booking → payment → invoice → escrow pipeline works in dev.

import { randomUUID } from "node:crypto";
import { isStripeConfigured, createCheckoutCharge } from "../stripe";
import type { CheckoutCurrency } from "./types";

// ── Types ────────────────────────────────────────────────────────────────────
export type GatewayCode = "cmi_card" | "stripe_card" | "paypal" | "bank_transfer" | "payzone" | "paytabs" | "cashplus" | "wafacash" | "arrival";
export const GATEWAY_CODES: readonly GatewayCode[] = [
  "cmi_card", "stripe_card", "paypal", "bank_transfer",
  "payzone", "paytabs", "cashplus", "wafacash", "arrival",
] as const;

export type GatewayDefinition = {
  code: GatewayCode;
  labelAr: string;
  labelFr: string;
  labelEn: string;
  supportedCurrencies: readonly CheckoutCurrency[];
  /** True when the provider settles the charge immediately. */
  instant: boolean;
  /** True for non-Moroccan, cross-border providers. */
  international: boolean;
};

export const GATEWAYS: Record<GatewayCode, GatewayDefinition> = {
  cmi_card: {
    code: "cmi_card",
    supportedCurrencies: ["MAD", "EUR", "USD"],
    instant: true,
    international: false,
    labelAr: "بطاقة بنكية CMI",
    labelFr: "Carte bancaire CMI",
    labelEn: "CMI Bank Card",
  },
  stripe_card: {
    code: "stripe_card",
    supportedCurrencies: ["MAD", "EUR", "USD"],
    instant: true,
    international: true,
    labelAr: "Stripe (بطاقة دولية)",
    labelFr: "Stripe (carte internationale)",
    labelEn: "Stripe (International Card)",
  },
  paypal: {
    code: "paypal",
    supportedCurrencies: ["EUR", "USD"],
    instant: true,
    international: true,
    labelAr: "PayPal",
    labelFr: "PayPal",
    labelEn: "PayPal",
  },
  bank_transfer: {
    code: "bank_transfer",
    supportedCurrencies: ["MAD"],
    instant: false,
    international: false,
    labelAr: "تحويل بنكي (RIB)",
    labelFr: "Virement bancaire (RIB)",
    labelEn: "Bank Transfer (RIB)",
  },
  payzone: {
    code: "payzone",
    supportedCurrencies: ["MAD", "EUR", "USD"],
    instant: true,
    international: false,
    labelAr: "البطاقة البنكية السريعة (PayZone)",
    labelFr: "Carte bancaire rapide (PayZone)",
    labelEn: "Fast Bank Card (PayZone)",
  },
  paytabs: {
    code: "paytabs",
    supportedCurrencies: ["MAD"],
    instant: true,
    international: false,
    labelAr: "بطاقات PayTabs المحلية",
    labelFr: "Cartes PayTabs locales",
    labelEn: "Local Cards via PayTabs",
  },
  cashplus: {
    code: "cashplus",
    supportedCurrencies: ["MAD"],
    instant: false,
    international: false,
    labelAr: "الأداء نقداً عبر Cash Plus",
    labelFr: "Paiement en espèces via Cash Plus",
    labelEn: "Cash at Cash Plus",
  },
  wafacash: {
    code: "wafacash",
    supportedCurrencies: ["MAD"],
    instant: false,
    international: false,
    labelAr: "الأداء نقداً عبر Wafacash",
    labelFr: "Paiement en espèces via Wafacash",
    labelEn: "Cash at Wafacash",
  },
  arrival: {
    code: "arrival",
    supportedCurrencies: ["MAD"],
    instant: false,
    international: false,
    labelAr: "الدفع عند الاستلام (Pay on Arrival)",
    labelFr: "Paiement à la réception",
    labelEn: "Pay on Arrival",
  },
};

export function gatewaySupportsCurrency(gateway: GatewayCode, currency: CheckoutCurrency): boolean {
  return GATEWAYS[gateway].supportedCurrencies.includes(currency);
}

export function gatewaysForCurrency(currency: CheckoutCurrency): GatewayCode[] {
  return GATEWAY_CODES.filter((g) => gatewaySupportsCurrency(g, currency));
}

// ── Charge Intent ─────────────────────────────────────────────────────────────
export type ChargeResult = {
  status: "Succeeded" | "Pending";
  providerReference: string;
  simulated: boolean;
};

type ChargeInput = {
  gateway: GatewayCode;
  /** Amount in the target currency (integer dirhams / whole units). */
  amount: number;
  currency: CheckoutCurrency;
  bookingId: number;
  payerId: number;
  /** Stripe Connect destination account id (required for real Stripe path). */
  transferAccountId?: string | null;
};

export async function createProviderCharge(input: ChargeInput): Promise<ChargeResult> {
  const { gateway, amount, currency, bookingId, payerId, transferAccountId } = input;

  // ── Real Stripe Connect ───────────────────────────────────────────────────
  if (gateway === "stripe_card" && isStripeConfigured() && transferAccountId) {
    try {
      const result = await createCheckoutCharge({
        amount,
        currency,
        applicationFee: 0, // fee computed at escrow time
        transferAccountId,
        metadata: {
          bookingId: String(bookingId),
          payerId: String(payerId),
        },
      });
      return {
        status: "Pending", // requires Stripe.js confirmation client-side
        providerReference: result.id,
        simulated: false,
      };
    } catch (err) {
      // Stripe unreachable / package missing → fall through to simulation
      console.warn("[Payments] Stripe charge failed, falling back to simulation:", err);
    }
  }

  // ── Simulated fallback (default) ──────────────────────────────────────────
  const simId = randomUUID().replace(/-/g, "").slice(0, 24);
  const prefixes: Record<GatewayCode, string> = {
    cmi_card: "CMI-SIM",
    stripe_card: "STRIPE-SIM",
    paypal: "PAYPAL-SIM",
    bank_transfer: "BANK-SIM",
    payzone: "PAYZONE-SIM",
    paytabs: "PAYTABS-SIM",
    cashplus: "CASHPLUS-SIM",
    wafacash: "WAFACASH-SIM",
    arrival: "ARRIVAL-SIM",
  };
  const statuses: Record<GatewayCode, ChargeResult["status"]> = {
    cmi_card: "Succeeded",
    stripe_card: "Succeeded",
    paypal: "Succeeded",
    bank_transfer: "Pending",
    payzone: "Succeeded",
    paytabs: "Succeeded",
    cashplus: "Pending",
    wafacash: "Pending",
    arrival: "Pending",
  };
  return {
    status: statuses[gateway],
    providerReference: `${prefixes[gateway]}-${simId}`,
    simulated: true,
  };
}
