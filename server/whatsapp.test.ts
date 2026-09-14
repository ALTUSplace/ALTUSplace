import { describe, expect, it } from "vitest";

import { normalizeWhatsAppNumber } from "./notificationService";

describe("whatsapp number normalization", () => {
  it("normalizes local Moroccan mobile numbers", () => {
    expect(normalizeWhatsAppNumber("0612345678")).toBe("212612345678");
    expect(normalizeWhatsAppNumber("612345678")).toBe("212612345678");
  });

  it("keeps international numbers and strips formatting", () => {
    expect(normalizeWhatsAppNumber("+212 6 12 34 56 78")).toBe("212612345678");
    expect(normalizeWhatsAppNumber("212612345678")).toBe("212612345678");
  });

  it("rejects empty or non-numeric values", () => {
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber("    ")).toBeNull();
    expect(normalizeWhatsAppNumber("abc")).toBeNull();
  });
});