import { describe, expect, it } from "vitest";
import { buildAgencyWhatsAppMessage, buildWaMeUrl, buildWhatsAppUrl, normalizeWaNumber, normalizeWhatsAppNumber } from "./whatsapp";

describe("normalizeWhatsAppNumber", () => {
  it("strips separators and the leading plus", () => {
    expect(normalizeWhatsAppNumber("+212 6 61-23.45 67")).toBe("212661234567");
  });

  it("keeps valid numbers untouched", () => {
    expect(normalizeWhatsAppNumber("212661234567")).toBe("212661234567");
  });

  it("rejects missing, empty and placeholder values", () => {
    expect(normalizeWhatsAppNumber(null)).toBe("");
    expect(normalizeWhatsAppNumber(undefined)).toBe("");
    expect(normalizeWhatsAppNumber("")).toBe("");
    expect(normalizeWhatsAppNumber("غير متوفر")).toBe("");
    expect(normalizeWhatsAppNumber("12345")).toBe("");
  });
});

describe("buildWhatsAppUrl", () => {
  it("builds a wa.me deep link with an encoded message", () => {
    const url = buildWhatsAppUrl("+212 661-234567", "مرحباً، أرغب في الاستفسار");
    expect(url).toMatch(/^https:\/\/wa\.me\/212661234567\?text=/);
    expect(url).toContain(encodeURIComponent("مرحباً، أرغب في الاستفسار"));
  });

  it("encodes French messages and special characters", () => {
    const url = buildWhatsAppUrl("212661234567", "Bonjour — réservation #12 & paiement");
    expect(url).toContain(encodeURIComponent("Bonjour — réservation #12 & paiement"));
  });

  it("returns an empty string when no usable phone exists", () => {
    expect(buildWhatsAppUrl(null, "hello")).toBe("");
    expect(buildWhatsAppUrl("غير متوفر", "hello")).toBe("");
  });
});

describe("normalizeWaNumber (agency click-to-chat)", () => {
  it("converts leading 0 to the 212 country code", () => {
    expect(normalizeWaNumber("0612345678")).toBe("212612345678");
    expect(normalizeWaNumber("0755123456")).toBe("212755123456");
  });

  it("keeps international 212 forms and strips separators", () => {
    expect(normalizeWaNumber("+212 612-345 678")).toBe("212612345678");
    expect(normalizeWaNumber("212612345678")).toBe("212612345678");
    expect(normalizeWaNumber("06 12 34 56 78")).toBe("212612345678");
  });

  it("rejects empty, non-numeric and non-mobile values", () => {
    expect(normalizeWaNumber("")).toBeNull();
    expect(normalizeWaNumber("   ")).toBeNull();
    expect(normalizeWaNumber("abc")).toBeNull();
    expect(normalizeWaNumber("1234567890")).toBeNull();
    expect(normalizeWaNumber("21251234567")).toBeNull(); // landline prefix
    expect(normalizeWaNumber("2126123456")).toBeNull(); // too short
  });
});

describe("buildWaMeUrl", () => {
  it("builds a wa.me deep link with an encoded message", () => {
    const url = buildWaMeUrl("06 12-34 56 78", "سلام");
    expect(url).toBe(`https://wa.me/212612345678?text=${encodeURIComponent("سلام")}`);
  });

  it("returns an empty string for unusable numbers", () => {
    expect(buildWaMeUrl(null, "hello")).toBe("");
    expect(buildWaMeUrl("غير متوفر", "hello")).toBe("");
  });
});

describe("buildAgencyWhatsAppMessage", () => {
  it("builds the Arabic listing inquiry message with ref", () => {
    expect(buildAgencyWhatsAppMessage("Dacia Duster 2023", 42)).toBe(
      "سلام، مهتم بـ: Dacia Duster 2023 (مرجع #42) من ALTUSplace. واش متاح؟",
    );
  });
});
