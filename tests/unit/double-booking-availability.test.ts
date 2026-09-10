import { describe, expect, it } from "vitest";
import {
  isRangeAvailable,
  parseBlockedRanges,
  parseDateRange,
  type DateRange,
} from "../../server/availability";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("double-booking prevention - isRangeAvailable", () => {
  it("returns true when no blocked ranges exist", () => {
    const request: DateRange = { start: date("2026-09-10"), end: date("2026-09-15") };
    expect(isRangeAvailable(request, [])).toBe(true);
  });

  it("returns true when request does not overlap any blocked range", () => {
    const blocked: DateRange[] = [
      { start: date("2026-09-01"), end: date("2026-09-05") },
      { start: date("2026-09-20"), end: date("2026-09-25") },
    ];
    const request: DateRange = { start: date("2026-09-10"), end: date("2026-09-15") };
    expect(isRangeAvailable(request, blocked)).toBe(true);
  });

  it("returns false when request overlaps a blocked range", () => {
    const blocked: DateRange[] = [
      { start: date("2026-09-10"), end: date("2026-09-12") },
    ];
    const request: DateRange = { start: date("2026-09-11"), end: date("2026-09-13") };
    expect(isRangeAvailable(request, blocked)).toBe(false);
  });

  it("returns true when request starts exactly when blocked range ends", () => {
    const blocked: DateRange[] = [
      { start: date("2026-09-10"), end: date("2026-09-12") },
    ];
    const request: DateRange = { start: date("2026-09-12"), end: date("2026-09-15") };
    expect(isRangeAvailable(request, blocked)).toBe(true);
  });

  it("returns false when request is fully contained within a blocked range", () => {
    const blocked: DateRange[] = [
      { start: date("2026-09-01"), end: date("2026-09-30") },
    ];
    const request: DateRange = { start: date("2026-09-10"), end: date("2026-09-15") };
    expect(isRangeAvailable(request, blocked)).toBe(false);
  });

  it("returns false when request fully contains a blocked range", () => {
    const blocked: DateRange[] = [
      { start: date("2026-09-10"), end: date("2026-09-12") },
    ];
    const request: DateRange = { start: date("2026-09-05"), end: date("2026-09-20") };
    expect(isRangeAvailable(request, blocked)).toBe(false);
  });

  it("handles multiple blocked ranges correctly", () => {
    const blocked = parseBlockedRanges(JSON.stringify([
      { start: "2026-09-01", end: "2026-09-05" },
      { start: "2026-09-10", end: "2026-09-12" },
      { start: "2026-09-20", end: "2026-09-25" },
    ]));
    expect(isRangeAvailable({ start: date("2026-09-06"), end: date("2026-09-09") }, blocked)).toBe(true);
    expect(isRangeAvailable({ start: date("2026-09-11"), end: date("2026-09-13") }, blocked)).toBe(false);
    expect(isRangeAvailable({ start: date("2026-09-26"), end: date("2026-09-28") }, blocked)).toBe(true);
  });
});

describe("double-booking prevention - parseDateRange", () => {
  it("parses valid date range", () => {
    const range = parseDateRange("2026-09-10", "2026-09-15");
    expect(range).not.toBeNull();
    expect(range!.start).toEqual(date("2026-09-10"));
    expect(range!.end).toEqual(date("2026-09-15"));
  });

  it("returns null when start >= end", () => {
    expect(parseDateRange("2026-09-15", "2026-09-10")).toBeNull();
    expect(parseDateRange("2026-09-10", "2026-09-10")).toBeNull();
  });

  it("returns null for invalid dates", () => {
    expect(parseDateRange("invalid", "2026-09-15")).toBeNull();
    expect(parseDateRange("2026-09-10", "invalid")).toBeNull();
  });

  it("returns null for empty strings", () => {
    expect(parseDateRange("", "")).toBeNull();
    expect(parseDateRange("2026-09-10", "")).toBeNull();
    expect(parseDateRange("", "2026-09-15")).toBeNull();
  });
});
