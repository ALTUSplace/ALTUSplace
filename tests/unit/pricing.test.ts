import { describe, expect, it } from "vitest";
import {
  calculateInvoiceTotals,
  createInvoiceNumber,
  getSimulatedPaymentStatus,
  getSimulatedBookingStatus,
  getTaxRateForCity,
  calculateTaxForCity,
  convertCurrency,
  formatCurrency,
  calculateStripeConnectSplit,
  MOROCCO_VAT_RATE_BASIS_POINTS,
  PLATFORM_COMMISSION_RATE_BASIS_POINTS,
  CITY_TAX_RATES,
} from "../../server/billing";

describe("pricing calculator - calculateInvoiceTotals", () => {
  it("calculates Morocco VAT (20%) and keeps commission separate from renter total", () => {
    const totals = calculateInvoiceTotals(1_000, 100);
    expect(totals.subtotal).toBe(1_000);
    expect(totals.commissionFee).toBe(100);
    expect(totals.vatRateBasisPoints).toBe(MOROCCO_VAT_RATE_BASIS_POINTS);
    expect(totals.vatAmount).toBe(200);
    expect(totals.total).toBe(1_200);
    expect(totals.netPartnerAmount).toBe(900);
    expect(totals.currency).toBe("MAD");
  });

  it("applies default commission (10%) when not specified", () => {
    const totals = calculateInvoiceTotals(5_000);
    expect(totals.commissionFee).toBe(500);
    expect(totals.netPartnerAmount).toBe(4_500);
  });

  it("supports a stored VAT rate and calculates correctly", () => {
    expect(calculateInvoiceTotals(999, 0, 1_500)).toMatchObject({
      vatAmount: 150,
      total: 1_149,
      vatRateBasisPoints: 1_500,
    });
  });

  it("handles zero subtotal correctly", () => {
    const totals = calculateInvoiceTotals(0, 0);
    expect(totals.subtotal).toBe(0);
    expect(totals.vatAmount).toBe(0);
    expect(totals.total).toBe(0);
    expect(totals.netPartnerAmount).toBe(0);
  });

  it("rejects negative subtotal", () => {
    expect(() => calculateInvoiceTotals(-1)).toThrow();
  });

  it("rejects commission fee exceeding subtotal", () => {
    expect(() => calculateInvoiceTotals(100, 101)).toThrow();
  });

  it("rejects negative commission fee", () => {
    expect(() => calculateInvoiceTotals(100, -1)).toThrow();
  });

  it("rejects invalid VAT rate (exceeds 10000 basis points)", () => {
    expect(() => calculateInvoiceTotals(100, 0, 10_001)).toThrow();
  });

  it("rejects negative VAT rate", () => {
    expect(() => calculateInvoiceTotals(100, 0, -1)).toThrow();
  });

  it("rejects non-integer VAT rate", () => {
    expect(() => calculateInvoiceTotals(100, 0, 1_500.5)).toThrow();
  });

  it("rejects NaN subtotal", () => {
    expect(() => calculateInvoiceTotals(NaN, 0)).toThrow();
  });

  it("rejects infinite subtotal", () => {
    expect(() => calculateInvoiceTotals(Infinity, 0)).toThrow();
  });
});
