import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAR_ADDON_IDS, PROPERTY_ADDON_IDS } from "./addons";

const checkoutSource = readFileSync(
  new URL("../client/src/pages/Checkout.tsx", import.meta.url),
  "utf8",
);

describe("Checkout WhatsApp-handoff UI audit", () => {
  it("never collects real card data — booking is confirmed via WhatsApp", () => {
    expect(checkoutSource).not.toMatch(/name=["'](?:cardNumber|cvv|cardHolder)["']/i);
    expect(checkoutSource).toContain("لا حاجة إلى بطاقة دفع");
    expect(checkoutSource).toContain("تأكيد الحجز عبر الواتساب");
    expect(checkoutSource).toContain("راجعها ثم أرسلها لتأكيد الحجز مباشرة");
  });

  it("keeps the mandatory document upload and residency choices visible in the booking flow", () => {
    expect(checkoutSource).toContain("التحقق الإلزامي من الوثائق");
    expect(checkoutSource).toContain("حالة الإقامة");
    expect(checkoutSource).toContain("بطاقة التعريف الوطنية (CIN)");
    expect(checkoutSource).toContain("رخصة السياقة (البيرمي)");
    expect(checkoutSource).toContain("لن يُفتح زر تأكيد الحجز عبر الواتساب إلا بعد إرفاق كامل الوثائق المطلوبة");
  });

  it("includes responsive trust and order-summary landmarks", () => {
    expect(checkoutSource).toContain("ملخص الفاتورة الشفافة");
    expect(checkoutSource).toContain("بدون رسوم خفية");
    expect(checkoutSource).toContain("محمية ومشفّرة");
    expect(checkoutSource).toContain("md:sticky md:top-6");
  });
});

describe("listing-type-aware booking add-ons and document checks", () => {
  it("renders add-ons from the per-type id set — property stays never see car add-ons", () => {
    expect(checkoutSource).toContain("const bookingAddOnIds: readonly AddOnId[] = isPropertyBooking ? PROPERTY_ADDON_IDS : CAR_ADDON_IDS;");
    expect(checkoutSource).toMatch(/bookingAddOnIds\.map/);
    expect(checkoutSource).not.toMatch(/\bALL_ADDON_IDS\b/);
    const pricing = readFileSync(new URL("../client/src/lib/pricing.ts", import.meta.url), "utf8");
    for (const label of ["تأمين شامل (تغطية كاملة)", "كرسي أطفال", "سائق إضافي"]) expect(pricing).toContain(label);
    for (const label of ["تنظيف شامل عند المغادرة", "مكان ركن سيارة خاص", "تسجيل وصول متأخر (بعد 22:00)"]) expect(pricing).toContain(label);
  });

  it("flows only the active (type-valid) add-ons into totals, message and mutation", () => {
    expect(checkoutSource).toContain("const activeAddOns = selectedAddOns.filter((id) => bookingAddOnIds.includes(id));");
    expect(checkoutSource).toContain("calculateCheckoutTotal(pricePerDay, days, activeAddOns)");
    expect(checkoutSource).toContain("addOns: activeAddOns");
    expect(checkoutSource).toContain("addOns: activeAddOns.length > 0 ? activeAddOns : undefined");
    expect(checkoutSource).toContain("activeAddOns.map");
  });

  it("mirrors the property add-on fees in the client and server catalogs", () => {
    expect(CAR_ADDON_IDS).toEqual(["insurance", "baby_seat", "delivery", "additional_driver"]);
    expect(PROPERTY_ADDON_IDS).toEqual(["cleaning", "parking", "late_checkin"]);
    const pricing = readFileSync(new URL("../client/src/lib/pricing.ts", import.meta.url), "utf8");
    expect(pricing).toContain("cleaning: { fee: 300, perDay: false");
    expect(pricing).toContain("parking: { fee: 50, perDay: true");
    expect(pricing).toContain("late_checkin: { fee: 100, perDay: false");
  });

  it("keeps the document split: licence is car-only and the server enforces it per category", () => {
    expect(checkoutSource).toContain("if (!isPropertyBooking && !driverLicenseFile) missingDocumentLabels.push");
    expect(checkoutSource).toContain("{!isPropertyBooking && (");
    const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(routers).toContain('if (bookingCategory === "car" && (!input.drivingLicense || !input.identityDocument))');
    expect(routers).toContain('if (bookingCategory !== "car" && !input.identityDocument)');
    expect(routers).toContain('const allowedAddOnIds = bookingCategory === "car" ? CAR_ADDON_IDS : PROPERTY_ADDON_IDS;');
    expect(routers).toContain('"cleaning", "parking", "late_checkin"');
  });
});
