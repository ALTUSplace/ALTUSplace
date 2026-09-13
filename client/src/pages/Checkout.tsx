import { useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, MessageCircle, ShieldAlert, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { useAuth } from '@/_core/hooks/useAuth';
import { isKycSatisfiedFor, KYC_STATUS_CONFIG, type KycStatus } from '@/lib/kyc';
import {
  ADDON_CATALOG,
  calculateCheckoutTotal,
  calculateRentalDays,
  isAddOnId,
  type AddOnId,
} from '@/lib/pricing';
import { LISTINGS, PARTNERS } from '@/data/altusplace';
import { buildContactWhatsAppUrl } from '@/lib/whatsapp';

const ALL_ADDON_IDS = Object.keys(ADDON_CATALOG) as AddOnId[];

function formatMAD(amount: number): string {
  return `${new Intl.NumberFormat('fr-MA').format(amount)} درهم`;
}

interface WhatsAppBookingDetails {
  carTitle: string;
  startDate: string;
  endDate: string;
  days: number;
  totalMAD: number;
  addOns: AddOnId[];
  residencyLabel: string;
  identityLabel: string;
  licenseName: string;
  identityName: string;
}

// Builds the pre-filled WhatsApp booking message with a polite greeting and a
// clean one-line-per-item layout so agencies can confirm the booking at a glance.
function buildWhatsAppBookingMessage(details: WhatsAppBookingDetails): string {
  const lines = [
    'السلام عليكم، أرغب في تأكيد حجز عبر منصة ALTUSplace، وإليكم تفاصيل الحجز:',
    '',
    `- السيارة: ${details.carTitle}`,
    `- تاريخ الاستلام: ${details.startDate}`,
    `- تاريخ الإرجاع: ${details.endDate}`,
    `- المدة: ${details.days} ${details.days === 1 ? 'يوم' : 'أيام'}`,
  ];
  details.addOns.forEach((id) => {
    const def = ADDON_CATALOG[id];
    const amount = def.perDay ? def.fee * details.days : def.fee;
    lines.push(`- إضافة: ${def.labelAr} (${formatMAD(amount)})`);
  });
  lines.push(`- حالة الإقامة: ${details.residencyLabel}`);
  lines.push(`- رخصة السياقة (البيرمي): ${details.licenseName ? `${details.licenseName} — مرفقة` : 'غير مرفقة'} للفحص المسبق من الوكالة`);
  lines.push(`- وثيقة الهوية (${details.identityLabel}): ${details.identityName ? `${details.identityName} — مرفقة` : 'غير مرفقة'} للفحص المسبق من الوكالة`);
  lines.push(`- الإجمالي: ${formatMAD(details.totalMAD)}`);
  lines.push('');
  lines.push('شكراً لكم، بانتظار تأكيدكم. مع تحياتي.');
  return lines.join('\n');
}

type ResidencyStatus = 'resident' | 'foreigner';

const RESIDENCY_OPTIONS: { value: ResidencyStatus; label: string; sublabel: string }[] = [
  { value: 'resident', label: 'مقيم بالمغرب', sublabel: 'بطاقة التعريف الوطنية (CIN)' },
  { value: 'foreigner', label: 'أجنبي', sublabel: 'جواز السفر (Passport)' },
];

function DocumentUploadField({
  label,
  hint,
  file,
  onFileChange,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{label}</p>
      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-emerald-800 dark:text-emerald-300" dir="ltr">{file.name}</p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">{Math.max(1, Math.round(file.size / 1024))} KB — تم اختياره</p>
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFileChange(null);
            }}
            className="shrink-0 rounded-lg border border-emerald-300 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-800"
          >
            إزالة
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 p-3 text-sm text-slate-600 transition-all hover:border-amber-400 hover:bg-amber-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-amber-950/20">
          <Upload className="h-5 w-5 text-amber-600" />
          اضغط لاختيار الملف
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              onFileChange(picked);
              event.currentTarget.value = '';
            }}
          />
        </label>
      )}
      <p className="text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

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

  const [selectedAddOns, setSelectedAddOns] = useState<AddOnId[]>(addOnsFromUrl);
  const [residency, setResidency] = useState<ResidencyStatus>('resident');
  const [driverLicenseFile, setDriverLicenseFile] = useState<File | null>(null);
  const [identityFile, setIdentityFile] = useState<File | null>(null);

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

  // WhatsApp recipient: the agency's own number from the owner profile when
  // available, then the static demo partner phone, and finally the platform
  // concierge line so a booking request is never dropped.
  const staticPartner = staticListing ? PARTNERS.find((partner) => partner.id === staticListing.providerId) : undefined;
  const agencyPhone = listing?.whatsappPhone ?? listing?.agencyPhone ?? staticPartner?.phone ?? '';
  const agencyName = listing?.agencyName ?? listing?.ownerName ?? staticPartner?.name ?? 'الوكالة المؤجِرة';

  const bookingStart = startDateParam || new Date().toISOString().slice(0, 10);
  const bookingEnd = endDateParam || new Date().toISOString().slice(0, 10);
  const days = calculateRentalDays(bookingStart, bookingEnd);
  const pricePerDay = resPricePerDay > 0 ? resPricePerDay : (listing?.pricePerDay || 0);
  const totals = calculateCheckoutTotal(pricePerDay, days, selectedAddOns);
  const showTotalDisplay = formatMAD(totals.total);

  const residencyOption = RESIDENCY_OPTIONS.find((option) => option.value === residency) ?? RESIDENCY_OPTIONS[0];
  const identityLabel = residencyOption.sublabel;
  const identityShortLabel = residency === 'resident' ? 'البطاقة الوطنية CIN' : 'جواز السفر';
  const residencyLabel = residency === 'resident' ? 'مقيم بالمغرب (Resident)' : 'أجنبي (Foreigner)';
  const isFormValid = driverLicenseFile !== null && identityFile !== null;

  const whatsappMessage = buildWhatsAppBookingMessage({
    carTitle: resTitle,
    startDate: bookingStart,
    endDate: bookingEnd,
    days,
    totalMAD: totals.total,
    addOns: selectedAddOns,
    residencyLabel,
    identityLabel: identityShortLabel,
    licenseName: driverLicenseFile?.name ?? '',
    identityName: identityFile?.name ?? '',
  });
  const whatsappUrl = buildContactWhatsAppUrl(agencyPhone, whatsappMessage);

  // KYC gate — mirrors the server-side enforcement in bookings.create:
  // unverified/pending/rejected profiles cannot open the booking flow.
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

  const handleWhatsAppConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const bookingDays = calcDays(startDateParam, endDateParam);
    if (!startDateParam || !endDateParam || bookingDays <= 0) {
      toast.error('يرجى تحديد تواريخ استلام وإرجاع صحيحة قبل تأكيد الحجز.');
      return;
    }
    if (!isFormValid) {
      alert(`المرجو رفع رخصة السياقة (البيرمي) و${identityLabel} أولاً لتمكين الحجز عبر الواتساب.`);
      return;
    }
    if (isAuthenticated && !kycVerified) {
      toast.error('التحقق من الهوية مطلوب قبل الحجز. يرجى رفع وثيقتك أولاً.');
      setLocation('/kyc');
      return;
    }
    if (!whatsappUrl) {
      toast.error('لا يوجد رقم واتساب متاح لهذه الوكالة حالياً. يرجى المحاولة لاحقاً.');
      return;
    }
    window.open(whatsappUrl, '_blank');
    toast.success('تم تجهيز رسالة الحجز مع تفاصيله. أرسلها عبر الواتساب لتأكيد الحجز.');
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

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-5 sm:space-y-7 p-4">
        <form onSubmit={handleWhatsAppConfirm} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">تفاصيل الحجز</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="font-semibold">{resTitle}</p>
                <p className="text-sm text-slate-500">المدة: {days} أيام × {formatMAD(pricePerDay)} / يوم</p>
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
                          {def.perDay ? `${formatMAD(def.fee)} / يوم (${formatMAD(def.fee * days)})` : `${formatMAD(def.fee)} (مرة واحدة)`}
                        </p>
                      </div>
                      <span className="font-bold text-slate-700">{formatMAD(addOnPrice)}</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                  التحقق الإلزامي من الوثائق
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300">حالة الإقامة</p>
                  <div className="grid grid-cols-2 gap-2">
                    {RESIDENCY_OPTIONS.map((option) => {
                      const selected = residency === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setResidency(option.value)}
                          className={`p-3 rounded-xl border-2 text-sm transition-all ${
                            selected
                              ? 'border-amber-500 bg-amber-50 shadow-sm dark:bg-amber-950/20'
                              : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          <span className="block font-bold">{option.label}</span>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">{option.sublabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <DocumentUploadField
                  label="رخصة السياقة (البيرمي)"
                  hint="مطلوبة لجميع الحجوزات — صورة واضحة أو PDF"
                  file={driverLicenseFile}
                  onFileChange={setDriverLicenseFile}
                />

                <DocumentUploadField
                  label={identityLabel}
                  hint={residency === 'resident' ? 'مطلوبة للمقيمين — بطاقة التعريف الوطنية' : 'مطلوب للأجانب — جواز السفر'}
                  file={identityFile}
                  onFileChange={setIdentityFile}
                />

                {!isFormValid && (
                  <div className="rounded-xl border border-amber-300/40 bg-amber-50 p-3 text-xs text-amber-700 leading-relaxed dark:bg-amber-950/20 dark:text-amber-400" role="alert">
                    <p className="flex items-center gap-1.5 font-bold">
                      <ShieldAlert className="h-4 w-4" />
                      الوثائق المطلوبة غير مكتملة بعد
                    </p>
                    <ul className="mt-1 list-disc pr-4 space-y-0.5">
                      <li>رخصة السياقة (البيرمي) — للجميع</li>
                      <li>{identityLabel} — {residency === 'resident' ? 'للمقيمين' : 'للأجانب'}</li>
                    </ul>
                    <p className="mt-1">لن يُفتح زر تأكيد الحجز عبر الواتساب إلا بعد إرفاق الوثيقتين.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-[#25D366]" />
                  تأكيد الحجز عبر الواتساب
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  لا حاجة إلى بطاقة دفع. سيتم فتح محادثة واتساب مع {agencyName} ورسالة جاهزة تحوي تفاصيل حجزك —
                  راجعها ثم أرسلها لتأكيد الحجز مباشرة.
                </p>
                <div
                  className="rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-900/60 dark:border-slate-700 p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line"
                  dir="rtl"
                >
                  {whatsappMessage}
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={!isFormValid}
                  className="w-full bg-[#25D366] text-white hover:bg-[#1ebe5d] disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-100 disabled:hover:bg-slate-300 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 dark:disabled:hover:bg-slate-700"
                >
                  <MessageCircle className="mr-2 h-5 w-5" />
                  تأكيد الحجز عبر الواتساب
                </Button>
                {!isFormValid && (
                  <p className="rounded-lg border border-amber-300/40 bg-amber-50 p-2 text-[11px] text-amber-700 leading-relaxed dark:bg-amber-950/20 dark:text-amber-400" role="alert">
                    أرفق البيرمي ووثيقة الهوية في قسم «التحقق الإلزامي من الوثائق» أعلاه لتفعيل زر التأكيد.
                  </p>
                )}
                {!agencyPhone && (
                  <p className="text-[11px] text-slate-400">
                    لم تشارك الوكالة رقم واتساب بعد؛ ستُوجَّه رسالتك إلى خط دعم ALTUSplace الذي ينسّق معها.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="md:sticky md:top-6">
              <CardHeader>
                <CardTitle className="text-lg">ملخص الطلب</CardTitle>
                <p className="text-[11px] font-normal text-slate-400 -mt-1">ملخص الفاتورة الشفافة — بدون رسوم خفية</p>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>قيمة الاشتراك ({days} أيام)</span>
                    <span>{formatMAD(totals.subtotal)}</span>
                  </div>
                  {selectedAddOns.map((id) => {
                    const def = ADDON_CATALOG[id];
                    const amount = def.perDay ? def.fee * days : def.fee;
                    return (
                      <div key={id} className="flex justify-between text-slate-500">
                        <span>{def.labelAr}</span>
                        <span>+{formatMAD(amount)}</span>
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
                    <p className="mt-1">لا يمكن إتمام الحجز قبل الموافقة على وثيقة هويتك.</p>
                    <Button type="button" onClick={() => setLocation('/kyc')} className="mt-2 w-full bg-amber-500 font-bold text-slate-950 hover:bg-amber-600">
                      إكمال التحقق من الهوية
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {!isFormValid && (
                      <div className="rounded-lg border border-amber-300/40 bg-amber-50 p-2 text-[11px] text-amber-700 leading-relaxed dark:bg-amber-950/20 dark:text-amber-400" role="alert">
                        <p className="flex items-center gap-1 font-bold">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          الوثائق الإلزامية غير مكتملة
                        </p>
                        <p className="mt-0.5">أرفق البيرمي ووثيقة الهوية (CIN أو جواز السفر) في قسم «التحقق الإلزامي من الوثائق» لتفعيل الزر.</p>
                      </div>
                    )}
                    <Button type="submit" size="lg" disabled={!isFormValid} className="w-full bg-[#25D366] text-white hover:bg-[#1ebe5d] disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-100 disabled:hover:bg-slate-300 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 dark:disabled:hover:bg-slate-700">
                      <MessageCircle className="mr-2 h-5 w-5" />
                      تأكيد الحجز عبر الواتساب ({showTotalDisplay})
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </form>
      </div>
    </>
  );
}

function calcDays(startDate: string, endDate: string): number {
  return calculateRentalDays(startDate, endDate);
}