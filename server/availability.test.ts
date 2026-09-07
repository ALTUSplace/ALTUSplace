import { describe, expect, it } from "vitest";
import { isRangeAvailable, overlaps, parseBlockedRanges } from "./availability";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("listing availability", () => {
  it("treats touching booking boundaries as available", () => {
    expect(overlaps({ start: date("2026-09-10"), end: date("2026-09-12") }, { start: date("2026-09-12"), end: date("2026-09-14") })).toBe(false);
  });

  it("rejects requests overlapping a blocked range", () => {
    const blocked = parseBlockedRanges(JSON.stringify([{ start: "2026-09-10", end: "2026-09-12" }]));
    expect(isRangeAvailable({ start: date("2026-09-11"), end: date("2026-09-13") }, blocked)).toBe(false);
    expect(isRangeAvailable({ start: date("2026-09-12"), end: date("2026-09-13") }, blocked)).toBe(true);
  });
});