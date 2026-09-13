import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, Loader2, ShieldAlert, ShieldCheck, Check, Sparkles, Building2, Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import {
  ADDON_CATALOG,
  calculateCheckoutTotal,
  calculateRentalDays,
  isAddOnId,
  type AddOnId,
} from '@/lib/pricing';
import { useAuth } from '@/_core/hooks/useAuth';
import { isKycSatisfiedFor, KYC_STATUS_CONFIG, type KycStatus } from '@/lib/kyc';
import PaymentCheckoutModal, { type PaymentMethod } from '@/components/PaymentCheckoutModal';
import { LISTINGS } from '@/data/altusplace';
import { useCurrency } from '@/contexts/CurrencyContext';
import {
  CHECKOUT_CURRENCIES,
  GATEWAYS,
  gatewaysForCurrency,
  gatewaySupportsCurrency,
  type CheckoutCurrency,
  type GatewayCode,
} from '@/lib/payments';

const ALL_ADDON_IDS = Object.keys(ADDON_CATALOG) as AddOnId[];

const GATEWAY_ICONS: Record<GatewayCode, typeof CreditCard> = {
  cmi_card: CreditCard,
  stripe_card: CreditCard,
  paypal: Fingerprint,
  bank_transfer: Building2,
};

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);

  const rawListingId = searchParams.get('listingId') || '';
  const parsedListingId = Number(rawListingId);
  const startDateParam = searchParams.get('startDate') || '';
  const endDateParam = searchParams.get('endDate') || '';
  const addOnsFromUrl = (searchParams.get('addOns') || '')
    .split(',')
    .map((id) => id.trim())
    .filter(isAddOnId);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState<GatewayCode>('cmi_card');
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState<AddOnId[]>(addOnsFromUrl);

  const { currency, setCurrency, formatPrice, convertPrice } = useCurrency();

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
  const paymentMutation = trpc.payments.create.useMutation();

  // Every gateway supports MAD; switching to a currency the selected gateway
  // cannot charge in falls back to the first gateway valid for that currency.
  useEffect(() => {
    setSelectedGateway((prev) => (gatewaySupportsCurrency(prev, currency) ? prev : (gatewaysForCurrency(currency)[0] ?? 'cmi_card')));
  }, [currency]);

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

  const toggleAddOn = (id: AddOnId) => {
    setSelectedAddOns((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

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

  const handlePaymentSuccess = (_payload: { transactionId: string }) => {
    if (creatingBooking) return;
    const bookingDays = calcDays(startDateParam, endDateParam);
    if (isNaN(parsedListingId) || parsedListingId <= 0 || bookingDays <= 0) {
      toast.error('تعذر إتمام الحجز: معرّف الإعلان أو التواريخ غير صالحة.');
      return;
    }
    setCreatingBooking(true);
    bookingMutation.mutate(
      {
        listingId: parsedListingId,
        startDate: startDateParam,
        endDate: endDateParam,
        addOns: selectedAddOns,
      },
      {
        onSuccess: (result) => {
          // Charge the booking through the selected gateway/currency, then the
          // server issues the invoice (converted amount), escrow and voucher.
          paymentMutation.mutate(
            { bookingId: result.bookingId, method: selectedGateway, currency },
            {
              onSuccess: (payResult) => {
                if (payResult.payment.status === 'Succeeded') {
                  toast.success('تم تأكيد الحجز والدفع بنجاح! رقم الحجز: ALT-' + result.bookingId);
                  setLocation(`/success?bookingId=${result.bookingId}&language=ar`);
                } else {
                  toast.info('تم إنشاء طلب الدفع والحجز. الرجاء إتمام التحويل لتأكيد الحجز.');
                  setLocation(`/my-bookings`);
                }
              },
              onError: (err) => {
                toast.error('تم تأكيد الحجز لكن تعذر تسجيل الدفع: ' + (err.message ?? 'خطأ غير متوقع.'));
                setLocation(`/my-bookings`);
              },
            },
          );
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
  const pricePerDay = resPricePerDay > 0 ? resPricePerDay : (listing?.pricePerDay || 0);
  const totals = calculateCheckoutTotal(pricePerDay, days, selectedAddOns);
  const availableGateways = gatewaysForCurrency(currency);
  const showTotalDisplay = formatPrice(totals.total);

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
                <p className="text-sm text-slate-500">المدة: {days} أيام × {formatPrice(pricePerDay)} / يوم</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  إضافات اختيارية لتجربة أعلى
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {ALL_ADDON_IDS.map((id) => {
                  const def = ADDON_CATALOG[id];
                  const selected = selectedAddOns.includes(id);
                  const addOnPrice = def.perDay ? def.fee * days : def.fee;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleAddOn(id)}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-right transition-all ${
                        selected
                          ? 'border-amber-500 bg-amber-50 shadow-sm dark:bg-amber-950/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selected ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                      }`}>
                        {selected && <Check className="w-4 h-4 text-white" />}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{def.labelAr}</p>
                        <p className="text-xs text-slate-500">
                          {def.perDay ? `${formatPrice(def.fee)} / يوم (${formatPrice(def.fee * days)})` : `${formatPrice(def.fee)} (مرة واحدة)`}
                        </p>
                      </div>
                      <span className="font-bold text-slate-700">{formatPrice(addOnPrice)}</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center justify-between">
                  <span>طريقة الدفع</span>
                  <span className="text-xs font-normal text-slate-400">ALTUSplace Secure Checkout</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-bold text-slate-600">عملة الدفع</p>
                  <div className="flex rounded-xl overflow-hidden border-2 border-slate-200">
                    {CHECKOUT_CURRENCIES.map((code: CheckoutCurrency) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setCurrency(code)}
                        className={`flex-1 py-2.5 text-sm font-black transition-colors ${
                          currency === code ? 'bg-amber-500 text-slate-950' : 'bg-white text-slate-500 hover:bg-amber-50'
                        }`}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  {availableGateways.map((code: GatewayCode) => {
                    const def = GATEWAYS[code];
                    const Icon = GATEWAY_ICONS[code];
                    const selected = selectedGateway === code;
                    return (
                      <div
                        key={code}
                        onClick={() => setSelectedGateway(code)}
                        role="button"
                        className={`p-4 rounded-xl border-2 cursor-pointer flex items-center gap-3 transition-all ${
                          selected ? 'border-amber-500 bg-amber-50 shadow-sm dark:bg-amber-950/20' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <Icon className="w-6 h-6 text-amber-600" />
                        <div className="flex-1">
                          <p className="font-semibold">{def.labelAr}</p>
                          <p className="text-xs text-slate-500">
                            {def.international ? 'مدفوعات دولية آمنة' : 'دفع محلي ومباشر'}
                            {def.instant ? ' — فوري' : ' — 24 إلى 48 ساعة'}
                          </p>
                        </div>
                        <span className={`w-4 h-4 rounded-full border-2 ${selected ? 'border-amber-500 bg-amber-500' : 'border-slate-300'}`} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="md:sticky md:top-6">
              <CardHeader>
                <CardTitle className="text-lg">ملخص الطلب</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>قيمة الاشتراك ({days} أيام)</span>
                    <span>{formatPrice(totals.subtotal)}</span>
                  </div>
                  {selectedAddOns.map((id) => {
                    const def = ADDON_CATALOG[id];
                    const amount = def.perDay ? def.fee * days : def.fee;
                    return (
                      <div key={id} className="flex justify-between text-slate-500">
                        <span>{def.labelAr}</span>
                        <span>+{formatPrice(amount)}</span>
                      </div>
                    );
                  })}
                  <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-base">
                    <span>المجموع</span>
                    <span>{showTotalDisplay}</span>
                  </div>
                </div>
                {selectedAddOns.length > 0 && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-[11px] text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400">
                    <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" />تأمين وحماية مشمولة في الإضافات المختارة</span>
                  </div>
                )}
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
                ) : creatingBooking ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري تأكيد الحجز وإنشاء رقم المرجع...
                  </div>
                ) : (
                  <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                    تأكيد الدفع ({showTotalDisplay})
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
        amount={convertPrice(totals.total)}
        currency={currency}
        description={resTitle}
        bookingDetails={{
          title: resTitle,
          startDate: bookingStart,
          endDate: bookingEnd,
          days,
        }}
        initialMethod={selectedGateway as PaymentMethod}
        supportedMethods={availableGateways as PaymentMethod[]}
      />
    </>
  );
}

function calcDays(startDate: string, endDate: string): number {
  return calculateRentalDays(startDate, endDate);
}