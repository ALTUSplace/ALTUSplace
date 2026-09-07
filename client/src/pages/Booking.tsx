import { useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { ArrowRight, CalendarDays, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { OptimizedImage } from '@/components/OptimizedImage';
import { useLanguage } from '@/contexts/LanguageContext';
import { RENTAL_TERMS } from '@/lib/rentalTerms';

export default function BookingPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const { t } = useLanguage();
  const listingId = Number(params.get('listingId') || params.get('carId'));
  const startDate = params.get('startDate') || '';
  const endDate = params.get('endDate') || '';
  const listingQuery = trpc.listings.getById.useQuery(
    { id: listingId },
    { enabled: Number.isInteger(listingId) && listingId > 0 },
  );
  const [isContinuing, setIsContinuing] = useState(false);
  const validDates = Boolean(startDate && endDate && new Date(endDate) > new Date(startDate));

  const continueToCheckout = () => {
    if (!listingQuery.data || !validDates) {
      toast.error('يرجى اختيار إعلان منشور وتواريخ صحيحة قبل المتابعة.');
      return;
    }
    setIsContinuing(true);
    const checkout = new URLSearchParams({
      listingId: String(listingQuery.data.id),
      title: listingQuery.data.title,
      pricePerDay: String(listingQuery.data.pricePerDay),
      startDate,
      endDate,
    });
    setLocation(`/checkout?${checkout.toString()}`);
  };

  if (listingQuery.isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground"><Loader2 className="animate-spin mr-2" /> جاري التحقق من الإعلان...</div>;
  }

  if (!listingQuery.data || listingQuery.isError) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4" dir="rtl">
        <Card className="max-w-lg w-full">
          <CardHeader><CardTitle>تعذر فتح الحجز</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>رابط الحجز غير صالح أو أن الإعلان لم يعد متاحاً. لا نستخدم بيانات محلية أو مبالغ من الرابط.</p>
            <Button onClick={() => setLocation('/search')} className="gap-2"><ArrowRight className="w-4 h-4" /> العودة إلى البحث</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader><CardTitle>مراجعة طلب الحجز</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-4 items-center">
              {listingQuery.data.imageUrl && <OptimizedImage src={listingQuery.data.imageUrl} alt={listingQuery.data.title} width={192} height={160} widthHint={192} sizes="96px" className="w-24 h-20 rounded-lg object-cover" />}
              <div><h2 className="font-bold">{listingQuery.data.title}</h2><p className="text-sm text-muted-foreground">{listingQuery.data.city} · {listingQuery.data.pricePerDay} درهم / اليوم</p></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-muted rounded-lg flex gap-2 items-center"><CalendarDays className="w-4 h-4" /> الاستلام: {startDate || 'غير محدد'}</div>
              <div className="p-3 bg-muted rounded-lg flex gap-2 items-center"><CalendarDays className="w-4 h-4" /> الإرجاع: {endDate || 'غير محدد'}</div>
            </div>
            <p className="text-xs text-muted-foreground">سيُحسب السعر النهائي والعمولة والضريبة داخل الخادم بعد تسجيل الدخول. هذه الصفحة لا تستقبل مبلغاً موثوقاً من الرابط.</p>
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1" aria-label={t("rentalConditions")}>
              <p className="font-bold text-foreground">{t("rentalConditions")}</p>
              <p className="text-muted-foreground leading-relaxed">
                {t("minDriverAge")}: {RENTAL_TERMS.minDriverAge}+ · {t("securityDeposit")}: {RENTAL_TERMS.securityDepositMad} {t("madUnit")} · {t("dailyMileageLimit")}: {RENTAL_TERMS.dailyMileageKm} {t("kmPerDay")}
              </p>
            </div>
            <Button onClick={continueToCheckout} disabled={!validDates || isContinuing} className="w-full">{isContinuing ? 'جاري المتابعة...' : 'المتابعة إلى الدفع الآمن'}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
