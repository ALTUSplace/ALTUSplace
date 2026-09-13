// ── Client-side gateway registry ─────────────────────────────────────────────
// Mirrors server/payments/providers.ts. Defines which methods are available
// and which currencies each supports so the Checkout UI can adapt dynamically.

export type GatewayCode = "cmi_card" | "stripe_card" | "paypal" | "bank_transfer" | "payzone" | "paytabs" | "cashplus" | "wafacash" | "arrival";
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
  group?: "card" | "cash" | "other";
};

export const GATEWAYS: Record<GatewayCode, GatewayDefinition> = {
  cmi_card: {
    code: "cmi_card",
    supportedCurrencies: ["MAD", "EUR", "USD"],
    instant: true,
    international: false,
    group: "card",
    labelAr: "بطاقة بنكية CMI",
    labelFr: "Carte bancaire CMI",
    labelEn: "CMI Bank Card",
  },
  stripe_card: {
    code: "stripe_card",
    supportedCurrencies: ["MAD", "EUR", "USD"],
    instant: true,
    international: true,
    group: "card",
    labelAr: "Stripe (بطاقة دولية)",
    labelFr: "Stripe (carte internationale)",
    labelEn: "Stripe (International Card)",
  },
  paypal: {
    code: "paypal",
    supportedCurrencies: ["EUR", "USD"],
    instant: true,
    international: true,
    group: "card",
    labelAr: "PayPal",
    labelFr: "PayPal",
    labelEn: "PayPal",
  },
  bank_transfer: {
    code: "bank_transfer",
    supportedCurrencies: ["MAD"],
    instant: false,
    international: false,
    group: "other",
    labelAr: "تحويل بنكي (RIB)",
    labelFr: "Virement bancaire (RIB)",
    labelEn: "Bank Transfer (RIB)",
  },
  payzone: {
    code: "payzone",
    supportedCurrencies: ["MAD", "EUR", "USD"],
    instant: true,
    international: false,
    group: "card",
    labelAr: "البطاقة البنكية السريعة (PayZone)",
    labelFr: "Carte bancaire rapide (PayZone)",
    labelEn: "Fast Bank Card (PayZone)",
  },
  paytabs: {
    code: "paytabs",
    supportedCurrencies: ["MAD"],
    instant: true,
    international: false,
    group: "card",
    labelAr: "بطاقات PayTabs المحلية",
    labelFr: "Cartes PayTabs locales",
    labelEn: "Local Cards via PayTabs",
  },
  cashplus: {
    code: "cashplus",
    supportedCurrencies: ["MAD"],
    instant: false,
    international: false,
    group: "cash",
    labelAr: "الأداء نقداً عبر Cash Plus",
    labelFr: "Paiement en espèces via Cash Plus",
    labelEn: "Cash at Cash Plus",
  },
  wafacash: {
    code: "wafacash",
    supportedCurrencies: ["MAD"],
    instant: false,
    international: false,
    group: "cash",
    labelAr: "الأداء نقداً عبر Wafacash",
    labelFr: "Paiement en espèces via Wafacash",
    labelEn: "Cash at Wafacash",
  },
  arrival: {
    code: "arrival",
    supportedCurrencies: ["MAD"],
    instant: false,
    international: false,
    group: "other",
    labelAr: "الدفع عند الاستلام (Pay on Arrival)",
    labelFr: "Paiement à la réception",
    labelEn: "Pay on Arrival",
  },
};

export const GATEWAY_GROUPS: { key: "card" | "cash" | "other"; labelAr: string }[] = [
  { key: "card", labelAr: "بطاقات الدفع للطلب الفوري" },
  { key: "cash", labelAr: "الأداء نقداً لدى وكالة" },
  { key: "other", labelAr: "خيارات دفع أخرى" },
];

export function isCardGateway(gateway: GatewayCode): boolean {
  return GATEWAYS[gateway].group === "card";
}

export function isCashVoucherGateway(gateway: GatewayCode): boolean {
  return GATEWAYS[gateway].group === "cash";
}

export function isArrivalGateway(gateway: GatewayCode): boolean {
  return gateway === "arrival";
}

export function gatewaySupportsCurrency(gateway: GatewayCode, currency: CheckoutCurrency): boolean {
  return GATEWAYS[gateway].supportedCurrencies.includes(currency);
}

export function gatewaysForCurrency(currency: CheckoutCurrency): GatewayCode[] {
  return (Object.keys(GATEWAYS) as GatewayCode[]).filter((g) => gatewaySupportsCurrency(g, currency));
}

// ── Checkout outcome contract ─────────────────────────────────────────────────
// The modal invokes onCreatePayment(method) and renders the matching step.
export type PaymentOutcome =
  | { kind: "redirect"; provider: GatewayCode; url: string; externalReference: string; transactionId: string }
  | { kind: "voucher"; provider: GatewayCode; reference: string; expiresAt: string | null; amount: number }
  | { kind: "settled"; transactionId: string; method: GatewayCode; amount: number }
  | { kind: "pending"; transactionId: string; method: GatewayCode; amount: number };
