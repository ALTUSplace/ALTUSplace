import { describe, expect, it } from "vitest";
import { isRangeBlocked, normalizeBlockedRanges } from "./bookingAvailability";

describe("normalizeBlockedRanges", () => {
  it("slices YYYY-MM-DD out of API timestamps", () => {
    expect(
      normalizeBlockedRanges([
        { start: "2026-10-12T10:00:00.000Z", end: "2026-10-14T10:00:00.000Z" },
      ]),
    ).toEqual([{ start: "2026-10-12", end: "2026-10-14" }]);
  });

  it("handles already-sliced or empty payloads", () => {
    expect(normalizeBlockedRanges([{ start: "2026-10-12", end: "2026-10-14" }])).toEqual([
      { start: "2026-10-12", end: "2026-10-14" },
    ]);
    expect(normalizeBlockedRanges([])).toEqual([]);
  });
});

describe("isRangeBlocked", () => {
  const ranges = [{ start: "2026-10-12", end: "2026-10-14" }];

  it("returns false for an empty selection", () => {
    expect(isRangeBlocked("", "", ranges)).toBe(false);
  });

  it("returns false for an inverted selection", () => {
    expect(isRangeBlocked("2026-10-20", "2026-10-10", ranges)).toBe(false);
  });

  it("detects overlap on either edge and fully inside", () => {
    expect(isRangeBlocked("2026-10-12", "2026-10-14", ranges)).toBe(true);
    expect(isRangeBlocked("2026-10-10", "2026-10-13", ranges)).toBe(true);
    expect(isRangeBlocked("2026-10-13", "2026-10-15", ranges)).toBe(true);
  });

  it("treats adjacent ranges as not blocked (end-exclusive)", () => {
    expect(isRangeBlocked("2026-10-14", "2026-10-16", ranges)).toBe(false);
    expect(isRangeBlocked("2026-10-10", "2026-10-12", ranges)).toBe(false);
  });

  it("returns false with no blocked ranges", () => {
    expect(isRangeBlocked("2026-10-13", "2026-10-15", [])).toBe(false);
  });
});