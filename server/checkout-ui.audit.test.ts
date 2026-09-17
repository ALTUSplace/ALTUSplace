import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
