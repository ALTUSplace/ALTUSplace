import { describe, expect, it } from "vitest";
import {
  isRangeAvailable,
  overlaps,
  parseBlockedRanges,
  parseDateRange,
  type DateRange,
} from "../../server/availability";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("double-booking prevention - overlaps", () => {
  it("detects overlapping date ranges", () => {
    const a: DateRange = { start: date("2026-09-10"), end: date("2026-09-15") };
    const b: DateRange = { start: date("2026-09-12"), end: date("2026-09-18") };
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, a)).toBe(true);
  });

  it("treats touching booking boundaries as non-overlapping", () => {
    const a: DateRange = { start: date("2026-09-10"), end: date("2026-09-12") };
    const b: DateRange = { start: date("2026-09-12"), end: date("2026-09-14") };
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, a)).toBe(false);
  });

  it("detects fully contained ranges", () => {
    const outer: DateRange = { start: date("2026-09-01"), end: date("2026-09-30") };
    const inner: DateRange = { start: date("2026-09-10"), end: date("2026-09-15") };
    expect(overlaps(outer, inner)).toBe(true);
    expect(overlaps(inner, outer)).toBe(true);
  });

  it("returns false for completely separate ranges", () => {
    const a: DateRange = { start: date("2026-09-01"), end: date("2026-09-05") };
    const b: DateRange = { start: date("2026-09-10"), end: date("2026-09-15") };
    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, a)).toBe(false);
  });

  it("returns false for same-day start and end (zero-duration)", () => {
    const a: DateRange = { start: date("2026-09-10"), end: date("2026-09-10") };
    const b: DateRange = { start: date("2026-09-10"), end: date("2026-09-12") };
    expect(overlaps(a, b)).toBe(false);
  });
});

describe("double-booking prevention - parseBlockedRanges", () => {
  it("parses valid JSON blocked ranges", () => {
    const json = JSON.stringify([
      { start: "2026-09-10", end: "2026-09-12" },
      { start: "2026-09-15", end: "2026-09-20" },
    ]);
    const ranges = parseBlockedRanges(json);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toEqual(date("2026-09-10"));
    expect(ranges[0].end).toEqual(date("2026-09-12"));
  });

  it("returns empty array for null/undefined/empty input", () => {
    expect(parseBlockedRanges(null)).toEqual([]);
    expect(parseBlockedRanges(undefined)).toEqual([]);
    expect(parseBlockedRanges("")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseBlockedRanges("not json")).toEqual([]);
    expect(parseBlockedRanges("{invalid}")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseBlockedRanges('{"start": "2026-01-01"}')).toEqual([]);
  });

  it("filters out ranges with invalid dates", () => {
    const json = JSON.stringify([
      { start: "2026-09-10", end: "2026-09-12" },
      { start: "invalid", end: "2026-09-15" },
    ]);
    const ranges = parseBlockedRanges(json);
    expect(ranges).toHaveLength(1);
  });

  it("filters out ranges where start >= end", () => {
    const json = JSON.stringify([
      { start: "2026-09-10", end: "2026-09-12" },
      { start: "2026-09-15", end: "2026-09-10" },
      { start: "2026-09-20", end: "2026-09-20" },
    ]);
    const ranges = parseBlockedRanges(json);
    expect(ranges).toHaveLength(1);
  });

  it("filters out ranges missing start or end", () => {
    const json = JSON.stringify([
      { start: "2026-09-10", end: "2026-09-12" },
      { start: "2026-09-15" },
      { end: "2026-09-20" },
    ]);
    const ranges = parseBlockedRanges(json);
    expect(ranges).toHaveLength(1);
  });
});
