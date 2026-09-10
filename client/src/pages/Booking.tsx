import { useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { ArrowRight, CalendarDays, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { OptimizedImage } from '@/components/OptimizedImage';
import { useAuth } from '@/_core/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { RENTAL_TERMS } from '@/lib/rentalTerms';
import { isKycSatisfiedFor, KYC_STATUS_CONFIG, type KycStatus } from '@/lib/kyc';

export default function BookingPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const { t, direction, language } = useLanguage();

  // Safely parse listing ID — reject missing, non-numeric, or non-positive values
  const rawListingId = params.get('listingId') || params.get('carId') || '';
  const parsedListingId = Number(rawListingId);
  const listingId = Number.isInteger(parsedListingId) && parsedListingId > 0 ? parsedListingId : null;
  const hasMissingId = !rawListingId.trim();

  const startDate = params.get('startDate') || '';
  const endDate = params.get('endDate') || '';
  const listingQuery = trpc.listings.getById.useQuery(
    { id: listingId! },
    { enabled: listingId !== null },
  );
  const [isContinuing, setIsContinuing] = useState(false);
  const validDates = Boolean(startDate && endDate && new Date(endDate) > new Date(startDate));

  // KYC gate — mirrors the server-side enforcement in bookings.create:
  // unverified/pending/rejected profiles cannot continue to checkout.
  const { isAuthenticated } = useAuth();
  const kycStatusQuery = trpc.kyc.status.useQuery(undefined, { enabled: isAuthenticated });
  const listingCategory = listingQuery.data?.category ?? null;
  const kycVerified = !isAuthenticated
    || (kycStatusQuery.data
      ? isKycSatisfiedFor(kycStatusQuery.data.status as KycStatus, kycStatusQuery.data.approvedDocumentTypes, listingCategory)
      : false);
  const kycBlocked = isAuthenticated && kycStatusQuery.isSuccess && !kycVerified;
  const kycStatusLabel = kycStatusQuery.data
    ? KYC_STATUS_CONFIG[kycStatusQuery.data.status as KycStatus]?.label[direction === 'rtl' ? 'ar' : 'fr']
    : '';

  const continueToCheckout = () => {
    if (!listingQuery.data || !validDates) {
      toast.error('يرجى اختيار إعلان منشور وتواريخ صحيحة قبل المتابعة.');
      return;
    }
    if (isAuthenticated && !kycVerified) {
      toast.error('التحقق من الهوية مطلوب قبل إتمام الحجز. يرجى رفع وثيقتك أولاً.');
      setLocation('/kyc');
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

  // Missing or invalid listing ID — show friendly message before any query
  if (hasMissingId || listingId === null) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4" dir={direction}>
        <Card className="max-w-lg w-full">
          <CardHeader><CardTitle>رابط الحجز غير مكتمل</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>لم يتم العثور على معرّف الإعلان في رابط الحجز. يرجى اختيار إعلان من صفحة البحث لبدء الحجز.</p>
            <Button onClick={() => setLocation('/search')} className="gap-2"><ArrowRight className="w-4 h-4" /> العودة إلى البحث</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (listingQuery.isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground"><Loader2 className="animate-spin mr-2" /> جاري التحقق من الإعلان...</div>;
  }

  if (!listingQuery.data || listingQuery.isError) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4" dir={direction}>
        <Card className="max-w-lg w-full">
          <CardHeader><CardTitle>تعذر فتح الحجز</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-muted-foreground">
            <p>الإعلان المطلوب غير متاح حالياً أو تم إزالته. يمكنك استكشاف عروض أخرى من صفحة البحث.</p>
            <Button onClick={() => setLocation('/search')} className="gap-2"><ArrowRight className="w-4 h-4" /> العودة إلى البحث</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4" dir={direction}>
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
            {kycBlocked ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm space-y-3 dark:border-amber-700 dark:bg-amber-950/30" role="alert">
                <p className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                  <ShieldAlert className="h-4 w-4" />
                  {language === 'ar' ? `التحقق من الهوية مطلوب (${kycStatusLabel})` : `Vérification d'identité requise (${kycStatusLabel})`}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {language === 'ar'
                    ? 'لا يمكن إتمام الحجز قبل الموافقة على وثيقة هويتك. ارفع الوثيقة المناسبة (رخصة القيادة للسيارات، بطاقة التعريف أو جواز السفر للعقارات) ثم عد لهذه الصفحة.'
                    : "La réservation est bloquée jusqu'à la validation de votre pièce d'identité. Téléversez le document requis (permis pour les voitures, CNI ou passeport pour les séjours) puis revenez."}
                </p>
                <Button onClick={() => setLocation('/kyc')} className="w-full gap-2 bg-amber-500 font-bold text-slate-950 hover:bg-amber-600">
                  <ShieldAlert className="h-4 w-4" />
                  {language === 'ar' ? 'إكمال التحقق من الهوية' : "Compléter la vérification d'identité"}
                </Button>
              </div>
            ) : (
              <Button onClick={continueToCheckout} disabled={!validDates || isContinuing} className="w-full">{isContinuing ? 'جاري المتابعة...' : 'المتابعة إلى الدفع الآمن'}</Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
