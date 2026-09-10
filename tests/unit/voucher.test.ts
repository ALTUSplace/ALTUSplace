import { describe, expect, it } from "vitest";
import {
  createVoucherCode,
  createMapsSearchUrl,
  buildVoucherRenterMessage,
  buildVoucherOwnerMessage,
} from "../../shared/voucher";

describe("voucher generation - createVoucherCode", () => {
  it("creates a unique booking-scoped code with correct format", () => {
    const first = createVoucherCode(42);
    const second = createVoucherCode(42);
    expect(first).toMatch(/^B2V-42-[A-Z0-9]{10}$/);
    expect(second).toMatch(/^B2V-42-[A-Z0-9]{10}$/);
    expect(first).not.toBe(second);
  });

  it("includes the booking id in the code", () => {
    const code = createVoucherCode(999);
    expect(code).toContain("B2V-999-");
  });

  it("generates different codes for different bookings", () => {
    const code1 = createVoucherCode(1);
    const code2 = createVoucherCode(2);
    expect(code1).not.toBe(code2);
    expect(code1).toContain("B2V-1-");
    expect(code2).toContain("B2V-2-");
  });

  it("generates unique codes on multiple calls", () => {
    const codes = new Set(Array.from({ length: 100 }, () => createVoucherCode(1)));
    expect(codes.size).toBe(100);
  });
});

describe("voucher generation - createMapsSearchUrl", () => {
  it("creates an encoded Google Maps search URL", () => {
    const url = createMapsSearchUrl("مكتب النخيل", "الدار البيضاء");
    expect(url).toContain("https://www.google.com/maps/search/?api=1&query=");
    expect(url).toContain("%D9");
  });

  it("includes the title and city in the query", () => {
    const url = createMapsSearchUrl("Office Casablanca", "Casablanca");
    expect(url).toContain(encodeURIComponent("Office Casablanca, Casablanca, Morocco"));
  });

  it("handles special characters in title and city", () => {
    const url = createMapsSearchUrl("Bureau & Co.", "Rabat");
    expect(url).toContain(encodeURIComponent("Bureau & Co., Rabat, Morocco"));
  });

  it("always includes Morocco in the search query", () => {
    const url = createMapsSearchUrl("Test", "TestCity");
    expect(url).toContain("Morocco");
  });
});

describe("voucher generation - buildVoucherRenterMessage", () => {
  it("includes booking id, title, code and URL in the message", () => {
    const msg = buildVoucherRenterMessage(
      7,
      "Car Casablanca",
      "B2V-7-ABC1234567",
      "https://example.com/voucher/B2V-7-ABC1234567"
    );
    expect(msg).toContain("#7");
    expect(msg).toContain("Car Casablanca");
    expect(msg).toContain("B2V-7-ABC1234567");
    expect(msg).toContain("https://example.com/voucher/B2V-7-ABC1234567");
  });

  it("generates different messages for different bookings", () => {
    const msg1 = buildVoucherRenterMessage(1, "Car A", "CODE1", "url1");
    const msg2 = buildVoucherRenterMessage(2, "Car B", "CODE2", "url2");
    expect(msg1).not.toBe(msg2);
    expect(msg1).toContain("#1");
    expect(msg2).toContain("#2");
  });
});

describe("voucher generation - buildVoucherOwnerMessage", () => {
  it("includes booking id, title and dates in the message", () => {
    const start = new Date("2026-09-01T12:00:00.000Z");
    const end = new Date("2026-09-03T12:00:00.000Z");
    const msg = buildVoucherOwnerMessage(7, "Car Casablanca", start, end);
    expect(msg).toContain("#7");
    expect(msg).toContain("Car Casablanca");
    expect(msg).toContain(start.toISOString());
    expect(msg).toContain(end.toISOString());
  });

  it("generates different messages for different bookings", () => {
    const start = new Date("2026-09-01T12:00:00.000Z");
    const end = new Date("2026-09-03T12:00:00.000Z");
    const msg1 = buildVoucherOwnerMessage(1, "Car A", start, end);
    const msg2 = buildVoucherOwnerMessage(2, "Car B", start, end);
    expect(msg1).not.toBe(msg2);
    expect(msg1).toContain("#1");
    expect(msg2).toContain("#2");
  });
});
