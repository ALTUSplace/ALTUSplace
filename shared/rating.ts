/**
 * Multi-criteria review scoring — the single source of truth for the weighted
 * overall rating, shared by:
 *
 *  - the server (`reviews.create` stores the computed overall in the integer
 *    `reviews.rating` column), and
 *  - the client (`ReviewDialog` shows a live preview of exactly the same
 *    number before the review is submitted).
 *
 * The overall is the weighted mean of the five criterion scores (each 1-5),
 * rounded to the nearest integer so it fits the existing `rating` column.
 * Weights (sum = 1):
 *
 *   cleanliness  0.25   (25%)  — vehicle/unit state on handover
 *   value        0.25   (25%)  — price vs. quality of the offer
 *   communication 0.20  (20%)  — owner/agency responsiveness
 *   accuracy     0.20   (20%)  — description/photos match reality
 *   location     0.10   (10%)  — accessibility and surroundings
 *
 * Missing/null criteria are skipped and the remaining weights are renormalized
 * (their sum is recomputed and used as the divisor), so partial ratings never
 * divide by zero and never yield NaN/Infinity.
 */

/** Ordered like the DB columns: index 0..4 = cleanliness, location, value, communication, accuracy. */
export const REVIEW_CRITERIA = [
  { key: "cleanliness", weight: 0.25 },
  { key: "location", weight: 0.1 },
  { key: "value", weight: 0.25 },
  { key: "communication", weight: 0.2 },
  { key: "accuracy", weight: 0.2 },
] as const;

export type ReviewSubScore = number | null | undefined;

/**
 * Computes the weighted overall rating (1-5) from the five criterion scores.
 * Expects exactly 5 entries aligned with `REVIEW_CRITERIA` (cleanliness,
 * location, value, communication, accuracy). Returns `null` when every
 * criterion is missing — callers must treat that as "nothing rated".
 */
export function computeWeightedOverall(scores: readonly ReviewSubScore[]): number | null {
  type WeightedEntry = { weight: number; score: ReviewSubScore };
  const entries: WeightedEntry[] = REVIEW_CRITERIA.map((criterion, index) => ({
    weight: criterion.weight,
    score: scores[index],
  }));
  const present = entries.filter((entry): entry is { weight: number; score: number } =>
    typeof entry.score === "number" && Number.isFinite(entry.score),
  );
  if (present.length === 0) return null;
  const totalWeight = present.reduce((sum, entry) => sum + entry.weight, 0);
  const weighted = present.reduce((sum, entry) => sum + entry.weight * entry.score, 0) / totalWeight;
  return Math.round(weighted);
}