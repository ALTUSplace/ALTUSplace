import { describe, expect, it } from "vitest";
import { ADDON_CATALOG, CAR_ADDON_IDS, calculateAddOnsTotal, calculateRentalDays, calculateRentalSubtotal, parseDayDate, PROPERTY_ADDON_IDS } from "./pricing";

describe("parseDayDate", () => {
  it("parses calendar dates anchored to midday", () => {
    const date = parseDayDate("2026-08-23");
    expect(date).not.toBeNull();
    expect(date!.getHours()).toBe(12);
  });

  it("passes through full ISO timestamps", () => {
    expect(parseDayDate("2026-08-23T09:30:00")).not.toBeNull();
  });

  it("returns null for empty and malformed values", () => {
    expect(parseDayDate("")).toBeNull();
    expect(parseDayDate("not-a-date")).toBeNull();
  });
});

describe("calculateRentalDays", () => {
  it("counts full days between two dates", () => {
    expect(calculateRentalDays("2026-08-01", "2026-08-04")).toBe(3);
  });

  it("ceils partial ranges up to whole days", () => {
    expect(calculateRentalDays("2026-08-01", "2026-08-02")).toBe(1);
  });

  it("survives daylight-saving transitions with the midday anchor", () => {
    expect(calculateRentalDays("2026-04-05", "2026-04-06")).toBe(1);
  });

  it("returns 0 for inverted, same-day, empty or malformed ranges", () => {
    expect(calculateRentalDays("2026-08-05", "2026-08-01")).toBe(0);
    expect(calculateRentalDays("2026-08-01", "2026-08-01")).toBe(0);
    expect(calculateRentalDays("", "2026-08-01")).toBe(0);
    expect(calculateRentalDays("2026-08-01", "garbage")).toBe(0);
  });
});

describe("calculateRentalSubtotal", () => {
  it("multiplies the daily rate by whole days", () => {
    expect(calculateRentalSubtotal(450, 3)).toBe(1350);
  });

  it("returns 0 for invalid rates or durations", () => {
    expect(calculateRentalSubtotal(NaN, 3)).toBe(0);
    expect(calculateRentalSubtotal(0, 3)).toBe(0);
    expect(calculateRentalSubtotal(-100, 3)).toBe(0);
    expect(calculateRentalSubtotal(450, 0)).toBe(0);
    expect(calculateRentalSubtotal(450, 2.5)).toBe(0);
  });
});

describe("listing-type-aware add-on catalog", () => {
  it("defines the three property add-ons with their required fees", () => {
    expect(ADDON_CATALOG.cleaning).toMatchObject({ fee: 300, perDay: false, labelAr: "تنظيف شامل عند المغادرة" });
    expect(ADDON_CATALOG.parking).toMatchObject({ fee: 50, perDay: true, labelAr: "مكان ركن سيارة خاص" });
    expect(ADDON_CATALOG.late_checkin).toMatchObject({ fee: 100, perDay: false, labelAr: "تسجيل وصول متأخر (بعد 22:00)" });
  });

  it("keeps car and property add-on sets disjoint and covering the whole catalog", () => {
    for (const id of CAR_ADDON_IDS) expect(PROPERTY_ADDON_IDS).not.toContain(id);
    expect([...CAR_ADDON_IDS, ...PROPERTY_ADDON_IDS].sort()).toEqual(Object.keys(ADDON_CATALOG).sort());
    expect(CAR_ADDON_IDS).toContain("insurance");
    expect(PROPERTY_ADDON_IDS).not.toContain("insurance");
  });

  it("prices flat add-ons once and per-day add-ons across the whole stay", () => {
    // Property: cleaning (flat 300) + parking (50/day) + late check-in (flat 100).
    expect(calculateAddOnsTotal(["cleaning", "parking", "late_checkin"], 7)).toBe(300 + 50 * 7 + 100);
    expect(calculateAddOnsTotal(["parking"], 3)).toBe(150);
    expect(calculateAddOnsTotal(["cleaning"], 3)).toBe(300);
    expect(calculateAddOnsTotal(["late_checkin"], 3)).toBe(100);
    expect(calculateAddOnsTotal([], 3)).toBe(0);
  });
});
