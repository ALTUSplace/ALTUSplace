import { describe, expect, it } from "vitest";
import {
  getTaxRateForCity,
  calculateTaxForCity,
  convertCurrency,
  formatCurrency,
  calculateStripeConnectSplit,
  MOROCCO_VAT_RATE_BASIS_POINTS,
  PLATFORM_COMMISSION_RATE_BASIS_POINTS,
  CITY_TAX_RATES,
} from "../../server/billing";

describe("pricing calculator - city tax rates", () => {
  it("returns Morocco standard rate for unknown city", () => {
    expect(getTaxRateForCity("Unknown City")).toBe(MOROCCO_VAT_RATE_BASIS_POINTS);
  });

  it("returns Morocco standard rate for null/undefined city", () => {
    expect(getTaxRateForCity(null)).toBe(MOROCCO_VAT_RATE_BASIS_POINTS);
    expect(getTaxRateForCity(undefined)).toBe(MOROCCO_VAT_RATE_BASIS_POINTS);
  });

  it("returns correct rate for known cities", () => {
    expect(getTaxRateForCity("الدار البيضاء")).toBe(CITY_TAX_RATES["الدار البيضاء"]);
    expect(getTaxRateForCity("Casablanca")).toBe(CITY_TAX_RATES["Casablanca"]);
    expect(getTaxRateForCity("مراكش")).toBe(CITY_TAX_RATES["مراكش"]);
  });

  it("calculates tax for city correctly", () => {
    expect(calculateTaxForCity(1_000, "الدار البيضاء")).toBe(200);
    expect(calculateTaxForCity(1_000, "Unknown")).toBe(200);
  });
});

describe("pricing calculator - currency conversion", () => {
  it("converts MAD to EUR correctly", () => {
    const result = convertCurrency(100, "MAD", "EUR");
    expect(result).toBeCloseTo(9.2, 1);
  });

  it("converts MAD to USD correctly", () => {
    const result = convertCurrency(100, "MAD", "USD");
    expect(result).toBeCloseTo(10, 0);
  });

  it("returns same amount for same currency", () => {
    expect(convertCurrency(100, "MAD", "MAD")).toBe(100);
  });

  it("handles unknown currency gracefully", () => {
    const result = convertCurrency(100, "MAD", "UNKNOWN");
    expect(Number.isFinite(result)).toBe(true);
  });

  it("formats currency with symbol", () => {
    expect(formatCurrency(1000, "MAD")).toContain("د.م");
    expect(formatCurrency(1000, "EUR")).toContain("€");
    expect(formatCurrency(1000, "USD")).toContain("$");
  });
});

describe("pricing calculator - Stripe Connect split", () => {
  it("calculates 10% platform fee and 90% host payout", () => {
    const split = calculateStripeConnectSplit(1_000);
    expect(split.platformFee).toBe(100);
    expect(split.hostPayout).toBe(900);
    expect(split.commissionRateBasisPoints).toBe(PLATFORM_COMMISSION_RATE_BASIS_POINTS);
  });

  it("supports custom commission rate", () => {
    const split = calculateStripeConnectSplit(1_000, 1_500);
    expect(split.platformFee).toBe(150);
    expect(split.hostPayout).toBe(850);
  });

  it("handles zero subtotal", () => {
    const split = calculateStripeConnectSplit(0);
    expect(split.platformFee).toBe(0);
    expect(split.hostPayout).toBe(0);
  });
});
