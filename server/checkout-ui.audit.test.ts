import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const checkoutSource = readFileSync(
  new URL("../client/src/pages/Checkout.tsx", import.meta.url),
  "utf8",
);

describe("Checkout simulated CMI UI audit", () => {
  it("communicates that the payment gateway is simulated and does not collect real card data", () => {
    expect(checkoutSource).toContain("بوابة دفع مغربية محاكية");
    expect(checkoutSource).toContain("لا تدخل رقم بطاقة أو رمز CVV حقيقياً");
    expect(checkoutSource).toContain("لا نخزن بيانات البطاقة");
    expect(checkoutSource).toContain("لا تتصل بمؤسسة CMI");
  });

  it("keeps the supported payment choices visible in the checkout flow", () => {
    expect(checkoutSource).toContain("Visa / Mastercard / CMI");
    expect(checkoutSource).toContain("التحويل البنكي المباشر (RIB)");
    expect(checkoutSource).toContain("paymentMethod === 'cmi_card'");
    expect(checkoutSource).toContain("paymentMethod === 'bank_transfer'");
  });

  it("includes responsive trust and order-summary landmarks", () => {
    expect(checkoutSource).toContain("B2-Rent Secure Checkout");
    expect(checkoutSource).toContain("جلسة دفع محمية");
    expect(checkoutSource).toContain("ملخص الفاتورة الشفافة");
    expect(checkoutSource).toContain("md:sticky md:top-6");
  });
});
