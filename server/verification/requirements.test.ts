import { describe, expect, it } from "vitest";
import {
  isDocumentAllowedForCategory,
  isDocumentExpired,
  maskDocumentNumber,
  normalizeBookingCategory,
  requiredDocumentsForCategory,
} from "./requirements";

describe("kyc document requirements", () => {
  it("requires a driving licence for car bookings (Turo style)", () => {
    expect(requiredDocumentsForCategory("car")).toEqual(["driving_license"]);
    expect(requiredDocumentsForCategory("سيارة")).toEqual(["driving_license"]);
    expect(requiredDocumentsForCategory("Car Rental")).toEqual(["driving_license"]);
  });

  it("accepts national ID or passport for property bookings", () => {
    const required = requiredDocumentsForCategory("real_estate");
    expect(required).toContain("national_id");
    expect(required).toContain("cni");
    expect(required).toContain("passport");
    expect(required).not.toContain("driving_license");
  });

  it("treats offices and hotels as property stays", () => {
    expect(normalizeBookingCategory("office")).toBe("property");
    expect(normalizeBookingCategory("فندق")).toBe("property");
    expect(normalizeBookingCategory("")).toBe("property");
  });

  it("only accepts a driving licence for the car category", () => {
    expect(isDocumentAllowedForCategory("driving_license", "car")).toBe(true);
    expect(isDocumentAllowedForCategory("passport", "car")).toBe(false);
    expect(isDocumentAllowedForCategory("cni", "property")).toBe(true);
    expect(isDocumentAllowedForCategory("driving_license", "property")).toBe(false);
    expect(isDocumentAllowedForCategory("passport", null)).toBe(true);
  });

  it("masks document numbers to their last four characters", () => {
    expect(maskDocumentNumber("AB123456")).toBe("**123456");
    expect(maskDocumentNumber("  X987654321 ")).toBe("******4321");
    expect(maskDocumentNumber("AB12")).toBe("**AB12");
    expect(maskDocumentNumber(null)).toBeNull();
    expect(maskDocumentNumber("   ")).toBeNull();
  });

  it("detects expired documents", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(isDocumentExpired(yesterday)).toBe(true);
    expect(isDocumentExpired(tomorrow)).toBe(false);
    expect(isDocumentExpired(null)).toBe(false);
    expect(isDocumentExpired(undefined)).toBe(false);
  });
});