import { useState } from 'react';
import { useRoute, useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import InteractiveCalendar from '@/components/InteractiveCalendar';
import { Star, ShieldCheck, Users, Car as CarIcon, Fuel, MapPin, MessageCircle, CheckCircle2, Award, Calendar, ChevronRight, Share2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { LISTINGS } from '@/data/altusplace';
import { OptimizedImage } from '@/components/OptimizedImage';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSEO, SITE_URL } from '@/lib/seo';
import { BABY_SEAT_FEE_PER_DAY, calculateRentalDays, calculateRentalSubtotal, INSURANCE_FEE_PER_DAY } from '@/lib/pricing';
import { RENTAL_TERMS } from '@/lib/rentalTerms';
import CommentSection from '@/components/CommentSection';
import { BookingWidget } from '@/components/ui/BookingWidget';

const isIsoDay = (value: string | null): value is string => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');

export default function CarDetails() {
  const [, params] = useRoute('/car/:id');
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const { t } = useLanguage();

  const carId = params?.id || '';
  const parsedListingId = Number(carId);
  const numericListingId = Number.isInteger(parsedListingId) && parsedListingId > 0 ? parsedListingId : null;
  const listingQuery = trpc.listings.getById.useQuery(
    { id: numericListingId! },
    { enabled: numericListingId !== null },
  );
  const listing = listingQuery.data;
  const staticCar = numericListingId === null
    ? LISTINGS.find((item) => item.id === carId && item.type === 'car')
    : undefined;
  const car = listing ? {
    id: String(listing.id),
    name: listing.title,
    brand: listing.title.split(' ')[0] || 'ALTUSplace',
    cityName: listing.city,
    pricePerDay: listing.pricePerDay,
    image: listing.images?.[0] || listing.imageUrl || '',
    images: listing.images?.length ? listing.images : listing.imageUrl ? [listing.imageUrl] : [],
    transmission: listing.transmission || 'غير محدد',
    fuel: listing.fuelType || 'غير محدد',
    seats: listing.seats && listing.seats > 0 ? listing.seats : 'غير محدد',
    year: listing.year ? String(listing.year) : 'غير محدد',
    features: listing.amenities ? listing.amenities.split(',').map((item) => item.trim()).filter(Boolean) : [],
    agency: { name: 'المؤجر على ALTUSplace', address: listing.city, whatsapp: '' },
  } : staticCar ? {
    id: staticCar.id,
    name: staticCar.title,
    brand: staticCar.title.split(' ')[0] || 'ALTUSplace',
    cityName: staticCar.city,
    pricePerDay: staticCar.pricePerUnit,
    image: staticCar.image,
    images: staticCar.image ? [staticCar.image] : [],
    transmission: staticCar.specs?.transmission || 'غير محدد',
    fuel: staticCar.specs?.fuel || 'غير محدد',
    seats: 5,
    year: 'غير محدد',
    features: staticCar.features || [],
    agency: { name: staticCar.providerName || 'المؤجر على ALTUSplace', address: staticCar.city, whatsapp: '' },
  } : null;

  // SEO must be computed before the loading/not-found early returns so crawlers
  // always receive a canonical + robots directive, even for stale listing ids.
  const seoTitle = car
    ? `${car.name} — كراء سيارات في ${car.cityName} | ALTUSplace`
    : 'ALTUSplace | كراء السيارات والعقارات في المغرب';
  const seoDescription = car
    ? `استأجر ${car.name} في ${car.cityName} بسعر ${Number(car.pricePerDay).toLocaleString('fr-MA')} درهم لليوم عبر ALTUSplace مع دفع آمن وتأمين شامل.`
    : 'اكتشف عروض كراء السيارات والعقارات من شركاء محليين موثوقين في المغرب.';
  useSEO({
    title: seoTitle,
    description: seoDescription,
    path: `/car/${carId}`,
    image: car?.image || undefined,
    type: 'product',
    robots: car ? 'index, follow, max-image-preview:large' : 'noindex, follow',
  });

  const [startDate, setStartDate] = useState<string>(() => {
    const param = searchParams.get('startDate');
    if (isIsoDay(param)) return param;
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const param = searchParams.get('endDate');
    if (isIsoDay(param)) return param;
    const date = new Date();
    date.setDate(date.getDate() + 6);
    return date.toISOString().slice(0, 10);
  });
  const [includeInsurance, setIncludeInsurance] = useState(true);
  const [includeBabySeat, setIncludeBabySeat] = useState(false);

  const [copiedLink, setCopiedLink] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  const { data: bookedDatesData, isLoading: bookedDatesLoading, isError: bookedDatesError } = trpc.listings.getBookedDates.useQuery(
    { listingId: numericListingId! },
    { enabled: numericListingId !== null && Boolean(car) },
  );
  const reviewsQuery = trpc.reviews.listByListing.useQuery(
    { listingId: numericListingId! },
    { enabled: numericListingId !== null && Boolean(car) },
  );
  const summaryQuery = trpc.reviews.summary.useQuery(
    { listingId: numericListingId! },
    { enabled: numericListingId !== null && Boolean(car) },
  );
  const trackWhatsAppMutation = trpc.listings.trackEvent.useMutation();
  const reviews = reviewsQuery.data ?? [];
  const summary = summaryQuery.data ?? { average: 0, count: 0 };

  if (listingQuery.isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#1C1C1E] text-slate-200">جاري تحميل تفاصيل الإعلان...</div>;
  }
  
  // Missing or invalid listing ID — show friendly message before query
  if (numericListingId === null && !staticCar) {
    return (
      <div className="min-h-screen flex flex-col gap-4 items-center justify-center bg-[#1C1C1E] text-slate-200">
        <p>معرّف الإعلان غير صالح أو مفقود من الرابط.</p>
        <p className="text-sm text-slate-400">يرجى اختيار إعلان من صفحة البحث.</p>
        <Button onClick={() => setLocation('/search')}>{t("back")}</Button>
      </div>
    );
  }

  if (!car) {
    return (
      <div className="min-h-screen flex flex-col gap-4 items-center justify-center bg-[#1C1C1E] text-slate-200">
        <p>{t("listingsLoadError")}</p>
        <p className="text-sm text-slate-400">الإعلان المطلوب غير متاح حالياً.</p>
        <Button onClick={() => setLocation('/search')}>{t("back")}</Button>
      </div>
    );
  }

  const daysCount = calculateRentalDays(startDate, endDate) || 1;
  const dailyPrice = car.pricePerDay;
  const galleryImages = car.images?.length ? car.images : car.image ? [car.image] : [];
  const safeActive = galleryImages.length > 1 ? Math.min(activeImage, galleryImages.length - 1) : 0;
  const insurancePrice = includeInsurance ? INSURANCE_FEE_PER_DAY * daysCount : 0;
  const babySeatPrice = includeBabySeat ? BABY_SEAT_FEE_PER_DAY * daysCount : 0;
  const totalPrice = calculateRentalSubtotal(dailyPrice, daysCount) + insurancePrice + babySeatPrice;

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

  const handleProceedBooking = (dates?: { checkIn: string; checkOut: string }) => {
    const start = dates?.checkIn ?? startDate;
    const end = dates?.checkOut ?? endDate;
    if (!start || !end) {
      toast.error('يرجى تحديد تاريخ الاستلام والإرجاع');
      return;
    }
    const addOnsParam = [
      includeInsurance ? 'insurance' : null,
      includeBabySeat ? 'baby_seat' : null,
    ].filter((value): value is string => Boolean(value)).join(',');
    const checkoutParams = new URLSearchParams({
      listingId: String(car.id),
      title: car.name,
      pricePerDay: String(dailyPrice),
      days: String(calculateRentalDays(start, end) || 1),
      startDate: start,
      endDate: end,
    });
    if (addOnsParam) checkoutParams.set('addOns', addOnsParam);
    setLocation(`/checkout?${checkoutParams.toString()}`);
  };

  const carSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": `${car.brand} ${car.name}`,
    "image": galleryImages,
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
    ...(reviews.length > 0
      ? {
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": Number(summary.average) || 0,
            "reviewCount": reviews.length,
          },
        }
      : {}),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "ALTUSplace", "item": SITE_URL },
      { "@type": "ListItem", "position": 2, "name": "سيارات للكراء في المغرب", "item": `${SITE_URL}/search` },
      { "@type": "ListItem", "position": 3, "name": `${car.brand} ${car.name}`, "item": `${SITE_URL}/car/${car.id}` },
    ],
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(carSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
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
            <button onClick={() => handleShare('facebook')} className="bg-accent-clay-soft text-accent-clay hover:bg-accent-clay hover:text-white px-3 py-1 rounded-xl text-xs font-bold transition-all border border-accent-clay/30">
              فيسبوك
            </button>
            <button onClick={() => handleShare('copy')} className="bg-slate-800 dark:bg-[#2C2C2E] text-slate-300 dark:text-[#D6D6DB] hover:bg-slate-700 dark:hover:bg-[#48484D] px-3 py-1 rounded-xl text-xs font-bold transition-all border border-slate-700 dark:border-[#48484D] flex items-center gap-1">
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'تم النسخ' : 'نسخ الرابط'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-[#1C1C1E] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="relative h-96">
                <OptimizedImage src={galleryImages[safeActive] ?? car.image} alt={car.name} width={1200} height={675} widthHint={1200} sizes="(max-width: 1024px) 100vw, 66vw" className="w-full h-full object-cover" />
                <div className="absolute top-4 right-4 bg-[#1C1C1E]/90 backdrop-blur-md text-amber-400 font-bold px-4 py-1.5 rounded-2xl text-xs border border-amber-500/30">
                  {car.cityName}
                </div>
                {reviews.length > 0 && (
                  <div className="absolute top-4 left-4 bg-[#1C1C1E]/95 backdrop-blur-md text-white px-3 py-1.5 rounded-2xl text-xs flex items-center gap-1.5 font-bold shadow-lg">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span>{summary.average.toFixed(1)}</span>
                    <span className="text-slate-300">({reviews.length})</span>
                  </div>
                )}
                {galleryImages.length > 1 && (
                  <div className="absolute bottom-3 inset-x-3 flex justify-center gap-2">
                    {galleryImages.map((src, i) => (
                      <button key={`${src}-${i}`} onClick={() => setActiveImage(i)} aria-label={`صورة ${i + 1}`} className="cursor-pointer">
                        <OptimizedImage src={src} alt={`${car.name} — صورة ${i + 1}`} width={96} height={64} className={"h-12 w-16 rounded-lg object-cover border-2 " + (i === safeActive ? "border-amber-400" : "border-white/30 opacity-70 hover:opacity-100")} />
                      </button>
                    ))}
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
                  <div className="bg-[#1C1C1E] border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                    <CarIcon className="w-5 h-5 text-amber-400 mx-auto" />
                    <div className="text-[10px] text-slate-400">ناقل الحركة</div>
                    <div className="text-xs font-bold text-white">{car.transmission}</div>
                  </div>
                  <div className="bg-[#1C1C1E] border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                    <Users className="w-5 h-5 text-amber-400 mx-auto" />
                    <div className="text-[10px] text-slate-400">المقاعد</div>
                    <div className="text-xs font-bold text-white">{typeof car.seats === "number" ? `${car.seats} مقاعد` : car.seats}</div>
                  </div>
                  <div className="bg-[#1C1C1E] border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                    <Fuel className="w-5 h-5 text-amber-400 mx-auto" />
                    <div className="text-[10px] text-slate-400">نوع الوقود</div>
                    <div className="text-xs font-bold text-white">{car.fuel}</div>
                  </div>
                  <div className="bg-[#1C1C1E] border border-slate-800 p-4 rounded-2xl text-center space-y-1">
                    <Calendar className="w-5 h-5 text-amber-400 mx-auto" />
                    <div className="text-[10px] text-slate-400">سنة الصنع</div>
                    <div className="text-xs font-bold text-white">{car.year}</div>
                  </div>
                  <div className="bg-[#1C1C1E] border border-slate-800 p-4 rounded-2xl text-center space-y-1">
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
                      <div key={idx} className="flex items-center gap-2.5 bg-[#1C1C1E]/60 border border-slate-800/80 px-4 py-3 rounded-2xl text-xs text-slate-200">
                        <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agency Info Box */}
                <div className="bg-[#1C1C1E] border border-slate-800 p-6 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4">
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
                  <div className="w-full sm:w-auto flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (numericListingId !== null) {
                          trackWhatsAppMutation.mutate({ listingId: numericListingId, eventType: "whatsapp_click" });
                        }
                        handleProceedBooking();
                      }}
                      className="w-full sm:w-64 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg"
                    >
                      <MessageCircle className="w-4 h-4" /> تأكيد الحجز عبر الواتساب
                    </button>
                    <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                      يُوجَّه طلبك إلى صفحة التأكيد حيث يكون إرفاق البيرمي ووثيقة الهوية إلزامياً قبل الحجز.
                    </p>
                  </div>
                </div>

                {/* Reviews Section */}
                {(reviewsQuery.isLoading || reviews.length > 0) && (
                  <div className="space-y-6 pt-6 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                        <span>تقييمات ومراجعات العملاء {reviews.length > 0 && (<span className="text-amber-400">({summary.average.toFixed(1)} ★ · {reviews.length})</span>)}</span>
                      </h3>
                    </div>

                    <p className="text-xs text-slate-400">تظهر هنا المراجعات المرتبطة بحجوزات مؤكدة ومنتهية فقط.</p>

                    <div className="space-y-4">
                      {reviewsQuery.isLoading ? (
                        <div className="bg-[#1C1C1E] border border-slate-800 p-6 rounded-3xl text-sm text-slate-400">جاري تحميل المراجعات...</div>
                      ) : reviewsQuery.isError ? (
                        <div className="bg-rose-950/30 border border-rose-800/60 p-6 rounded-3xl text-sm text-rose-200">تعذر تحميل المراجعات حالياً.</div>
                      ) : reviews.map((rev) => (
                      <div key={rev.id} className="bg-[#1C1C1E] border border-slate-800 p-6 rounded-3xl space-y-2">
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
                )}

                {numericListingId !== null && <CommentSection listingId={numericListingId} />}

              </div>
            </div>
          </div>

          {/* Booking Card Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <BookingWidget
              pricePerDay={car.pricePerDay}
              currency="MAD"
              initialCheckIn={startDate}
              initialCheckOut={endDate}
              onReserve={({ checkIn, checkOut }) => {
                handleProceedBooking({ checkIn, checkOut });
              }}
            />

            {/* Add-on options — flow through to the secure checkout */}
            <div className="bg-[#1C1C1E] border border-slate-800 rounded-3xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-white">إضافات الحجز</h4>
              <button
                type="button"
                onClick={() => setIncludeInsurance((prev) => !prev)}
                className={`w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition-all text-right ${
                  includeInsurance ? 'border-amber-500/70 bg-amber-500/10' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${includeInsurance ? 'border-amber-500 bg-amber-500' : 'border-slate-600'}`}>
                    {includeInsurance && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">تأمين شامل كل يوم</p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-amber-400" /> تغطية كاملة {INSURANCE_FEE_PER_DAY} درهم/يوم</p>
                  </div>
                </div>
                <span className="text-xs font-black text-amber-400">{insurancePrice} درهم</span>
              </button>
              <button
                type="button"
                onClick={() => setIncludeBabySeat((prev) => !prev)}
                className={`w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition-all text-right ${
                  includeBabySeat ? 'border-amber-500/70 bg-amber-500/10' : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${includeBabySeat ? 'border-amber-500 bg-amber-500' : 'border-slate-600'}`}>
                    {includeBabySeat && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">كرسي أطفال</p>
                    <p className="text-[10px] text-slate-400">{BABY_SEAT_FEE_PER_DAY} درهم/يوم</p>
                  </div>
                </div>
                <span className="text-xs font-black text-amber-400">{babySeatPrice} درهم</span>
              </button>
              <p className="text-[10px] text-slate-500 text-center pt-1 border-t border-slate-800/80">
                تُضاف الاختيارات تلقائياً إلى ملخص الدفع الآمن
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
