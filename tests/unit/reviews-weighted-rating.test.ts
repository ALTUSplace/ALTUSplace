import { describe, expect, it } from "vitest";
import { computeWeightedOverall, REVIEW_CRITERIA } from "@shared/rating";

describe("computeWeightedOverall — multi-criteria weighted rating", () => {
  it("sums the documented weights to exactly 1", () => {
    const total = REVIEW_CRITERIA.reduce((sum, criterion) => sum + criterion.weight, 0);
    expect(total).toBeCloseTo(1);
  });

  it("computes the weighted overall for all five criteria and rounds to an integer", () => {
    // cleanliness .25*5 + location .10*3 + value .25*4 + communication .20*2 + accuracy .20*4
    // = 1.25 + 0.30 + 1.00 + 0.40 + 0.80 = 3.75 -> rounds to 4
    expect(computeWeightedOverall([5, 3, 4, 2, 4])).toBe(4);
  });

  it("treats a unanimous 5 (or 1) across every criterion as that value", () => {
    expect(computeWeightedOverall([5, 5, 5, 5, 5])).toBe(5);
    expect(computeWeightedOverall([1, 1, 1, 1, 1])).toBe(1);
  });

  it("renormalizes weights over the present criteria when some are missing, with no NaN", () => {
    // Only cleanliness (5, .25) and value (4, .25): (5 + 4) / 2 = 4.5 -> 5
    const result = computeWeightedOverall([5, null, 4, null, null]);
    expect(result).toBe(5);
    expect(Number.isNaN(result)).toBe(false);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("handles a single present criterion: the resulting overall is that score", () => {
    expect(computeWeightedOverall([3, null, null, null, null])).toBe(3);
    expect(computeWeightedOverall([null, null, null, 2, null])).toBe(2);
  });

  it("returns null instead of dividing by zero when every criterion is missing", () => {
    expect(computeWeightedOverall([null, null, null, null, null])).toBeNull();
    expect(computeWeightedOverall([])).toBeNull();
  });

  it("ignores undefined and non-finite values as if they were absent", () => {
    expect(computeWeightedOverall([undefined, undefined, undefined, undefined, undefined])).toBeNull();
    expect(computeWeightedOverall([Number.NaN, 4, Number.POSITIVE_INFINITY, null, undefined])).toBe(4);
    expect(computeWeightedOverall([Number.NaN, Number.NaN, Number.NaN, Number.NaN, Number.NaN])).toBeNull();
  });

  it("always yields an integer within 1-5 for any valid 1-5 combination of criteria", () => {
    for (let a = 1; a <= 5; a += 1) {
      for (let b = 1; b <= 5; b += 1) {
        for (let c = 1; c <= 5; c += 1) {
          for (let d = 1; d <= 5; d += 1) {
            for (let e = 1; e <= 5; e += 1) {
              const result = computeWeightedOverall([a, b, c, d, e]);
              expect(Number.isInteger(result)).toBe(true);
              expect(result).toBeGreaterThanOrEqual(1);
              expect(result).toBeLessThanOrEqual(5);
            }
          }
        }
      }
    }
  });
});