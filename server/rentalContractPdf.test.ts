import { describe, expect, it } from "vitest";

import { generateCarRentalContractPdf, type CarRentalContractInput } from "./carRentalPdf";

const baseInput: CarRentalContractInput = {
  reference: "ALT-CAR-1-2026-09-10",
  language: "ar",
  agencyName: "وكالة المغرب للتأجير",
  agencyCommercialRegister: "RC 12345",
  agencyAddress: "مراكش، حي غيليز",
  agencyPhone: "212612345678",
  renterName: "محمد أمل",
  renterEmail: "renter@example.com",
  renterPhone: "212661122334",
  renterIdType: "cni",
  renterIdNumber: "AB123456",
  residency: "resident",
  vehicle: "Renault Clio 4",
  vehicleCategory: "car",
  fuelType: "ديزل",
  transmission: "أوتوماتيك",
  city: "مراكش",
  startDate: "2026-09-10T09:00:00.000Z",
  endDate: "2026-09-13T09:00:00.000Z",
  durationDays: 3,
  pricePerDay: 800,
  addOnsTotal: 150,
  subtotal: 2400,
  commissionFee: 240,
  netProfit: 2310,
  totalPrice: 2550,
  deposit: 0,
  cancelPolicyText: "سياسة الإلغاء المعتمدة في المنصة.",
  legalNotice: "تنبيه قانوني: هذا عقد نموذجي.",
  issuedAt: "2026-09-14T10:00:00.000Z",
};

describe("Moroccan car rental contract PDF", () => {
  it("generates a valid PDF binary for Arabic input", () => {
    const buffer = generateCarRentalContractPdf(baseInput);
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(3000);
    expect(buffer.toString("latin1")).toContain("/Type /Page");
  });

  it("generates a valid PDF binary for French input", () => {
    const buffer = generateCarRentalContractPdf({ ...baseInput, language: "fr", reference: "ALT-CAR-1-2026-09-10" });
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(3000);
  });

  it("tolerates missing optional agency and renter identity fields", () => {
    const buffer = generateCarRentalContractPdf({
      ...baseInput,
      agencyCommercialRegister: null,
      agencyAddress: null,
      agencyPhone: null,
      renterEmail: null,
      renterPhone: null,
      renterIdType: null,
      renterIdNumber: null,
      residency: null,
      fuelType: null,
      transmission: null,
      city: null,
    });
    expect(buffer.slice(0, 5).toString("ascii")).toBe("%PDF-");
  });
});