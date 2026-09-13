// ── Client-side gateway registry ─────────────────────────────────────────────
// Mirrors server/payments/providers.ts. Defines which methods are available
// and which currencies each supports so the Checkout UI can adapt dynamically.

export type GatewayCode = "cmi_card" | "stripe_card" | "paypal" | "bank_transfer";
export type CheckoutCurrency = "MAD" | "EUR" | "USD";

export const CHECKOUT_CURRENCIES: readonly CheckoutCurrency[] = ["MAD", "EUR", "USD"] as const;

export type GatewayDefinition = {
  code: GatewayCode;
  labelAr: string;
  labelFr: string;
  labelEn: string;
  supportedCurrencies: readonly CheckoutCurrency[];
  instant: boolean;
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
};

export function gatewaySupportsCurrency(gateway: GatewayCode, currency: CheckoutCurrency): boolean {
  return GATEWAYS[gateway].supportedCurrencies.includes(currency);
}

export function gatewaysForCurrency(currency: CheckoutCurrency): GatewayCode[] {
  return (Object.keys(GATEWAYS) as GatewayCode[]).filter((g) => gatewaySupportsCurrency(g, currency));
}
