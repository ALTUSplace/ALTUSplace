import { useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, Wallet, CheckCircle2, ArrowRight, FileText, Lock, ShieldCheck, Landmark, BadgeCheck, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { cancellationRefundPolicy } from '@/lib/legalDisclosure';
import { calculateRentalDays, calculateRentalSubtotal } from '@/lib/pricing';
import { PaymentCheckoutModal, PaymentSuccessResult } from '@/components/PaymentCheckoutModal';
import { KycDocumentUpload } from '@/components/KycDocumentUpload';

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);

  const listingId = Number(searchParams.get('listingId'));
  const title = searchParams.get('title') || '';
  const pricePerDay = Number(searchParams.get('pricePerDay'));
  const startDateParam = searchParams.get('startDate') || '';
  const endDateParam = searchParams.get('endDate') || '';
  const parsedStart = startDateParam ? new Date(`${startDateParam}T12:00:00`) : null;
  const parsedEnd = endDateParam ? new Date(`${endDateParam}T12:00:00`) : null;
  const requestedDays = Number(searchParams.get('days'));
  const daysFromDates = calculateRentalDays(startDateParam, endDateParam);
  const hasValidDates = daysFromDates > 0;
  const days = daysFromDates || (Number.isFinite(requestedDays) && requestedDays > 0 ? Math.floor(requestedDays) : 0);
  const subtotal = calculateRentalSubtotal(pricePerDay, days);
  const requestedContractType = searchParams.get('contractType');
  const contractType = requestedContractType === 'commercial' || requestedContractType === 'professional' ? requestedContractType : null;
  const premises = searchParams.get('premises') || title;
  const city = searchParams.get('city') || 'المغرب';
  const landlordName = searchParams.get('landlordName') || 'المالك / الشركة المؤجرة';
  const formatDate = (value: string) => {
    if (!value) return 'غير محدد';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? 'غير محدد' : new Intl.DateTimeFormat('ar-MA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  };

  const rentalCategory = searchParams.get('category') as 'car' | 'real_estate' | null;
  const [paymentMethod, setPaymentMethod] = useState<'cmi_card' | 'bank_transfer'>('cmi_card');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const createPaymentMutation = trpc.payments.create.useMutation();
  const createBookingMutation = trpc.bookings.create.useMutation({
    onSuccess: (data) => {
      createPaymentMutation.mutate({ bookingId: data.bookingId, method: paymentMethod }, {
        onSuccess: (paymentResult) => {
          const invoice = paymentResult.invoice;
          toast.success(paymentResult.payment.status === 'Succeeded'
            ? 'تمت محاكاة الدفع بنجاح وإصدار الفاتورة. سيصبح الحجز مؤكداً بعد موافقة المالك.'
            : 'تم تسجيل طلب التحويل البنكي وإنشاء فاتورة قيد المراجعة.');
          const params = new URLSearchParams({
            title,
            total: String(invoice.total),
            bookingId: String(data.bookingId),
            invoiceId: String(invoice.id),
            invoiceNumber: invoice.invoiceNumber,
            paymentStatus: paymentResult.payment.status,
            invoiceStatus: invoice.status,
            premises,
            city,
            landlordName,
            startDate: startDateParam,
            endDate: endDateParam,
            monthlyRent: String(invoice.subtotal),
            bookingStatus: 'Pending',
          });
          if (contractType) params.set('contractType', contractType);
          if (paymentResult.voucher?.code) params.set('voucherCode', paymentResult.voucher.code);
          setLocation(`/success?${params.toString()}`);
        },
        onError: (err) => {
          toast.error(err.message || 'تم إنشاء الحجز لكن تعذر تسجيل الدفع. يمكنك إعادة المحاولة من صفحة حجوزاتك.');
          setIsSubmitting(false);
        },
      });
    },
    onError: (err) => {
      toast.error(err.message || 'حدث خطأ أثناء إنشاء الحجز.');
      setIsSubmitting(false);
    }
  });

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isInteger(listingId) || listingId <= 0 || !title || !hasValidDates || !Number.isFinite(pricePerDay) || pricePerDay <= 0) {
      toast.error('رابط الحجز غير مكتمل. عد إلى تفاصيل الإعلان واختر تواريخ صحيحة قبل المتابعة.');
      return;
    }
    if (!agreeTerms) {
      toast.error('يرجى الموافقة على الشروط والأحكام وسياسة الضمان (Escrow) للمتابعة');
      return;
    }
    // Show secure payment modal
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = (result: PaymentSuccessResult) => {
    setShowPaymentModal(false);
    setIsSubmitting(true);
    // Store payment result for later use
    // Create booking after successful payment
    createBookingMutation.mutate({
      listingId,
      startDate: parsedStart!.toISOString(),
      endDate: parsedEnd!.toISOString(),
    });
  };

  if (isSubmitting) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <LoadingAnimation 
          text="جاري تسجيل الحجز والدفع المحاكى عبر CMI..." 
          subtext="يُحفظ مبلغ الفاتورة من الخادم؛ سيُتاح العقد بعد موافقة المالك" 
        />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[#f4f7fb] text-slate-900 py-5 sm:py-10 px-3 sm:px-6 lg:px-8" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-5 sm:space-y-7">
        <div className="overflow-hidden rounded-3xl bg-[#0B0F19] text-white shadow-2xl">
          <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-5">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/20"><ShieldCheck className="h-6 w-6 text-amber-300" /></div>
              <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">ALTUSplace Secure Checkout</p><p className="text-sm font-bold sm:text-base">بوابة دفع مغربية محاكية</p></div>
            </div>
            <Button variant="ghost" onClick={() => window.history.back()} className="gap-2 text-white hover:bg-white/10 hover:text-white cursor-pointer"><ArrowRight className="w-4 h-4" /> عودة</Button>
          </div>
          <div className="border-t border-white/10 px-5 py-5 sm:px-8">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">تأكيد الحجز والدفع الآمن</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/72">أكمل الخطوات التالية لتسجيل العربون وإنشاء الفاتورة. لا يتم إرسال أي بيانات مالية إلى مؤسسة خارجية في هذه النسخة التجريبية.</p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-[11px] sm:max-w-xl sm:text-xs">
              <div className="flex items-center gap-2 font-bold text-amber-300"><span className="grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-slate-950">1</span> تفاصيل الحجز</div>
              <div className="flex items-center gap-2 font-bold text-white"><span className="grid h-6 w-6 place-items-center rounded-full border border-white/40">2</span> الدفع</div>
              <div className="flex items-center gap-2 text-white/55"><span className="grid h-6 w-6 place-items-center rounded-full border border-white/25">3</span> التأكيد</div>
            </div>
          </div>
        </div>

        {!Number.isInteger(listingId) || listingId <= 0 || !hasValidDates || !Number.isFinite(pricePerDay) || pricePerDay <= 0 ? (
          <Card className="border-red-200 bg-red-50 text-red-900">
            <CardContent className="p-8 text-center">
              <p className="font-bold">لا يمكن فتح الدفع لأن بيانات الحجز ناقصة أو غير صحيحة.</p>
              <p className="mt-2 text-sm">عد إلى تفاصيل الإعلان واختر تاريخ البداية والنهاية قبل المتابعة.</p>
              <Button type="button" onClick={() => window.history.back()} className="mt-4 bg-[#0B0F19] text-white">العودة إلى تفاصيل الإعلان</Button>
            </CardContent>
          </Card>
        ) : <form onSubmit={handleCheckout} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Payment Methods Section */}
          <div className="md:col-span-2 space-y-5">
            <div className="flex items-center justify-between rounded-2xl border border-[#d9e5ee] bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><BadgeCheck className="h-5 w-5" /></div><div><p className="text-xs font-bold text-[#0B0F19]">جلسة دفع محمية</p><p className="text-[11px] text-slate-500">تشفير تجريبي • لا نخزن بيانات البطاقة</p></div></div>
              <div className="hidden items-center gap-2 text-[11px] font-bold text-slate-500 sm:flex"><Landmark className="h-4 w-4" /> MAD / الدرهم المغربي</div>
            </div>
            <Card className="border-[#d9e5ee] bg-white shadow-lg shadow-slate-200/60">
              <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="flex items-center gap-2 text-xl font-black text-[#0B0F19]"><CreditCard className="h-5 w-5 text-amber-500" /> اختر طريقة الدفع</CardTitle>
                <p className="text-xs leading-5 text-slate-500">اختر الطريقة المناسبة لإكمال تسجيل الحجز.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Credit Card */}
                <div
                  onClick={() => setPaymentMethod('cmi_card')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                    paymentMethod === 'cmi_card' ? 'border-amber-500 bg-amber-500/5 shadow-sm' : 'border-border hover:border-amber-500/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-amber-500/10 p-3 text-amber-500">
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold">البطاقة الائتمانية (Visa / Mastercard / CMI)</h4>
                      <p className="text-xs text-muted-foreground">دفع آمن ومعتمد عبر مركز المعاملات البنكية</p>
                    </div>
                  </div>
                  <input type="radio" checked={paymentMethod === 'cmi_card'} onChange={() => setPaymentMethod('cmi_card')} className="accent-amber-500 w-5 h-5 cursor-pointer" />
                </div>

                {/* E-Wallets */}
                <div
                  onClick={() => setPaymentMethod('bank_transfer')}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                    paymentMethod === 'bank_transfer' ? 'border-amber-500 bg-amber-500/5 shadow-sm' : 'border-border hover:border-amber-500/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-600">
                      <Wallet className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold">التحويل البنكي المباشر (RIB)</h4>
                      <p className="text-xs text-muted-foreground">تُنشأ الفاتورة بحالة قيد المراجعة إلى حين تأكيد التحويل</p>
                    </div>
                  </div>
                  <input type="radio" checked={paymentMethod === 'bank_transfer'} onChange={() => setPaymentMethod('bank_transfer')} className="accent-amber-500 w-5 h-5 cursor-pointer" />
                </div>

                {paymentMethod === 'cmi_card' && (
                    <div className="mt-4 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm">
                    <div className="flex items-center gap-2 font-black text-[#0B0F19]"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> بيئة CMI محاكية مفعّلة</div>
                    <p className="text-xs leading-relaxed text-slate-600">لا تدخل رقم بطاقة أو رمز CVV حقيقياً. هذه الواجهة تحاكي تجربة الدفع فقط ولا تتصل بمؤسسة CMI؛ سيُحفظ مرجع العملية وحالتها دون بيانات البطاقة.</p>
                    <div className="flex flex-wrap gap-2 text-[10px] font-bold text-slate-500"><span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-amber-200">Visa</span><span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-amber-200">Mastercard</span><span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-amber-200">CMI Sandbox</span></div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Terms checkbox */}
            <div className="flex items-start gap-3 p-4 bg-muted/20 border border-border rounded-2xl">
              <input 
                type="checkbox" 
                id="checkout_terms" 
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-border text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="checkout_terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                أوافق على <a href="/terms" target="_blank" className="text-amber-500 underline font-bold">شروط الاستخدام وسياسة الضمان المالي (Escrow)</a> وسياسة الإلغاء والاسترداد المبينة أدناه، وإخلاء المسؤولية الذي يقر بأن ALTUSplace منصة إعلانية ووسيط تقني فقط، وأن الشريك مسؤول عن الحالة الميكانيكية للسيارة أو حالة العقار ونظافته. كما أوافق على قواعد عمولة الوساطة بنسبة 10% وأقر بصحة البيانات المدرجة.
              </label>
            </div>
          </div>

          {/* KYC Identity Verification */}
          <KycDocumentUpload compact rentalCategory={rentalCategory ?? "real_estate"} />

          {/* Invoice Summary & Commission Details */}
          <div className="space-y-5 md:sticky md:top-6 md:self-start">
            <Card className="h-fit border-[#d9e5ee] bg-white shadow-lg shadow-slate-200/60">
              <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg font-black text-[#0B0F19]"><FileText className="h-5 w-5 text-amber-500" /> ملخص الفاتورة الشفافة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-muted/40 rounded-xl">
                  <span className="text-xs text-muted-foreground block">العنصر المحجوز</span>
                  <span className="font-bold text-sm break-words">{title}</span>
                </div>

                <div className="grid grid-cols-2 gap-2" aria-label="ملخص تواريخ الحجز">
                  <div className="rounded-xl border border-border bg-background p-3 min-w-0">
                    <span className="text-[11px] text-muted-foreground block">الوصول</span>
                    <span className="font-bold text-sm block truncate" title={formatDate(startDateParam)}>{formatDate(startDateParam)}</span>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-3 min-w-0">
                    <span className="text-[11px] text-muted-foreground block">المغادرة</span>
                    <span className="font-bold text-sm block truncate" title={formatDate(endDateParam)}>{formatDate(endDateParam)}</span>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">مدة الحجز:</span>
                    <span className="font-semibold">{days} أيام</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">سعر الكراء اليومي:</span>
                    <span className="font-semibold">{pricePerDay} د.م / يوم</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">المجموع الفرعي:</span>
                    <span className="font-semibold">{subtotal} د.م</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                    <span>المجموع الأولي من بيانات الإعلان:</span>
                    <span>{subtotal} د.م</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground bg-amber-500/5 p-2 rounded-lg border border-amber-500/20 leading-relaxed">سيحسب الخادم العمولة وTVA والإجمالي النهائي من الإعلان والإعدادات المحفوظة، وستظهر القيم المعتمدة في الفاتورة بعد التسجيل.</p>
                </div>

                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-right" aria-label="سياسة الإلغاء والاسترداد">
                  <p className="font-black text-[#0B0F19]">{cancellationRefundPolicy.ar.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{cancellationRefundPolicy.ar.summary}</p>
                  <ul className="mt-2 list-disc space-y-1 pr-4 text-[11px] leading-5 text-slate-600">
                    {cancellationRefundPolicy.ar.points.slice(0, 2).map((point) => <li key={point}>{point}</li>)}
                  </ul>
                </div>

                <div className="pt-4 border-t border-border flex justify-between items-center text-lg font-extrabold gap-3" aria-live="polite">
                  <span>الإجمالي النهائي:</span>
                  <span className="text-amber-500 text-right">يحدده الخادم</span>
                </div>

                  <Button type="submit" className="group mt-4 w-full gap-2 rounded-2xl bg-amber-500 py-6 text-base font-black text-slate-950 shadow-xl shadow-amber-500/20 hover:bg-amber-600 cursor-pointer"><span>تأكيد ودفع العربون الآن</span><ChevronLeft className="h-5 w-5 transition-transform duration-200 group-hover:-translate-x-1" /></Button>

                <div className="flex items-center justify-center gap-2 border-t border-slate-100 pt-3 text-center text-[11px] text-slate-500"><Lock className="h-3.5 w-3.5 text-emerald-600" /> لا تُحفظ بيانات البطاقة؛ الدفع المعروض محاكاة فقط</div>
              </CardContent>
            </Card>
          </div>
        </form>}
      </div>
    </div>

    {/* Secure Payment Modal */}
    <PaymentCheckoutModal
      isOpen={showPaymentModal}
      onClose={() => setShowPaymentModal(false)}
      onSuccess={handlePaymentSuccess}
      amount={subtotal}
      currency="درهم"
      description={`حجز: ${title} - ${days} أيام`}
      bookingDetails={{
        title,
        startDate: formatDate(startDateParam),
        endDate: formatDate(endDateParam),
        days,
      }}
    />
    </>
  );
}
