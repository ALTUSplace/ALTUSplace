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
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";

export type ReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: number;
  bookingId: number;
  listingTitle?: string;
  onCreated?: () => void;
};

/**
 * Post-booking review dialog. Submits through the protected `reviews.create`
 * procedure, which only accepts reviews for a booking the signed-in user owns,
 * with status Confirmed and already ended. Rating is required (1-5); the
 * comment must be 10-500 characters — the same bounds the zod schema enforces.
 */
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
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");

  const createReview = trpc.reviews.create.useMutation({
    onSuccess: async () => {
      toast.success(t("reviewSuccessMsg"));
      setRating(0);
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
      setRating(0);
      setComment("");
    }
  }, [open]);

  const trimmedLength = comment.trim().length;
  const canSubmit =
    rating >= 1 && rating <= 5 && trimmedLength >= 10 && trimmedLength <= 500 && !createReview.isPending;

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
            if (rating < 1) {
              toast.info(t("reviewRateFirst"));
              return;
            }
            createReview.mutate({ listingId, bookingId, rating, comment: comment.trim() });
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-2 block text-sm font-medium">{t("reviewRatingLabel")}</label>
            <div className="flex items-center gap-1" role="radiogroup" aria-label={t("reviewRatingLabel")}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  onMouseEnter={() => setHoverRating(value)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-0.5 transition-transform hover:scale-110"
                  aria-label={`${value} / 5`}
                  aria-checked={rating === value}
                  role="radio"
                >
                  <Star
                    className={`h-7 w-7 ${
                      (hoverRating || rating) >= value ? "fill-amber-400 text-amber-400" : "text-slate-400"
                    }`}
                  />
                </button>
              ))}
              {rating > 0 && <span className="mr-2 text-sm font-bold text-amber-600">{rating} / 5</span>}
            </div>
          </div>

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