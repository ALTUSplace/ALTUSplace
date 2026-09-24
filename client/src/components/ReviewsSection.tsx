import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, MessageSquare, CheckCircle2, User, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useLanguage } from '@/contexts/LanguageContext';

type ReviewsSectionProps = {
  listingId?: number;
  bookingId?: number;
};

export default function ReviewsSection({ listingId, bookingId }: ReviewsSectionProps) {
  const { t, direction } = useLanguage();
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const reviewsQuery = trpc.reviews.listByListing.useQuery(
    { listingId: listingId ?? 0 },
    { enabled: Number.isInteger(listingId) && (listingId ?? 0) > 0 },
  );
  const createReview = trpc.reviews.create.useMutation({
    onSuccess: async () => {
      setNewComment('');
      setNewRating(0);
      await reviewsQuery.refetch();
      toast.success(t("reviewSuccessMsg"));
    },
    onError: (error) => toast.error(error.message || t("reviewErrorMsg")),
  });

  const reviews = reviewsQuery.data ?? [];
  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : null;
  const trimmedLength = newComment.trim().length;
  const canSubmit = newRating >= 1 && newRating <= 5 && trimmedLength >= 10 && trimmedLength <= 500;

  const handleAddReview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!listingId || !bookingId) {
      toast.info(t("reviewNeedsCompletedBooking"));
      return;
    }
    if (newRating < 1 || newRating > 5) {
      toast.info(t("reviewRateFirst"));
      return;
    }
    createReview.mutate({ listingId, bookingId, rating: newRating, comment: newComment.trim() });
  };

  return (
    <div className="my-10 space-y-8" dir={direction}>
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="flex items-center gap-2 text-2xl font-bold">
            <Star className="h-6 w-6 fill-amber-400 text-amber-400" /> {t("reviewsSectionTitle")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("reviewsOnlyConfirmedNote")}</p>
        </div>
        {averageRating !== null && (
          <Badge className="gap-1 bg-emerald-500/10 px-3 py-1.5 text-sm font-bold text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> {averageRating.toFixed(1)} / 5 ({reviews.length})
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {reviewsQuery.isLoading && (
            <Card className="border-border shadow-sm">
              <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("reviewsLoading")}
              </CardContent>
            </Card>
          )}
          {reviewsQuery.isError && (
            <Card className="border-rose-200 shadow-sm">
              <CardContent className="p-6 text-sm text-rose-600">{t("reviewsLoadError")}</CardContent>
            </Card>
          )}
          {!reviewsQuery.isLoading && !reviewsQuery.isError && reviews.length === 0 && (
            <Card className="border-border shadow-sm">
              <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
<div aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
<Star className="h-6 w-6 text-muted-foreground" />
</div>
{t("reviewsNewEmpty")}</CardContent>
            </Card>
          )}
          {reviews.map((review) => (
            <Card key={review.id} className="border-border shadow-sm transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-start justify-between gap-3 p-5 pb-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/5 ring-offset-2 ring-offset-background font-bold text-primary">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="flex flex-wrap items-center gap-2 font-bold">
                      {review.userName || t("reviewsAnonymousUser")}
                      {review.isVerified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                          <ShieldCheck className="h-3 w-3" /> {t("reviewVerifiedBadge")}
                        </span>
                      )}
                    </h4>
                    <span className="text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString('ar-MA')}</span>
                  </div>
                </div>
                <div className="flex text-amber-400" aria-label={`التقييم ${review.rating} من 5`}>
                  {Array.from({ length: review.rating }).map((_, index) => (
                    <Star key={index} className="h-4 w-4 fill-amber-400" />
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-3">
                <p className="text-sm text-muted-foreground">{review.comment}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="h-fit border-border p-6 shadow-md">
          <h4 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <MessageSquare className="h-5 w-5 text-primary" /> {t("reviewCta")}
          </h4>
          <form onSubmit={handleAddReview} className="space-y-4">
            <div>
              <label htmlFor="review-rating" className="mb-1 block text-sm font-medium">{t("reviewRatingLabel")}</label>
              <select id="review-rating" value={newRating} onChange={(event) => setNewRating(Number(event.target.value))} className="w-full rounded-xl border border-border bg-background p-3 text-sm" required>
                <option value={0} disabled>{t("reviewRateFirst")}</option>
                <option value={5}>5 / 5 — ممتاز</option>
                <option value={4}>4 / 5 — جيد جداً</option>
                <option value={3}>3 / 5 — مقبول</option>
                <option value={2}>2 / 5 — دون المتوسط</option>
                <option value={1}>1 / 5 — ضعيف</option>
              </select>
            </div>
            <div>
              <label htmlFor="review-comment" className="mb-1 block text-sm font-medium">{t("reviewCommentLabel")}</label>
              <textarea id="review-comment" rows={4} value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder={t("reviewCommentPlaceholder")} className="w-full rounded-xl border border-border bg-background p-3 text-sm" minLength={10} maxLength={500} />
              <p className={`mt-1 text-right text-[11px] ${trimmedLength >= 10 && trimmedLength <= 500 ? "text-emerald-600" : "text-muted-foreground"}`}>{trimmedLength} / 500</p>
            </div>
            <Button type="submit" className="w-full font-bold" disabled={!canSubmit || createReview.isPending}>
              {createReview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("reviewSubmit")}
            </Button>
            <p className="text-[11px] leading-5 text-muted-foreground">{t("reviewsOnlyConfirmedNote")}</p>
          </form>
        </Card>
      </div>
    </div>
  );
}
