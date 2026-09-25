import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { computeWeightedOverall } from "@shared/rating";

export type ReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: number;
  bookingId: number;
  listingTitle?: string;
  onCreated?: () => void;
};

/**
 * Multi-criteria review order: cleanliness, location, value, communication and
 * accuracy — each rated 1-5. The overall rating is NOT entered directly: it is
 * computed before submission as the weighted mean of the chosen criteria (same
 * formula the server uses, see `shared/rating.ts`) and shown as a live preview.
 * Falls back to the legacy rating-only flow when a client never sends
 * sub-scores. Submits through the protected `reviews.create` procedure.
 */
const CRITERIA = [
  { key: "cleanliness", labelKey: "reviewScoreCleanliness", tipKey: "reviewScoreCleanlinessTip" },
  { key: "location", labelKey: "reviewScoreLocation", tipKey: "reviewScoreLocationTip" },
  { key: "value", labelKey: "reviewScoreValue", tipKey: "reviewScoreValueTip" },
  { key: "communication", labelKey: "reviewScoreCommunication", tipKey: "reviewScoreCommunicationTip" },
  { key: "accuracy", labelKey: "reviewScoreAccuracy", tipKey: "reviewScoreAccuracyTip" },
] as const;

type CriterionKey = (typeof CRITERIA)[number]["key"];

export default function ReviewDialog({
  open,
  onOpenChange,
  listingId,
  bookingId,
  listingTitle,
  onCreated,
}: ReviewDialogProps) {
  const { t } = useLanguage();
  const utils = trpc.useUtils();
  const [scores, setScores] = useState<Partial<Record<CriterionKey, number>>>({});
  const [comment, setComment] = useState("");

  const createReview = trpc.reviews.create.useMutation({
    onSuccess: async () => {
      toast.success(t("reviewSuccessMsg"));
      setScores({});
      setComment("");
      onOpenChange(false);
      // Refresh review lists + summaries for this listing everywhere.
      await Promise.all([
        utils.reviews.listByListing.invalidate({ listingId }),
        utils.reviews.summary.invalidate({ listingId }),
        utils.listings.getById.invalidate({ id: listingId }),
      ]);
      onCreated?.();
    },
    onError: (error) => toast.error(error.message || t("reviewErrorMsg")),
  });

  useEffect(() => {
    if (open) {
      setScores({});
      setComment("");
    }
  }, [open]);

  const trimmedLength = comment.trim().length;
  // Live preview: same weighted formula the server applies when persisting.
  const overall = computeWeightedOverall(CRITERIA.map((criterion) => scores[criterion.key] ?? null));
  const canSubmit = overall != null && trimmedLength >= 10 && trimmedLength <= 500 && !createReview.isPending;

  const setScore = (key: CriterionKey, value: number) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            {t("reviewCta")}
          </DialogTitle>
          <DialogDescription>
            {listingTitle ? `“${listingTitle}”` : t("reviewNeedsCompletedBooking")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (overall == null) {
              toast.info(t("reviewScoreAtLeastOne"));
              return;
            }
            createReview.mutate({
              listingId,
              bookingId,
              comment: comment.trim(),
              cleanlinessScore: scores.cleanliness ?? null,
              locationScore: scores.location ?? null,
              valueScore: scores.value ?? null,
              communicationScore: scores.communication ?? null,
              accuracyScore: scores.accuracy ?? null,
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-3">
            {CRITERIA.map((criterion) => {
              const value = scores[criterion.key] ?? 0;
              return (
                <fieldset key={criterion.key} className="space-y-1 border-none p-0">
                  <legend className="mb-1 flex items-center gap-1 text-sm font-medium">
                    {t(criterion.labelKey)}
                    <span title={t(criterion.tipKey)} className="inline-flex cursor-help">
                      <Info className="h-3.5 w-3.5 text-muted-foreground" aria-label={t(criterion.tipKey)} />
                    </span>
                  </legend>
                  <div className="flex items-center gap-1" role="radiogroup" aria-label={t(criterion.labelKey)}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <label key={star} className="cursor-pointer p-0.5 transition-transform hover:scale-110">
                        <input
                          type="radio"
                          name={`review-score-${criterion.key}`}
                          value={star}
                          checked={value === star}
                          onChange={() => setScore(criterion.key, star)}
                          className="sr-only"
                        />
                        <Star
                          className={`h-6 w-6 ${value >= star ? "fill-amber-400 text-amber-400" : "text-slate-400"}`}
                        />
                      </label>
                    ))}
                    {value > 0 && <span className="ms-1 text-xs font-bold text-amber-600">{value} / 5</span>}
                  </div>
                </fieldset>
              );
            })}
          </div>

          {overall != null && (
            <div className="flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">{t("reviewOverallPreview")}</span>
              <span className="font-bold text-amber-600">{overall} / 5</span>
            </div>
          )}

          <div>
            <label htmlFor="review-dialog-comment" className="mb-1 block text-sm font-medium">
              {t("reviewCommentLabel")}
            </label>
            <textarea
              id="review-dialog-comment"
              rows={4}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t("reviewCommentPlaceholder")}
              maxLength={500}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
            <p className={`mt-1 text-right text-[11px] ${trimmedLength >= 10 && trimmedLength <= 500 ? "text-emerald-600" : "text-muted-foreground"}`}>
              {trimmedLength} / 500
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={createReview.isPending}>
              {t("reviewCancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {createReview.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("reviewSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}