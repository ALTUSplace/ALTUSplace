import { describe, expect, it } from "vitest";
import { buildCommercialLeaseText, generateCommercialLeasePdf } from "./commercialLease";

describe("commercial lease PDF generator", () => {
  const input = {
    reference: "ALT-LEASE-42",
    landlordName: "شركة الأطلس العقارية",
    tenantName: "مريم بنعلي",
    premises: "مكتب 4، شارع محمد الخامس",
    city: "الدار البيضاء",
    startDate: "2026-09-01",
    endDate: "2027-08-31",
    monthlyRent: 8500,
    deposit: 17000,
    purpose: "professional" as const,
  };

  it("creates a non-empty French PDF and includes the required contract fields", async () => {
    const blob = generateCommercialLeasePdf({ ...input, language: "fr" });
    const text = buildCommercialLeaseText({ ...input, language: "fr" }).join(" ");

    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(500);
    expect(await blob.slice(0, 5).text()).toBe("%PDF-");
    expect(text).toContain(input.reference);
    expect(text).toContain(input.landlordName);
    expect(text).toContain(input.tenantName);
    expect(text).toContain("8.500 MAD");
    expect(text).toContain(input.startDate);
    expect(text).toContain(input.endDate);
    expect(text).toContain("Avertissement légal");
    expect(text).toContain("plateforme publicitaire et un intermédiaire technologique");
    expect(text).toContain("état mécanique");
    expect(text).toContain("propreté");
  });

  it("provides an Arabic contract variant with the same essential fields", () => {
    const text = buildCommercialLeaseText({ ...input, language: "ar" }).join(" ");
    expect(text).toContain("عقد كراء محل تجاري أو مهني");
    expect(text).toContain(input.reference);
    expect(text).toContain(input.landlordName);
    expect(text).toContain(input.tenantName);
    expect(text).toContain("تنبيه قانوني");
    expect(text).toContain("منصة إعلانية ووسيط تقني فقط");
    expect(text).toContain("الحالة الميكانيكية");
    expect(text).toContain("نظافته");
  });
});
