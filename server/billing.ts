import { randomUUID } from "node:crypto";

/**
 * Morocco's standard VAT rate used by this prototype invoice calculator.
 * The rate is stored as basis points so persisted invoices remain auditable.
 */
export const MOROCCO_VAT_RATE_BASIS_POINTS = 2_000;
export const PLATFORM_COMMISSION_RATE_BASIS_POINTS = 1_000;

// City-specific tax rates (basis points). Defaults to Morocco standard if not listed.
export const CITY_TAX_RATES: Record<string, number> = {
  "الدار البيضاء": 2_000,
  "Casablanca": 2_000,
  "مراكش": 2_000,
  "Marrakech": 2_000,
  "الرباط": 2_000,
  "Rabat": 2_000,
  "فاس": 2_000,
  "Fès": 2_000,
  "طنجة": 2_000,
  "Tanger": 2_000,
  "أكادير": 2_000,
  "Agadir": 2_000,
};

// Currency conversion rates relative to MAD (base currency)
export const CURRENCY_RATES: Record<string, number> = {
  MAD: 1,
  EUR: 0.092,
  USD: 0.10,
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  MAD: "د.م",
  EUR: "€",
  USD: "$",
};

export function calculateInvoiceTotals(
  subtotal: number,
  commissionFee = Math.round(subtotal * PLATFORM_COMMISSION_RATE_BASIS_POINTS / 10_000),
  vatRateBasisPoints = MOROCCO_VAT_RATE_BASIS_POINTS,
) {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new Error("Subtotal must be a non-negative finite number");
  }
  if (!Number.isFinite(commissionFee) || commissionFee < 0 || commissionFee > subtotal) {
    throw new Error("Commission fee must be between zero and subtotal");
  }
  if (!Number.isInteger(vatRateBasisPoints) || vatRateBasisPoints < 0 || vatRateBasisPoints > 10_000) {
    throw new Error("VAT rate must be a valid basis-point value");
  }

  const vatAmount = Math.round(subtotal * vatRateBasisPoints / 10_000);
  return {
    subtotal,
    commissionFee,
    vatRateBasisPoints,
    vatAmount,
    total: subtotal + vatAmount,
    netPartnerAmount: subtotal - commissionFee,
    currency: "MAD" as const,
  };
}

export function createInvoiceNumber(bookingId: number, now = new Date()) {
  const year = now.getUTCFullYear();
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `ALT-${year}-${bookingId}-${suffix}`;
}

export function getSimulatedPaymentStatus(method: "cmi_card" | "bank_transfer") {
  return method === "cmi_card" ? "Succeeded" as const : "Pending" as const;
}

export function getSimulatedBookingStatus(method: "cmi_card" | "bank_transfer") {
  return method === "cmi_card" ? "Confirmed" as const : "Pending" as const;
}

// ── Tax & Currency Helpers ──────────────────────────────────────────────────

export function getTaxRateForCity(city: string | null | undefined): number {
  if (!city) return MOROCCO_VAT_RATE_BASIS_POINTS;
  return CITY_TAX_RATES[city] ?? MOROCCO_VAT_RATE_BASIS_POINTS;
}

export function calculateTaxForCity(subtotal: number, city: string | null | undefined): number {
  const rate = getTaxRateForCity(city);
  return Math.round(subtotal * rate / 10_000);
}

export function convertCurrency(amount: number, from: string, to: string): number {
  const fromRate = CURRENCY_RATES[from] ?? 1;
  const toRate = CURRENCY_RATES[to] ?? 1;
  const madAmount = amount / fromRate;
  return Math.round(madAmount * toRate * 100) / 100;
}

export function formatCurrency(amount: number, currency: string = "MAD"): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${amount.toLocaleString("fr-MA")} ${symbol}`;
}

// ── Stripe Connect Split-Payment Calculation ─────────────────────────────────

export function calculateStripeConnectSplit(subtotal: number, commissionRateBasisPoints = PLATFORM_COMMISSION_RATE_BASIS_POINTS) {
  const platformFee = Math.round(subtotal * commissionRateBasisPoints / 10_000);
  const hostPayout = subtotal - platformFee;
  return {
    subtotal,
    platformFee,
    hostPayout,
    commissionRateBasisPoints,
    currency: "MAD" as const,
  };
}
