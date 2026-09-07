import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl, normalizeWhatsAppNumber } from "./whatsapp";

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
