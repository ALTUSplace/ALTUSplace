import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLATFORM_RATING_MEDIANS } from "@shared/const";
import { LanguageProvider } from "@/contexts/LanguageContext";
import RatingBreakdownBar, {
  MEDIAN_TOLERANCE,
  MIN_REVIEWS_FOR_BREAKDOWN,
  breakdownToScores,
  buildBreakdownRows,
  canShowBreakdown,
  getRatingTone,
  toBarPercent,
  toCriterionScore,
  type RatingBreakdownPayload,
} from "./RatingBreakdownBar";

/** Renders the component through the real i18n provider (no DOM needed). */
function render(props: Parameters<typeof RatingBreakdownBar>[0]): string {
  return renderToStaticMarkup(
    createElement(LanguageProvider, null, createElement(RatingBreakdownBar, props)),
  );
}

const emptyBreakdown: RatingBreakdownPayload = {
  avgCleanliness: null,
  avgLocation: null,
  avgValue: null,
  avgCommunication: null,
  avgAccuracy: null,
  totalReviews: 0,
};

describe("RatingBreakdownBar — score normalization", () => {
  it("keeps finite in-range scores and rejects everything else as no-data", () => {
    expect(toCriterionScore(4.2)).toBe(4.2);
    expect(toCriterionScore(0)).toBe(0);
    expect(toCriterionScore(5)).toBe(5);
    expect(toCriterionScore(null)).toBeNull();
    expect(toCriterionScore(undefined)).toBeNull();
    expect(toCriterionScore(Number.NaN)).toBeNull();
    expect(toCriterionScore(5.1)).toBeNull();
    expect(toCriterionScore(-1)).toBeNull();
    expect(toCriterionScore("4" as unknown as number)).toBeNull();
  });

  it("maps scores onto a full 1-5 bar, clamped and rounded to one decimal", () => {
    expect(toBarPercent(5)).toBe(100);
    expect(toBarPercent(0)).toBe(0);
    expect(toBarPercent(2.5)).toBe(50);
    expect(toBarPercent(4.2)).toBe(84);
    expect(toBarPercent(9)).toBe(100);
    expect(toBarPercent(Number.NaN)).toBe(0);
  });
});

describe("RatingBreakdownBar — median colour band (±15%)", () => {
  it("colours a criterion above the median band green", () => {
    const median = 4;
    expect(getRatingTone(4.6, median)).toBe("above");
    expect(getRatingTone(5, median)).toBe("above");
  });

  it("colours a criterion below the median band red", () => {
    const median = 4;
    expect(getRatingTone(3.4, median)).toBe("below");
    expect(getRatingTone(1, median)).toBe("below");
  });

  it("treats the band edges as outside it (±15% exactly)", () => {
    const median = 4;
    expect(4 * (1 + MEDIAN_TOLERANCE)).toBeCloseTo(4.6, 10);
    expect(getRatingTone(4.6, median)).toBe("above"); // boundary is inclusive
    expect(getRatingTone(3.4, median)).toBe("below");
    expect(getRatingTone(4.59, median)).toBe("at");
    expect(getRatingTone(3.41, median)).toBe("at");
  });

  it("treats an exact median match as neutral, never green or red", () => {
    expect(getRatingTone(4.2, 4.2)).toBe("at");
    expect(getRatingTone(4.2, 4.2)).not.toBe("above");
    expect(getRatingTone(4.2, 4.2)).not.toBe("below");
  });

  it("stays neutral without a usable baseline instead of scoring against zero", () => {
    expect(getRatingTone(4.9, null)).toBe("at");
    expect(getRatingTone(4.9, undefined)).toBe("at");
    expect(getRatingTone(4.9, 0)).toBe("at");
    expect(getRatingTone(4.9, -2)).toBe("at");
    expect(getRatingTone(4.9, Number.NaN)).toBe("at");
  });

  it("marks a criterion with no score as unknown", () => {
    expect(getRatingTone(null, 4.2)).toBe("unknown");
  });
});

describe("RatingBreakdownBar — row building", () => {
  it("returns no rows for an all-null payload (nothing to draw)", () => {
    expect(buildBreakdownRows({ cleanliness: null, location: null, value: null, communication: null, accuracy: null })).toEqual([]);
    expect(buildBreakdownRows({})).toEqual([]);
  });

  it("keeps only the rated criteria of a partial payload, in display order", () => {
    const rows = buildBreakdownRows({ cleanliness: 4, communication: 3, accuracy: null });
    expect(rows.map((row) => row.key)).toEqual(["cleanliness", "communication"]);
    expect(rows[0].percent).toBe(80);
    expect(rows[0].tone).toBe("at");
  });

  it("falls back to the platform medians when no median map is passed", () => {
    const rows = buildBreakdownRows({ cleanliness: PLATFORM_RATING_MEDIANS.cleanliness });
    expect(rows[0].median).toBe(PLATFORM_RATING_MEDIANS.cleanliness);
    expect(rows[0].delta).toBe(0);
    expect(rows[0].tone).toBe("at");
    expect(rows[0].medianPercent).toBe(84);
  });

  it("lets an explicit null median drop the baseline for that criterion", () => {
    const rows = buildBreakdownRows({ cleanliness: 5 }, { cleanliness: null });
    expect(rows[0].median).toBeNull();
    expect(rows[0].medianPercent).toBeNull();
    expect(rows[0].delta).toBeNull();
    expect(rows[0].tone).toBe("at");
  });
});

describe("RatingBreakdownBar — renderToStaticMarkup", () => {
  /** Bars carry `h-full rounded-full` + the tone class; the legend swatches are `h-2 w-2`. */
  const bars = (html: string) => html.match(/class="h-full rounded-full bg-[a-z]+-\d+"/g) ?? [];

  it("renders nothing at all when every criterion is null", () => {
    expect(render({ scores: { cleanliness: null, location: null, value: null, communication: null, accuracy: null } })).toBe("");
    expect(render({ scores: {} })).toBe("");
  });

  it("renders the Arabic heading, RTL direction and one bar per rated criterion", () => {
    // cleanliness 4.9 vs median 4.2 -> +16.7% (green); value 3.3 vs 4.0 -> -17.5% (red).
    const html = render({ scores: { cleanliness: 4.9, value: 3.3 } });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("تفاصيل التقييم حسب المعايير");
    expect(bars(html)).toHaveLength(2);
    expect(html).toMatch(/class="h-full rounded-full bg-emerald-500" style="width:98%"/);
    expect(html).toMatch(/class="h-full rounded-full bg-rose-500" style="width:66%"/);
    // Median tick placed on the inline start, so it follows the RTL direction.
    expect(html).toContain("inset-inline-start");
    // Criterion labels come from the existing review-form i18n keys.
    expect(html).toContain("النظافة");
    expect(html).toContain("القيمة مقابل السعر");
  });

  it("omits unrated criteria entirely rather than drawing an empty bar", () => {
    const html = render({ scores: { location: 3 } });
    expect(html).toContain("الموقع");
    expect(html).not.toContain("النظافة");
    expect(html).not.toContain("دقة الوصف");
    expect(bars(html)).toHaveLength(1);
  });

  it("marks an exact median match neutral (amber), never green or red", () => {
    const html = render({ scores: { communication: 4.4 }, median: { communication: 4.4 } });
    expect(bars(html)).toEqual(['class="h-full rounded-full bg-amber-400"']);
    expect(html).toContain("4.4 / 5");
  });

  it("honours a custom title and renders in the active direction", () => {
    expect(render({ scores: { value: 4 }, title: "تقييم مخصص" })).toContain("تقييم مخصص");
  });
});

describe("RatingBreakdownBar — listings.getById payload mapping", () => {
  it("shows the breakdown only from the third review on", () => {
    expect(canShowBreakdown({ ...emptyBreakdown, totalReviews: MIN_REVIEWS_FOR_BREAKDOWN - 1 })).toBe(false);
    expect(canShowBreakdown({ ...emptyBreakdown, totalReviews: MIN_REVIEWS_FOR_BREAKDOWN })).toBe(true);
    expect(canShowBreakdown({ ...emptyBreakdown, totalReviews: 12 })).toBe(true);
  });

  it("never shows a breakdown without a payload or a sane count", () => {
    expect(canShowBreakdown(null)).toBe(false);
    expect(canShowBreakdown(undefined)).toBe(false);
    expect(canShowBreakdown(emptyBreakdown)).toBe(false);
    expect(canShowBreakdown({ ...emptyBreakdown, totalReviews: Number.NaN })).toBe(false);
  });

  it("maps the server breakdown onto criterion keys without losing nulls", () => {
    expect(
      breakdownToScores({
        avgCleanliness: 4.5,
        avgLocation: null,
        avgValue: 3.5,
        avgCommunication: 4.4,
        avgAccuracy: 4,
        totalReviews: 5,
      }),
    ).toEqual({
      cleanliness: 4.5,
      location: null,
      value: 3.5,
      communication: 4.4,
      accuracy: 4,
    });
  });
});
