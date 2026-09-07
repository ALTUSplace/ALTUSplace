import { randomUUID } from "node:crypto";

/**
 * Morocco's standard VAT rate used by this prototype invoice calculator.
 * The rate is stored as basis points so persisted invoices remain auditable.
 */
export const MOROCCO_VAT_RATE_BASIS_POINTS = 2_000;
export const PLATFORM_COMMISSION_RATE_BASIS_POINTS = 1_000;

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
