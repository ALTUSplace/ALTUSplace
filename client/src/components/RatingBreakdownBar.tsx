import { BarChart3 } from "lucide-react";
import { PLATFORM_RATING_MEDIANS, type RatingCriterionKey } from "@shared/const";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

/** Ratings are on a 1-5 scale, so a full bar is 5. */
export const RATING_MAX = 5;

/**
 * Colour band around the platform median, as a fraction of the median itself:
 * a criterion more than 15% above it reads green, more than 15% below reads red,
 * anything in between (including an exact match) reads neutral amber.
 */
export const MEDIAN_TOLERANCE = 0.15;

/**
 * Below this many reviews the breakdown is hidden: averages computed from one or
 * two sub-scores are noise, and a bar chart implies a precision we do not have.
 */
export const MIN_REVIEWS_FOR_BREAKDOWN = 3;

/** Criteria in display order, matching the review form. */
export const CRITERION_ORDER: readonly RatingCriterionKey[] = [
  "cleanliness",
  "location",
  "value",
  "communication",
  "accuracy",
] as const;

const CRITERION_LABEL_KEYS: Record<RatingCriterionKey, string> = {
  cleanliness: "reviewScoreCleanliness",
  location: "reviewScoreLocation",
  value: "reviewScoreValue",
  communication: "reviewScoreCommunication",
  accuracy: "reviewScoreAccuracy",
};

export type RatingTone = "above" | "at" | "below" | "unknown";

const TONE_STYLES: Record<RatingTone, { bar: string; value: string; legend: string }> = {
  above: { bar: "bg-emerald-500", value: "text-emerald-600", legend: "text-emerald-600" },
  at: { bar: "bg-amber-400", value: "text-amber-600", legend: "text-amber-600" },
  below: { bar: "bg-rose-500", value: "text-rose-600", legend: "text-rose-600" },
  unknown: { bar: "bg-muted-foreground/40", value: "text-muted-foreground", legend: "text-muted-foreground" },
};

/** The `ratingBreakdown` object returned by `listings.getById`. */
export type RatingBreakdownPayload = {
  avgCleanliness: number | null;
  avgLocation: number | null;
  avgValue: number | null;
  avgCommunication: number | null;
  avgAccuracy: number | null;
  totalReviews: number;
};

export type BreakdownRow = {
  key: RatingCriterionKey;
  score: number;
  median: number | null;
  delta: number | null;
  tone: RatingTone;
  percent: number;
  medianPercent: number | null;
};

export type RatingBreakdownBarProps = {
  /** Criterion key -> average score, or null when nobody rated that criterion. */
  scores: Record<string, number | null | undefined>;
  /** Criterion key -> comparison median. Defaults to the platform medians; pass an explicit null to drop a baseline. */
  median?: Record<string, number | null | undefined>;
  /** Overrides the localized section heading. */
  title?: string;
  className?: string;
};

/**
 * Accepts only finite scores inside the 1-5 range; anything else (null,
 * undefined, NaN, out of range, wrong type) is "no data" rather than a bar we
 * would have to clamp into something we did not measure.
 */
export function toCriterionScore(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > RATING_MAX) return null;
  return value;
}

/** Score -> bar width in percent of a full 1-5 bar, rounded to one decimal. */
export function toBarPercent(score: number): number {
  if (!Number.isFinite(score)) return 0;
  const clamped = Math.min(Math.max(score, 0), RATING_MAX);
  return Math.round((clamped / RATING_MAX) * 1000) / 10;
}

/**
 * Colour band for one criterion. Without a usable median (> 0) there is nothing
 * honest to compare against, so the criterion is neutral instead of being
 * scored as if the median were 0 (which would make everything look green).
 *
 * The band edges are inclusive, and the delta is rounded to 9 decimals before
 * comparing: scores and medians are 1-decimal numbers, so the raw float ratio
 * of an exact +/-15% pair lands a few 1e-17 off the threshold
 * ((4.6 - 4) / 4 === 0.1499999999999999) and the colour would otherwise depend
 * on rounding noise rather than on the score.
 */
export function getRatingTone(score: number | null, median?: number | null): RatingTone {
  if (score === null) return "unknown";
  if (median === null || median === undefined || !Number.isFinite(median) || median <= 0) return "at";
  const delta = Math.round(((score - median) / median) * 1e9) / 1e9;
  if (delta >= MEDIAN_TOLERANCE) return "above";
  if (delta <= -MEDIAN_TOLERANCE) return "below";
  return "at";
}

/**
 * Builds the render rows: one per criterion that actually has a score, with the
 * comparison baseline applied. Criteria with no data are dropped entirely
 * (sparse ratings are the whole reason this section hides itself), so an
 * all-null input yields zero rows.
 *
 * Unset medians fall back to the platform medians; an explicit `null` in the
 * `median` map drops the baseline for that criterion.
 */
export function buildBreakdownRows(
  scores: Record<string, number | null | undefined>,
  median?: Record<string, number | null | undefined>,
): BreakdownRow[] {
  const baselines = { ...PLATFORM_RATING_MEDIANS, ...(median ?? {}) };
  return CRITERION_ORDER.flatMap((key) => {
    const score = toCriterionScore(scores?.[key]);
    if (score === null) return [];
    const baseline = toCriterionScore(baselines[key]);
    return [
      {
        key,
        score,
        median: baseline,
        delta: baseline === null ? null : (score - baseline) / baseline,
        tone: getRatingTone(score, baseline),
        percent: toBarPercent(score),
        medianPercent: baseline === null ? null : toBarPercent(baseline),
      },
    ];
  });
}

/** Whether a listing has enough reviews for its breakdown to be shown at all. */
export function canShowBreakdown(breakdown: RatingBreakdownPayload | null | undefined): boolean {
  return Boolean(breakdown && Number.isFinite(breakdown.totalReviews) && breakdown.totalReviews >= MIN_REVIEWS_FOR_BREAKDOWN);
}

/** Maps the `listings.getById` breakdown onto the component's `scores` prop. */
export function breakdownToScores(breakdown: RatingBreakdownPayload): Record<RatingCriterionKey, number | null> {
  return {
    cleanliness: breakdown.avgCleanliness,
    location: breakdown.avgLocation,
    value: breakdown.avgValue,
    communication: breakdown.avgCommunication,
    accuracy: breakdown.avgAccuracy,
  };
}

/**
 * Horizontal rating-breakdown bars: one row per criterion comparing this
 * listing's average against the platform median, colour-coded within +/-15% of
 * it. Layout is direction-agnostic (the bar and the median tick are positioned
 * with the inline start, so they grow from the right under `dir="rtl"`).
 * Renders nothing when no criterion has a score.
 */
export default function RatingBreakdownBar({ scores, median, title, className }: RatingBreakdownBarProps) {
  const { t, direction } = useLanguage();
  const rows = buildBreakdownRows(scores, median);
  if (rows.length === 0) return null;

  const heading = title ?? t("ratingBreakdownTitle");
  const legend: Array<{ tone: RatingTone; label: string }> = [
    { tone: "above", label: t("ratingBreakdownLegendAbove") },
    { tone: "at", label: t("ratingBreakdownLegendAt") },
    { tone: "below", label: t("ratingBreakdownLegendBelow") },
  ];

  return (
    <section className={cn("space-y-4", className)} dir={direction} aria-label={heading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          <BarChart3 className="h-4 w-4 text-amber-500" aria-hidden="true" />
          {heading}
        </h3>
        <p className="text-[11px] text-muted-foreground">{t("ratingBreakdownMedianHint")}</p>
      </div>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">{t(CRITERION_LABEL_KEYS[row.key])}</span>
              <span className="flex items-center gap-2">
                {row.median !== null && (
                  <span className="text-muted-foreground">
                    {t("ratingBreakdownMedianLabel")} {row.median.toFixed(1)}
                  </span>
                )}
                <span className={cn("font-bold", TONE_STYLES[row.tone].value)}>
                  {row.score.toFixed(1)} / {RATING_MAX}
                </span>
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", TONE_STYLES[row.tone].bar)}
                style={{ width: `${row.percent}%` }}
              />
              {row.medianPercent !== null && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 w-0.5 bg-foreground/40"
                  style={{ insetInlineStart: `${row.medianPercent}%` }}
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      <ul className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        {legend.map((entry) => (
          <li key={entry.tone} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", TONE_STYLES[entry.tone].bar)} aria-hidden="true" />
            <span className={TONE_STYLES[entry.tone].legend}>{entry.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
