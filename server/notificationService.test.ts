import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEmailContent, normalizeWhatsAppNumber, sendTransactionalEmail } from "./notificationService";

describe("normalizeWhatsAppNumber", () => {
  it("converts local Moroccan numbers to the international 212 format", () => {
    expect(normalizeWhatsAppNumber("0612345678")).toBe("212612345678");
    expect(normalizeWhatsAppNumber("612345678")).toBe("212612345678");
  });

  it("keeps formatted international numbers and strips separators", () => {
    expect(normalizeWhatsAppNumber("+212 6 12 34 56 78")).toBe("212612345678");
    expect(normalizeWhatsAppNumber("212612345678")).toBe("212612345678");
  });

  it("keeps foreign numbers as-is when they are a valid 10-15 digit E.164 value", () => {
    expect(normalizeWhatsAppNumber("14155551234")).toBe("14155551234");
  });

  it("rejects empty or non-phone values", () => {
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber("  ")).toBeNull();
    expect(normalizeWhatsAppNumber("abc")).toBeNull();
    expect(normalizeWhatsAppNumber("1234567890123456")).toBeNull();
  });
});

describe("notificationService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("escapes user-controlled content in the bilingual email template", () => {
    const content = buildEmailContent("<حجز>", "رسالة & تفاصيل\nLigne française", "https://altusplace.vercel.app/my-bookings");

    expect(content.html).toContain("&lt;حجز&gt;");
    expect(content.html).toContain("رسالة &amp; تفاصيل");
    expect(content.html).toContain("https://altusplace.vercel.app/my-bookings");
    expect(content.text).toContain("Ligne française");
  });

  it("supports the listing approval and rejection notification types in bilingual content", () => {
    const approved = buildEmailContent(
      "تم نشر إعلانك / Annonce publiée",
      "تم نشر إعلان السيارة بنجاح.\n\nVotre annonce est publiée.",
    );
    const rejected = buildEmailContent(
      "تم رفض صورة الإعلان / Image refusée",
      "يرجى رفع صورة أصلية.\n\nVeuillez téléverser une image originale.",
    );

    expect(approved.text).toContain("Annonce publiée");
    expect(rejected.text).toContain("Image refusée");
    expect(approved.html).toContain("ALTUSplace Morocco");
    expect(rejected.html).toContain("ALTUSplace Morocco");
  });

  it("does not attempt external delivery until the provider is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    const result = await sendTransactionalEmail({
      to: "tenant@example.com",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
    });

    expect(result).toEqual({ status: "skipped", reason: "email_provider_not_configured" });
  });

  it("rejects invalid sender configuration before making a network request", async () => {
    vi.stubEnv("RESEND_API_KEY", "resend_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "not-an-email");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await sendTransactionalEmail({
      to: "tenant@example.com",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
    });

    expect(result).toEqual({ status: "failed", reason: "invalid_email_configuration" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
