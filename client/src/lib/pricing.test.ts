import { describe, expect, it } from "vitest";
import { calculateRentalDays, calculateRentalSubtotal, parseDayDate } from "./pricing";

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
