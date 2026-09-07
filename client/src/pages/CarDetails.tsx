import { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import InteractiveCalendar from '@/components/InteractiveCalendar';
import { Star, ShieldCheck, Users, Car as CarIcon, Fuel, MapPin, Phone, CheckCircle2, Award, Calendar, ChevronRight, Share2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { OptimizedImage } from '@/components/OptimizedImage';
import { useLanguage } from '@/contexts/LanguageContext';
import { BABY_SEAT_FEE_PER_DAY, calculateRentalDays, calculateRentalSubtotal, INSURANCE_FEE_PER_DAY } from '@/lib/pricing';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { RENTAL_TERMS } from '@/lib/rentalTerms';

export default function CarDetails() {
  const [, params] = useRoute('/car/:id');
  const [, setLocation] = useLocation();
  const { t } = useLanguage();

  const carId = params?.id || '';
  const numericListingId = Number(carId);
  const listingQuery = trpc.listings.getById.useQuery(
    { id: numericListingId },
    { enabled: Number.isInteger(numericListingId) && numericListingId > 0 },
  );
  const listing = listingQuery.data;
  const car = listing ? {
    id: String(listing.id),
    name: listing.title,
    brand: listing.title.split(' ')[0] || 'ALTUSplace',
    cityName: listing.city,
    pricePerDay: listing.pricePerDay,
    image: listing.imageUrl || '',
    transmission: listing.transmission || 'غير محدد',
    fuel: listing.fuelType || 'غير محدد',
    seats: 5,
    features: listing.amenities ? listing.amenities.split(',').map((item) => item.trim()).filter(Boolean) : [],
    agency: { name: 'المؤجر على ALTUSplace', address: listing.city, whatsapp: '' },
  } : null;

  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 6);
    return date.toISOString().slice(0, 10);
  });
  const [includeInsurance, setIncludeInsurance] = useState(true);
  const [includeBabySeat, setIncludeBabySeat] = useState(false);

  const [copiedLink, setCopiedLink] = useState(false);

  const { data: bookedDatesData, isLoading: bookedDatesLoading, isError: bookedDatesError } = trpc.listings.getBookedDates.useQuery(
    { listingId: numericListingId },
    { enabled: Boolean(car) },
  );
  const reviewsQuery = trpc.reviews.listByListing.useQuery(
    { listingId: numericListingId },
    { enabled: Boolean(car) },
  );
  const reviews = reviewsQuery.data ?? [];

  if (listingQuery.isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">جاري تحميل تفاصيل الإعلان...</div>;
  }
  
  // Log error details for debugging
  if (listingQuery.isError) {
    console.error('Error fetching car listing:', listingQuery.error);
    console.error('Listing ID being fetched:', numericListingId);
  }
  
  if (!car || listingQuery.isError) {
    return (
      <div className="min-h-screen flex flex-col gap-4 items-center justify-center bg-slate-950 text-slate-200">
        <p>{t("listingsLoadError")}</p>
        <p className="text-sm text-slate-400">ID الإعلان: {numericListingId}</p>
        <Button onClick={() => setLocation('/search')}>{t("back")}</Button>
      </div>
    );
  }

  const daysCount = calculateRentalDays(startDate, endDate) || 1;
  const dailyPrice = car.pricePerDay;
  const insurancePrice = includeInsurance ? INSURANCE_FEE_PER_DAY * daysCount : 0;
  const babySeatPrice = includeBabySeat ? BABY_SEAT_FEE_PER_DAY * daysCount : 0;
  const totalPrice = calculateRentalSubtotal(dailyPrice, daysCount) + insurancePrice + babySeatPrice;
  const agencyWhatsAppUrl = buildWhatsAppUrl(car.agency.whatsapp, `مرحباً، أرغب في الاستفسار عن سيارة ${car.name}`);

  const handleShare = (platform: string) => {
    const url = window.location.href;
    const text = `استأجر ${car.name} في ${car.cityName} عبر منصة ALTUSplace الرائدة!`;
    if (platform === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
    } else if (platform === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
    } else if (platform === 'copy') {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast.success('تم نسخ رابط العرض بنجاح');
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleProceedBooking = () => {
    if (!startDate || !endDate) {
      toast.error('يرجى تحديد تاريخ الاستلام والإرجاع');
      return;
    }
    const checkoutParams = new URLSearchParams({
      listingId: String(numericListingId),
      title: car.name,
      pricePerDay: String(dailyPrice),
      days: String(daysCount),
      startDate,
      endDate,
    });
    setLocation(`/checkout?${checkoutParams.toString()}`);
  };

  const carSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": `${car.brand} ${car.name}`,
    "image": [car.image],
    "description": car.features ? car.features.join(', ') : `سيارة ${car.name} للإيجار في ${car.cityName} بسعر ${car.pricePerDay} درهم يومياً.`,
    "brand": {
      "@type": "Brand",
      "name": car.brand
    },
    "offers": {
      "@type": "Offer",
      "priceCurrency": "MAD",
      "price": car.pricePerDay,
      "availability": "https://schema.org/InStock",
      "areaServed": car.cityName
    },
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(carSchema) }}
      />
      <div className="container mx-auto px-4 space-y-8">
        
        {/* Breadcrumb */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span onClick={() => setLocation('/')} className="hover:text-amber-400 cursor-pointer">الرئيسية</span>
            <ChevronRight className="w-3 h-3" />
            <span onClick={() => setLocation('/search')} className="hover:text-amber-400 cursor-pointer">السيارات</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-700 font-semibold">{car.name}</span>
          </div>

          {/* Share Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1"><Share2 className="w-3.5 h-3.5 text-amber-400" /> مشاركة:</span>
            <button onClick={() => handleShare('whatsapp')} className="bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white px-3 py-1 rounded-xl text-xs font-bold transition-all border border-emerald-500/30">
              واتساب
            </button>
            <button onClick={() => handleShare('facebook')} className="bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-1 rounded-xl text-xs font-bold transition-all border border-blue-500/30">
              فيسبوك
            </button>
            <button onClick={() => handleShare('copy')} className="bg-slate-800 text-slate-300 hover:bg-slate-700 px-3 py-1 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-1">
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'تم النسخ' : 'نسخ الرابط'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="relative h-96">
                <OptimizedImage src={car.image} alt={car.name} width={1200} height={675} widthHint={1200} sizes="(max-width: 1024px) 100vw, 66vw" className="w-full h-full object-cover" />
                <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur-md text-amber-400 font-bold px-4 py-1.5 rounded-2xl text-xs border border-amber-500/30">
                  {car.cityName}
                </div>
                {reviews.length > 0 && (
                  <div className="absolute top-4 left-4 bg-slate-950/95 backdrop-blur-md text-white px-3 py-1.5 rounded-2xl text-xs flex items-center gap-1.5 font-bold shadow-lg">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span>{reviews.length} مراجعة موثقة</span>
                  </div>
                )}
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-2 border-b border-slate-800 pb-6">
                  <div className="text-xs text-amber-400 font-bold uppercase tracking-wider">{car.brand}</div>
                  <h1 className="text-3xl font-black text-white">{car.name}</h1>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    سيارة مجهزة بالكامل لتلبية كافة احتياجاتك في السفر والتنقل داخل المدن والمطارات المغربية بأعلى معايير الأمان والرفاهية.
                  </p>
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                    <CarIcon className="w-5 h-5 text-amber-400 mx-auto" />
                    <div className="text-[10px] text-slate-400">ناقل الحركة</div>
                    <div className="text-xs font-bold text-white">{car.transmission}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                    <Users className="w-5 h-5 text-amber-400 mx-auto" />
                    <div className="text-[10px] text-slate-400">المقاعد</div>
                    <div className="text-xs font-bold text-white">{car.seats} مقاعد</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                    <Fuel className="w-5 h-5 text-amber-400 mx-auto" />
                    <div className="text-[10px] text-slate-400">نوع الوقود</div>
                    <div className="text-xs font-bold text-white">{car.fuel}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                    <MapPin className="w-5 h-5 text-amber-400 mx-auto" />
                    <div className="text-[10px] text-slate-400">المدينة</div>
                    <div className="text-xs font-bold text-white">{car.cityName}</div>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-white">مميزات السيارة والرفاهية</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {car.features.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-2.5 bg-slate-900/60 border border-slate-800/80 px-4 py-3 rounded-2xl text-xs text-slate-200">
                        <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agency Info Box */}
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-amber-500/20 border border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-400 font-black text-xl">
                      {car.agency.name.charAt(0)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-base">{car.agency.name}</h4>

                      </div>
                      <p className="text-xs text-slate-400">{car.agency.address}</p>
                    </div>
                  </div>
                  {agencyWhatsAppUrl ? (
                    <a
                      href={agencyWhatsAppUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg"
                    >
                      <Phone className="w-4 h-4" /> مراسلة الوكالة عبر واتساب
                    </a>
                  ) : (
                    <span className="w-full sm:w-auto bg-slate-800 text-slate-500 font-bold px-5 py-3 rounded-2xl text-xs flex items-center justify-center gap-2" aria-disabled="true">
                      <Phone className="w-4 h-4" /> واتساب الوكالة غير متوفر
                    </span>
                  )}
                </div>

                {/* Reviews Section */}
                <div className="space-y-6 pt-6 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                      <span>تقييمات ومراجعات العملاء ({reviews.length})</span>
                    </h3>
                  </div>

                  <p className="text-xs text-slate-400">تظهر هنا المراجعات المرتبطة بحجوزات مؤكدة ومنتهية فقط.</p>

                  <div className="space-y-4">
                    {reviewsQuery.isLoading ? (
                      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl text-sm text-slate-400">جاري تحميل المراجعات...</div>
                    ) : reviewsQuery.isError ? (
                      <div className="bg-rose-950/30 border border-rose-800/60 p-6 rounded-3xl text-sm text-rose-200">تعذر تحميل المراجعات حالياً.</div>
                    ) : reviews.length === 0 ? (
                      <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl text-sm text-slate-400">لا توجد مراجعات موثقة لهذا العرض بعد.</div>
                    ) : reviews.map((rev) => (
                      <div key={rev.id} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm">{rev.userName || 'مستخدم ALTUSplace'}</span>
                          <span className="text-xs text-slate-500">{new Date(rev.createdAt).toLocaleDateString('ar-MA')}</span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-400">
                          {Array.from({ length: rev.rating }).map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-current" />
                          ))}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{rev.comment}</p>
                      </div>
                    ))}
                  </div>

                </div>

              </div>
            </div>
          </div>

          {/* Booking Card Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-slate-950 border border-slate-800 p-6 rounded-3xl shadow-2xl sticky top-28 space-y-6">
              
              <div className="flex items-baseline justify-between border-b border-slate-800 pb-4">
                <div>
                  <span className="text-2xl font-black text-white">{car.pricePerDay} درهم</span>
                  <span className="text-xs text-slate-400 mr-1">/ اليوم</span>
                </div>
                <div className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-xl">
                  طلب الحجز يحتاج موافقة المالك
                </div>
              </div>

              <div className="space-y-4">
                {/* Interactive Calendar Widget */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-300 font-semibold flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" /> تقويم التوفر المباشر
                  </label>
                  {bookedDatesLoading ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">جاري تحميل التوفر...</div>
                  ) : bookedDatesError ? (
                    <div className="rounded-2xl border border-rose-800/60 bg-rose-950/30 p-5 text-sm text-rose-200">تعذر تحميل التوفر حالياً. حاول تحديث الصفحة قبل المتابعة.</div>
                  ) : (
                    <InteractiveCalendar
                      listingId={numericListingId}
                      bookedDates={bookedDatesData || []}
                      onDateSelect={(start, end) => {
                        setStartDate(start);
                        setEndDate(end);
                      }}
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-semibold">تاريخ الاستلام</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-semibold">تاريخ الإرجاع</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <label className="flex items-center justify-between text-xs cursor-pointer">
                    <span className="text-slate-300">تأمين شامل ضد الحوادث (+100 درهم/يوم)</span>
                    <input
                      type="checkbox"
                      checked={includeInsurance}
                      onChange={(e) => setIncludeInsurance(e.target.checked)}
                      className="accent-amber-500 rounded w-4 h-4"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs cursor-pointer">
                    <span className="text-slate-300">مقعد أطفال مخصص (+50 درهم/يوم)</span>
                    <input
                      type="checkbox"
                      checked={includeBabySeat}
                      onChange={(e) => setIncludeBabySeat(e.target.checked)}
                      className="accent-amber-500 rounded w-4 h-4"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-800">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>مدة الإيجار ({daysCount} أيام)</span>
                  <span>{dailyPrice * daysCount} درهم</span>
                </div>
                {includeInsurance && (
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>التأمين الشامل</span>
                    <span>{insurancePrice} درهم</span>
                  </div>
                )}
                {includeBabySeat && (
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>مقعد أطفال</span>
                    <span>{babySeatPrice} درهم</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-extrabold text-white pt-2 border-t border-slate-800">
                  <span>المبلغ الإجمالي</span>
                  <span className="text-amber-400">{totalPrice} درهم</span>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-800" aria-label={t("rentalConditions")}>
                <p className="text-xs font-extrabold text-[var(--brand-amber)]">{t("rentalConditions")}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-2">
                    <p className="text-sm font-black text-white">{RENTAL_TERMS.minDriverAge}+</p>
                    <p className="text-[10px] text-slate-400 leading-tight">{t("minDriverAge")}</p>
                  </div>
                  <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-2">
                    <p className="text-sm font-black text-white">{RENTAL_TERMS.securityDepositMad} {t("madUnit")}</p>
                    <p className="text-[10px] text-slate-400 leading-tight">{t("securityDeposit")}</p>
                  </div>
                  <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-2">
                    <p className="text-sm font-black text-white">{RENTAL_TERMS.dailyMileageKm}</p>
                    <p className="text-[10px] text-slate-400 leading-tight">{t("kmPerDay")}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">{t("rentalTermsNote")}</p>
              </div>

              <Button
                onClick={handleProceedBooking}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black py-4 rounded-2xl text-sm shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                المتابعة إلى الحجز والدفع
              </Button>

              <div className="text-center text-[10px] text-slate-500">
                سيُرسل الطلب للموافقة قبل اعتبار الحجز نهائياً. الدفع محاكاة داخل المنصة.
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
