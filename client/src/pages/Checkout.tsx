import { useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { calculateRentalDays, calculateRentalSubtotal } from '@/lib/pricing';
import { useAuth } from '@/_core/hooks/useAuth';
import { isKycSatisfiedFor, KYC_STATUS_CONFIG, type KycStatus } from '@/lib/kyc';
import PaymentCheckoutModal from '@/components/PaymentCheckoutModal';
import { LISTINGS } from '@/data/altusplace';
import { calculateRentalDays as calcDays } from '@/lib/pricing';

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);

  const rawListingId = searchParams.get('listingId') || '';
  const parsedListingId = Number(rawListingId);
  const startDateParam = searchParams.get('startDate') || '';
  const endDateParam = searchParams.get('endDate') || '';

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cmi_card' | 'cash'>('cmi_card');
  const [creatingBooking, setCreatingBooking] = useState(false);

  const { data: listing, isLoading, error } = trpc.listings.getById.useQuery(
    { id: parsedListingId },
    { enabled: !isNaN(parsedListingId) && parsedListingId > 0 }
  );

  // Static seed fallback so checkout works for demo listings (l1..l8) too.
  const staticListing = !listing ? LISTINGS.find((item) => item.id === rawListingId) : undefined;
  const resolvedListing = listing ?? staticListing;
  const resTitle = resolvedListing?.title ?? rawListingId;
  const resPricePerDay = resolvedListing
    ? ('pricePerDay' in resolvedListing ? resolvedListing.pricePerDay : resolvedListing.pricePerUnit)
    : Number(searchParams.get('pricePerDay') ?? 0);

  const bookingMutation = trpc.bookings.create.useMutation();

  // KYC gate — mirrors the server-side enforcement in payments.create:
  // unverified/pending/rejected profiles cannot open the payment flow.
  const { isAuthenticated } = useAuth();
  const kycStatusQuery = trpc.kyc.status.useQuery(undefined, { enabled: isAuthenticated });
  const kycVerified = !isAuthenticated
    || (kycStatusQuery.data
      ? isKycSatisfiedFor(kycStatusQuery.data.status as KycStatus, kycStatusQuery.data.approvedDocumentTypes, listing?.category ?? null)
      : false);
  const kycBlocked = isAuthenticated && kycStatusQuery.isSuccess && !kycVerified;
  const kycStatusLabel = kycStatusQuery.data
    ? KYC_STATUS_CONFIG[kycStatusQuery.data.status as KycStatus]?.label.ar
    : '';

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    const bookingDays = calcDays(startDateParam, endDateParam);
    if (!startDateParam || !endDateParam || bookingDays <= 0) {
      toast.error('يرجى تحديد تواريخ استلام وإرجاع صحيحة قبل تأكيد الدفع.');
      return;
    }
    if (isAuthenticated && !kycVerified) {
      toast.error('التحقق من الهوية مطلوب قبل الدفع. يرجى رفع وثيقتك أولاً.');
      setLocation('/kyc');
      return;
    }
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = (payload: { transactionId: string }) => {
    if (creatingBooking) return;
    const bookingDays = calcDays(startDateParam, endDateParam);
    if (isNaN(parsedListingId) || parsedListingId <= 0 || bookingDays <= 0) {
      toast.error('تعذر إتمام الحجز: معرّف الإعلان أو التواريخ غير صالحة.');
      return;
    }
    setCreatingBooking(true);
    bookingMutation.mutate(
      { listingId: parsedListingId, startDate: startDateParam, endDate: endDateParam },
      {
        onSuccess: (result) => {
          toast.success('تم تأكيد الحجز بنجاح! رقم الحجز: ALT-' + result.bookingId);
          setLocation(`/success?bookingId=${result.bookingId}&language=ar`);
        },
        onError: (err) => {
          toast.error('تعذر حفظ الحجز في قاعدة البيانات: ' + (err.message ?? 'خطأ غير متوقع.'));
          setCreatingBooking(false);
        },
      },
    );
  };

  if (isLoading) {
    return <LoadingAnimation />;
  }

  if (error || (!listing && !staticListing) || (!isNaN(parsedListingId) && parsedListingId <= 0)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg text-slate-600 mb-4">تعذر تحميل العروض حالياً. يرجى المحاولة مرة أخرى بعد قليل.</p>
        <Button onClick={() => setLocation('/')}>الرجوع</Button>
      </div>
    );
  }

  const bookingStart = startDateParam || new Date().toISOString().slice(0, 10);
  const bookingEnd = endDateParam || new Date().toISOString().slice(0, 10);
  const days = calculateRentalDays(bookingStart, bookingEnd);
  const subtotal = calculateRentalSubtotal(resPricePerDay > 0 ? resPricePerDay : (listing?.pricePerDay || 0), days);

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-5 sm:space-y-7 p-4">
        <form onSubmit={handleCheckout} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">تفاصيل الحجز</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="font-semibold">{resTitle}</p>
                <p className="text-sm text-slate-500">المدة: {days} أيام</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">طريقة الدفع</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div 
                  onClick={() => setPaymentMethod('cmi_card')}
                  className={`p-4 rounded-xl border-2 cursor-pointer flex items-center gap-3 transition-all ${
                    paymentMethod === 'cmi_card' ? 'border-amber-500 bg-amber-50 shadow-sm' : 'border-slate-200'
                  }`}
                >
                  <CreditCard className="w-6 h-6 text-amber-600" />
                  <div>
                    <p className="font-semibold">بطاقة بانكية (CMI)</p>
                    <p className="text-xs text-slate-500">دفع آمن ومباشر عبر البطاقة</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-lg">ملخص الطلب</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span>المجموع</span>
                  <span className="font-semibold">{subtotal} درهم</span>
                </div>
                {kycBlocked ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400" role="alert">
                    <p className="flex items-center gap-1.5 font-bold">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {`التحقق من الهوية مطلوب (${kycStatusLabel})`}
                    </p>
                    <p className="mt-1">لا يمكن إتمام الدفع قبل الموافقة على وثيقة هويتك.</p>
                    <Button type="button" onClick={() => setLocation('/kyc')} className="mt-2 w-full bg-amber-500 font-bold text-slate-950 hover:bg-amber-600">
                      إكمال التحقق من الهوية
                    </Button>
                  </div>
                ) : (
                  <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                    تأكيد الدفع
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </form>
      </div>

      <PaymentCheckoutModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={handlePaymentSuccess}
        amount={subtotal}
        currency="درهم"
      />
    </>
  );
}