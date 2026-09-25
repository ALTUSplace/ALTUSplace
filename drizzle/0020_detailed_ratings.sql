-- Detailed multi-criteria ratings: five optional 1-5 sub-scores on reviews.
-- Fully additive: existing reviews keep NULL sub-scores and stay valid, and
-- the overall `rating` column (still required) remains the display aggregate.
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "cleanliness_score" smallint;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "location_score" smallint;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "value_score" smallint;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "communication_score" smallint;
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "accuracy_score" smallint;
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_scores_check" CHECK (
  "cleanliness_score" IS NULL OR ("cleanliness_score" >= 1 AND "cleanliness_score" <= 5)
) AND (
  "location_score" IS NULL OR ("location_score" >= 1 AND "location_score" <= 5)
) AND (
  "value_score" IS NULL OR ("value_score" >= 1 AND "value_score" <= 5)
) AND (
  "communication_score" IS NULL OR ("communication_score" >= 1 AND "communication_score" <= 5)
) AND (
  "accuracy_score" IS NULL OR ("accuracy_score" >= 1 AND "accuracy_score" <= 5)
);