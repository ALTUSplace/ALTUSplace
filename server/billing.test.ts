import { describe, expect, it } from "vitest";
import {
  calculateInvoiceTotals,
  createInvoiceNumber,
  getSimulatedBookingStatus,
  getSimulatedPaymentStatus,
  MOROCCO_VAT_RATE_BASIS_POINTS,
} from "./billing";

describe("invoice totals", () => {
  it("calculates Morocco VAT and keeps commission separate from the renter total", () => {
    const totals = calculateInvoiceTotals(1_000, 100);

    expect(totals.subtotal).toBe(1_000);
    expect(totals.commissionFee).toBe(100);
    expect(totals.vatRateBasisPoints).toBe(MOROCCO_VAT_RATE_BASIS_POINTS);
    expect(totals.vatAmount).toBe(200);
    expect(totals.total).toBe(1_200);
    expect(totals.netPartnerAmount).toBe(900);
    expect(totals.currency).toBe("MAD");
  });

  it("supports a stored VAT rate and rejects invalid accounting inputs", () => {
    expect(calculateInvoiceTotals(999, 0, 1_500)).toMatchObject({
      vatAmount: 150,
      total: 1_149,
      vatRateBasisPoints: 1_500,
    });
    expect(() => calculateInvoiceTotals(-1)).toThrow();
    expect(() => calculateInvoiceTotals(100, 101)).toThrow();
    expect(() => calculateInvoiceTotals(100, 0, 10_001)).toThrow();
  });
});

describe("simulated payment policy", () => {
  it("confirms CMI card payments and leaves bank transfers pending", () => {
    expect(getSimulatedPaymentStatus("cmi_card")).toBe("Succeeded");
    expect(getSimulatedBookingStatus("cmi_card")).toBe("Confirmed");
    expect(getSimulatedPaymentStatus("bank_transfer")).toBe("Pending");
    expect(getSimulatedBookingStatus("bank_transfer")).toBe("Pending");
  });
});

describe("invoice references", () => {
  it("contains the booking id and UTC year while remaining unique", () => {
    const now = new Date("2026-08-22T12:00:00.000Z");
    const first = createInvoiceNumber(42, now);
    const second = createInvoiceNumber(42, now);

    expect(first).toMatch(/^ALT-2026-42-[A-Z0-9]{8}$/);
    expect(second).toMatch(/^ALT-2026-42-[A-Z0-9]{8}$/);
    expect(second).not.toBe(first);
  });
});
