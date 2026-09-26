import { useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Bed,
  Building2,
  CalendarDays,
  Calendar,
  Layers,
  Lock,
  MapPin,
  Ruler,
  Share2,
  ShieldCheck,
  Star,
  Navigation,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { calculateRentalDays, calculateRentalSubtotal } from "@/lib/pricing";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSEO, SITE_URL } from "@/lib/seo";
import { LISTINGS, type ListingItem } from "@/data/altusplace";
import { toast } from "sonner";
import CommentSection from "@/components/CommentSection";
import RatingBreakdownBar, { breakdownToScores, canShowBreakdown } from "@/components/RatingBreakdownBar";
import { PartnerVerifiedBadge } from "@/components/ui/PartnerVerifiedBadge";
import { FavoriteButton } from "@/components/FavoriteButton";
import { PropertyGallery } from "@/components/PropertyGallery";
import { PropertyLocationMap, buildPropertyDirectionsUrl } from "@/components/PropertyLocationMap";
import type { LatLng } from "@/lib/mapbox";

type PropertyDetailShape = {
  id: number | string;
  title: string;
  titleFr?: string | null;
  description: string | null;
  descriptionFr?: string | null;
  imageUrl: string | null;
  images?: string[] | null;
  area?: number | null;
  floor?: number | null;
  city: string;
  status: string;
  pricePerDay: number;
  pricePerMonth: number | null;
  officeType: string | null;
  propertyType: string | null;
  category: string;
  rooms: number | null;
  rentalPeriod: "daily" | "monthly" | "yearly" | null;
  agencyPhone?: string | null;
  whatsappPhone?: string | null;
  /** Public WhatsApp number used for the wa.me click-to-chat CTA. */
  whatsappNumber?: string | null;
  /** Owner role drives the partner-verified badge; only `partner` accounts verify. */
  ownerRole?: string | null;
  /** Owner-supplied coordinates. Null for most listings — the map is hidden then. */
  lat?: number | null;
  lng?: number | null;
};

function mapStaticToDetail(item: ListingItem): PropertyDetailShape {
  const roomsNumber = Number.parseInt(String(item.specs?.rooms ?? "").replace(/[^0-9]/g, ""), 10);
  return {
    id: item.id,
    title: item.title,
    titleFr: item.titleFr ?? null,
    description: item.description,
    descriptionFr: item.descriptionFr ?? null,
    imageUrl: item.image,
    images: item.images?.length ? item.images : item.image ? [item.image] : [],
    city: item.city,
    status: "متاح",
    pricePerDay: item.pricePerUnit,
    pricePerMonth: null,
    officeType: item.officeType ?? null,
    propertyType: null,
    category: item.category,
    rooms: Number.isNaN(roomsNumber) ? null : roomsNumber,
    rentalPeriod: (["daily", "monthly", "yearly"] as const).find((p) => p === item.rentalTerms?.[0]) ?? null,
  };
}

const OFFICE_TYPE_LABEL: Record<string, string> = {
  private: "مكتب خاص",
  coworking: "مساحة عمل مشتركة",
  meeting_room: "قاعة اجتماعات",
  company_headquarters: "مقر شركة",
};
const OFFICE_TYPE_LABEL_FR: Record<string, string> = {
  private: "Bureau privé",
  coworking: "Coworking",
  meeting_room: "Salle de réunion",
  company_headquarters: "Siège d'entreprise",
};
const RENTAL_LABEL: Record<string, string> = {
  daily: "يومي",
  monthly: "شهري",
  yearly: "سنوي",
};
const RENTAL_LABEL_FR: Record<string, string> = {
  daily: "Quotidien",
  monthly: "Mensuel",
  yearly: "Annuel",
};

const isIsoDay = (value: string | null): value is string => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");

/**
 * A usable pin needs both coordinates to be finite numbers. A single null is
 * treated as "no location" rather than silently substituting a city centroid —
 * see the precision contract in `PropertyLocationMap`.
 */
function toExactCoords(lat?: number | null, lng?: number | null): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: lat as number, lng: lng as number };
}

export default function PropertyDetailWithVideo() {
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const { language, direction, t } = useLanguage();
  const isRtl = direction === "rtl";

  // Safely parse listing ID — reject missing, non-numeric, or non-positive values
  const parsedId = Number(params.id);
  const listingId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
  const listingQuery = trpc.listings.getById.useQuery({ id: listingId! }, { enabled: listingId !== null });
  const bookedDatesQuery = trpc.listings.getBookedDates.useQuery({ listingId: listingId! }, { enabled: listingId !== null });
  const reviewListQuery = trpc.reviews.listByListing.useQuery({ listingId: listingId! }, { enabled: listingId !== null });
  const summaryQuery = trpc.reviews.summary.useQuery({ listingId: listingId! }, { enabled: listingId !== null });
  const propertyReviews = reviewListQuery.data ?? [];
  const summary = summaryQuery.data ?? { average: 0, count: 0 };
  const staticItem = listingId === null ? LISTINGS.find((item) => item.id === params.id && item.type !== "car") : undefined;
  const listing = (listingQuery.data ?? (staticItem ? mapStaticToDetail(staticItem) : undefined)) as PropertyDetailShape | undefined;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const galleryImages = listing?.images?.length
    ? listing.images
    : listing?.imageUrl
      ? [listing.imageUrl]
      : [];
  const imageUrl = galleryImages[0] ?? "";
  const title = language === "fr" && listing?.titleFr
    ? listing.titleFr
    : (listing?.title || (language === "fr" ? "Détails de l'annonce" : "تفاصيل الإعلان"));
  const arabicTitle = listing?.title || "";
  const description = language === "fr" && listing?.descriptionFr
    ? listing.descriptionFr
    : (listing?.description || (language === "fr" ? "Aucune description fournie par le propriétaire." : "لم يضف المالك وصفاً لهذا الإعلان بعد."));
  const rawPrice = Number(listing?.pricePerDay);
  const safePrice = Number.isFinite(rawPrice) ? rawPrice : 0;
  const exactCoords = toExactCoords(listing?.lat, listing?.lng);
  const unitLabel = useMemo(() => {
    if (staticItem?.unitLabel) return staticItem.unitLabel;
    if (!listing) return language === "fr" ? "MAD / nuit" : "درهم / ليلة";
    if (language === "fr") {
      if (listing.officeType || listing.propertyType) {
        const map: Record<string, string> = { daily: "MAD / jour", monthly: "MAD / mois", yearly: "MAD / an" };
        return map[listing.rentalPeriod ?? "daily"] ?? "MAD / jour";
      }
      return "MAD / nuit";
    }
    if (listing.officeType || listing.propertyType) {
      const map: Record<string, string> = { daily: "درهم / يوم", monthly: "درهم / شهر", yearly: "درهم / سنة" };
      return map[listing.rentalPeriod ?? "daily"] ?? "درهم / يوم";
    }
    return "درهم / ليلة";
  }, [listing, staticItem, language]);

  // SEO runs before the loading/not-found early returns so stale or invalid
  // listing ids still get a canonical + noindex instead of inheriting the hub's.
  const seoTitle = listing ? `${title} — ${listing.city} | ALTUSplace` : "ALTUSplace";
  const seoDescription = listing
    ? description
    : language === "fr"
      ? "Découvrez des biens immobiliers à louer partout au Maroc avec ALTUSplace."
      : "اكتشف عقارات للإيجار في جميع مدن المغرب عبر ALTUSplace.";
  useSEO({
    title: seoTitle,
    description: seoDescription,
    path: `/property/${params.id}`,
    language,
    image: imageUrl || undefined,
    type: "place",
    robots: listing ? "index, follow, max-image-preview:large" : "noindex, follow",
  });

  // Booking state
  const [startDate, setStartDate] = useState(() => {
    const param = searchParams.get("startDate");
    if (isIsoDay(param)) return param;
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const param = searchParams.get("endDate");
    if (isIsoDay(param)) return param;
    const date = new Date();
    date.setDate(date.getDate() + 6);
    return date.toISOString().slice(0, 10);
  });

  const daysCount = useMemo(
    () => calculateRentalDays(startDate, endDate) || 1,
    [startDate, endDate],
  );

  // Blocked date ranges from confirmed bookings, manual availability blocks
  // and iCal imports — used to warn renters and stop checkout on overlaps.
  const blockedRanges = useMemo(
    () => (bookedDatesQuery.data ?? []).map((range) => ({ start: String(range.start).slice(0, 10), end: String(range.end).slice(0, 10) })),
    [bookedDatesQuery.data],
  );
  const rangeBlocked = useMemo(() => {
    if (!startDate || !endDate || new Date(endDate) <= new Date(startDate)) return false;
    const s = new Date(`${startDate}T00:00:00`);
    const e = new Date(`${endDate}T00:00:00`);
    return blockedRanges.some((range) => {
      const rs = new Date(`${range.start}T00:00:00`);
      const re = new Date(`${range.end}T00:00:00`);
      return s.getTime() < re.getTime() && e.getTime() > rs.getTime();
    });
  }, [blockedRanges, startDate, endDate]);

  const monthlyPrice = Number(listing?.pricePerMonth) || 0;

  if (listingQuery.isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-ink-secondary">{t("loading")}</div>;
  }

  // Missing or invalid listing ID — show friendly message before query
  if (listingId === null && !staticItem) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4 text-center" dir={direction}>
        <h1 className="text-2xl font-bold text-ink-primary">معرّف الإعلان غير صالح</h1>
        <p className="text-ink-secondary">لم يتم العثور على معرّف الإعلان في الرابط. يرجى اختيار إعلان من صفحة البحث.</p>
        <Button onClick={() => setLocation("/search")}>{t("back")}</Button>
      </div>
    );
  }

  if (listingQuery.isError || !listing) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4 text-center" dir={direction}>
        <h1 className="text-2xl font-bold text-ink-primary">{t("listingsLoadError")}</h1>
        <p className="text-ink-secondary">الإعلان المطلوب غير متاح حالياً أو تم إزالته.</p>
        <Button onClick={() => setLocation("/search")}>{t("back")}</Button>
      </div>
    );
  }

  const schema = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listing.title,
    description,
    image: galleryImages.length ? galleryImages : [],
    address: {
      "@type": "PostalAddress",
      addressLocality: listing.city,
      addressCountry: "MA",
      ...(exactCoords
        ? { geo: { "@type": "GeoCoordinates", latitude: exactCoords.lat, longitude: exactCoords.lng } }
        : {}),
    },
    offers: { "@type": "Offer", priceCurrency: "MAD", price: safePrice, availability: "https://schema.org/InStock" },
    ...(summary.count > 0
      ? {
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": Number(summary.average) || 0,
            "reviewCount": summary.count,
          },
        }
      : {}),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "ALTUSplace", "item": SITE_URL },
      { "@type": "ListItem", "position": 2, "name": "عقارات للكراء في المغرب", "item": `${SITE_URL}/search` },
      { "@type": "ListItem", "position": 3, "name": listing.title, "item": `${SITE_URL}/property/${listing.id}` },
    ],
  };

  const totalPrice = calculateRentalSubtotal(safePrice, daysCount) || safePrice * daysCount;

  const handleProceedToCheckout = () => {
    if (!startDate || !endDate) {
      toast.error(language === "fr" ? "Veuillez sélectionner les dates" : "يرجى تحديد تاريخ البداية والنهاية");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      toast.error(language === "fr" ? "La date de fin doit être après la date de début" : "تاريخ النهاية يجب أن يكون بعد تاريخ البداية");
      return;
    }
    if (rangeBlocked) {
      toast.error(language === "fr" ? "Cette période est déjà réservée — veuillez en choisir une autre" : "هذه الفترة محجوزة أو محجوبة — المرجو اختيار فترة أخرى");
      return;
    }
    const checkoutParams = new URLSearchParams({
      listingId: String(listing.id),
      title: listing.title,
      pricePerDay: String(safePrice),
      startDate,
      endDate,
    });
    setLocation(`/checkout?${checkoutParams.toString()}`);
  };

  const typeLabel = listing.officeType
    ? (language === "fr" ? OFFICE_TYPE_LABEL_FR[listing.officeType] : OFFICE_TYPE_LABEL[listing.officeType]) || listing.officeType
    : listing.propertyType || listing.category;
  const periodLabel = listing.rentalPeriod
    ? (language === "fr" ? RENTAL_LABEL_FR[listing.rentalPeriod] : RENTAL_LABEL[listing.rentalPeriod])
    : null;

  // Only the specs the listing actually carries. `rooms`, `area` and `floor` are
  // the three numeric facts a renter scans for; anything missing is dropped
  // rather than rendered as an em dash, so the row never shows empty cells.
  const specs = [
    listing.rooms ? { icon: Bed, label: language === "fr" ? "Chambres" : "الغرف", value: String(listing.rooms) } : null,
    listing.area && listing.area > 0
      ? { icon: Ruler, label: language === "fr" ? "Surface" : "المساحة", value: `${listing.area} m²` }
      : null,
    listing.floor !== null && listing.floor !== undefined
      ? { icon: Layers, label: language === "fr" ? "Étage" : "الطابق", value: String(listing.floor) }
      : null,
  ].filter((spec): spec is { icon: typeof Bed; label: string; value: string } => spec !== null);

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const cityMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing.city)}`;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20" dir={direction}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <div className="container mx-auto px-4 space-y-8">
        <div className="flex items-center justify-between gap-3 pt-6">
          <Button variant="ghost" onClick={() => window.history.back()} className="gap-2 px-0 text-ink-secondary">
            <BackIcon className="size-4" aria-hidden="true" /> {language === "fr" ? "Retour aux résultats" : "العودة إلى النتائج"}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => toast.success(language === "fr" ? "Lien copié" : "تم نسخ الرابط")}
              aria-label={language === "fr" ? "Partager" : "مشاركة"}
            >
              <Share2 className="size-4" aria-hidden="true" />
            </Button>
            {listingId !== null && <FavoriteButton listingId={listingId} size="md" />}
          </div>
        </div>

        {/* 1 — Hero: title and price anchored together at the inline-start corner. */}
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-accent-clay-soft text-accent-clay hover:bg-accent-clay-soft">
              {({ Published: "منشور", Available: "متاح", Pending: "قيد المراجعة", Unavailable: "غير متاح", Rejected: "مرفوض" } as Record<string, string>)[listing.status] ?? listing.status}
            </Badge>
            {summary.count > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent-amber">
                <Star className="size-3.5 fill-accent-amber" aria-hidden="true" />
                {summary.average.toFixed(1)}
                <span className="font-medium text-ink-secondary">({summary.count})</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-3xl font-bold text-ink-primary sm:text-4xl lg:text-5xl">{title}</h1>
            {listing?.ownerRole === "partner" && <PartnerVerifiedBadge />}
          </div>

          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-secondary">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4 text-accent-clay" aria-hidden="true" />
              {listing.city}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-4 text-accent-clay" aria-hidden="true" />
              {typeLabel}
            </span>
            {periodLabel && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4 text-accent-clay" aria-hidden="true" />
                {periodLabel}
              </span>
            )}
          </p>
          {language === "fr" && arabicTitle && title !== arabicTitle && (
            <p className="text-sm font-medium text-ink-secondary">{arabicTitle}</p>
          )}
        </header>

        {/* 2 — Key specs strip, directly under the title. */}
        {specs.length > 0 && (
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-4 border-y border-border-subtle py-4">
            {specs.map(({ icon: Icon, label, value }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-clay-soft text-accent-clay">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="flex flex-col">
                  <span className="text-xs text-ink-secondary">{label}</span>
                  <span className="text-lg font-bold text-ink-primary">{value}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* 3 — Full-width gallery. */}
        <PropertyGallery
          images={galleryImages}
          title={title}
          direction={direction}
          emptyLabel={language === "fr" ? "Aucune image fournie" : "لا توجد صورة مضافة"}
        />

        <div className="grid gap-6 lg:grid-cols-4 lg:gap-8">
          <div className="space-y-6 lg:col-span-3">
            {/* 4 — Description. Owner's own words, clamped until expanded. */}
            <section aria-labelledby="property-description-heading" className="rounded-3xl border border-border-subtle bg-bg-surface p-6">
              <h2 id="property-description-heading" className="mb-3 text-xl font-bold text-ink-primary">
                {language === "fr" ? "Description" : "الوصف"}
              </h2>
              <p
                className={
                  descriptionExpanded
                    ? "text-sm leading-7 text-ink-secondary"
                    : "line-clamp-3 text-sm leading-7 text-ink-secondary"
                }
              >
                {description}
              </p>
              {description.length > 220 && (
                <button
                  type="button"
                  onClick={() => setDescriptionExpanded((value) => !value)}
                  className="mt-2 text-sm font-bold text-accent-clay hover:underline"
                >
                  {descriptionExpanded
                    ? (language === "fr" ? "Réduire" : "عرض أقل")
                    : (language === "fr" ? "Lire la suite" : "اقرأ المزيد")}
                </button>
              )}
            </section>

            {/* 5 — Location. Pinned only when the owner supplied real coordinates. */}
            <section aria-labelledby="property-location-heading" className="rounded-3xl border border-border-subtle bg-bg-surface p-6">
              <h2 id="property-location-heading" className="mb-4 text-xl font-bold text-ink-primary">
                {language === "fr" ? "Localisation" : "الموقع"}
              </h2>
              {exactCoords ? (
                <div className="space-y-3">
                  <PropertyLocationMap
                    coords={exactCoords}
                    label={language === "fr" ? `Localisation de ${title}` : `موقع ${title}`}
                    missingTokenNotice={
                      language === "fr"
                        ? "La carte interactive n'est pas configurée sur cet environnement."
                        : "الخريطة التفاعلية غير مهيأة في هذه البيئة."
                    }
                    openInMapsLabel={language === "fr" ? "Ouvrir dans Google Maps" : "افتح في خرائط جوجل"}
                    loadingLabel={language === "fr" ? "Chargement de la carte…" : "جارٍ تحميل الخريطة…"}
                    className="h-[280px] overflow-hidden rounded-2xl border border-border-subtle sm:h-[360px]"
                  />
                  <a
                    href={buildPropertyDirectionsUrl(exactCoords)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-accent-clay hover:underline"
                  >
                    <Navigation className="size-4" aria-hidden="true" />
                    {language === "fr" ? "Itinéraire" : "الاتجاهات"}
                  </a>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-bg-muted p-5">
                  <p className="flex items-center gap-2 text-sm text-ink-secondary">
                    <MapPin className="size-4 text-accent-clay" aria-hidden="true" />
                    {language === "fr"
                      ? `Ce bien se situe à ${listing.city}. Les coordonnées exactes n'ont pas été fournies.`
                      : `يقع هذا العقار في ${listing.city}. لم يتم توفير الإحداثيات الدقيقة.`}
                  </p>
                  <a
                    href={cityMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-accent-clay hover:underline"
                  >
                    <Navigation className="size-4" aria-hidden="true" />
                    {language === "fr" ? `Voir ${listing.city}` : `عرض ${listing.city}`}
                  </a>
                </div>
              )}
            </section>

            {/* Social proof, consolidated below the fold. */}
            {reviewListQuery.isSuccess && (
              <section aria-labelledby="property-reviews-heading" className="rounded-3xl border border-border-subtle bg-bg-surface p-6">
                <h2 id="property-reviews-heading" className="flex items-center gap-2 text-xl font-bold text-ink-primary">
                  <Star className="size-5 fill-accent-amber text-accent-amber" aria-hidden="true" />
                  {language === "fr" ? "Avis clients" : t("reviewsSectionTitle")}
                </h2>
                {propertyReviews.length > 0 ? (
                  <div className="mt-4 space-y-5">
                    <p className="flex items-center gap-2 text-sm text-accent-amber">
                      <Star className="size-4 fill-accent-amber" aria-hidden="true" />
                      <span className="font-bold">{summary.average.toFixed(1)}</span>
                      <span className="text-ink-secondary">({summary.count} {language === "fr" ? "avis" : "مراجعات"})</span>
                    </p>
                    {listingQuery.data && canShowBreakdown(listingQuery.data.ratingBreakdown) && (
                      <RatingBreakdownBar scores={breakdownToScores(listingQuery.data.ratingBreakdown)} />
                    )}
                    <div className="space-y-4">
                      {propertyReviews.map((rev) => (
                        <div key={rev.id} className="space-y-2 rounded-2xl bg-bg-muted p-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink-primary">
                              {rev.userName || (language === "fr" ? "Utilisateur ALTUSplace" : t("reviewsAnonymousUser"))}
                              {rev.isVerified && (
                                /* The green wash carries the "verified" signal;
                                   the label itself is ink-primary because
                                   --accent-green is a recorded AA debt on light
                                   surfaces (3.26:1 here, floor is 4.5:1). */
                                <span className="inline-flex items-center gap-1 rounded-full bg-accent-green/10 px-2 py-0.5 text-[10px] font-bold text-ink-primary">
                                  <ShieldCheck className="size-3" aria-hidden="true" /> {t("reviewVerifiedBadge")}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-xs text-ink-secondary">
                              {new Date(rev.createdAt).toLocaleDateString(language === "fr" ? "fr-MA" : "ar-MA")}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-accent-amber">
                            {Array.from({ length: rev.rating }).map((_, i) => (
                              <Star key={i} className="size-3.5 fill-current" aria-hidden="true" />
                            ))}
                          </div>
                          <p className="text-sm leading-relaxed text-ink-secondary">{rev.comment}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 rounded-2xl bg-bg-muted p-4 text-center text-sm text-ink-secondary">{t("reviewsNewEmpty")}</p>
                )}
              </section>
            )}

            {listingId !== null && <CommentSection listingId={listingId} />}
          </div>

          {/* 6 — Sticky booking panel: price, dates and CTA stay reachable. */}
          <aside className="lg:col-span-1">
            <div className="space-y-4 lg:sticky lg:top-28">
              <div className="rounded-3xl border border-border-subtle bg-bg-surface p-6 shadow-card">
                <p className="text-2xl font-bold text-ink-primary">
                  {safePrice.toLocaleString("fr-MA")}{" "}
                  <span className="text-sm font-normal text-ink-secondary">{unitLabel}</span>
                </p>
                {monthlyPrice > 0 && (
                  <p className="mt-1 text-sm font-bold text-accent-clay">
                    {language === "fr" ? "ou" : "أو"} {monthlyPrice.toLocaleString("fr-MA")}{" "}
                    {language === "fr" ? "MAD / mois" : "درهم / شهر"}
                  </p>
                )}
              </div>

              <div className="space-y-4 rounded-3xl border border-border-subtle bg-bg-surface p-6 shadow-card">
                <div className="flex items-center gap-2 text-sm font-bold text-ink-primary">
                  <Calendar className="size-4 text-accent-clay" aria-hidden="true" />
                  {language === "fr" ? "Sélectionner les dates" : "اختر تواريخ الحجز"}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="booking-start" className="text-xs font-semibold text-ink-secondary">
                      {language === "fr" ? "Début" : "البداية"}
                    </label>
                    <input
                      id="booking-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-border-default bg-bg-muted px-3 py-2 text-sm text-ink-primary focus:border-accent-clay focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="booking-end" className="text-xs font-semibold text-ink-secondary">
                      {language === "fr" ? "Fin" : "النهاية"}
                    </label>
                    <input
                      id="booking-end"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-xl border border-border-default bg-bg-muted px-3 py-2 text-sm text-ink-primary focus:border-accent-clay focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-secondary">
                    {daysCount} {language === "fr" ? "jours" : "أيام"}
                  </span>
                  <span className="font-bold text-accent-clay">{totalPrice.toLocaleString("fr-MA")} {language === "fr" ? "MAD" : "درهم"}</span>
                </div>
                {rangeBlocked && (
                  /* Red text sits on the neutral muted surface, not on a red
                     tint: --accent-red on a 10% red wash is only 4.14:1 in the
                     light theme, under the 4.5:1 AA floor for small text. */
                  <p
                    className="rounded-xl border border-destructive/30 bg-bg-muted p-3 text-xs font-bold text-destructive"
                    role="alert"
                  >
                    {language === "fr" ? "Période indisponible — déjà réservée." : "هذه الفترة محجوزة أو محجوبة — اختَر فترة أخرى."}
                  </p>
                )}
                <Button
                  onClick={handleProceedToCheckout}
                  disabled={rangeBlocked}
                  className="min-h-[44px] w-full rounded-xl font-bold"
                >
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  {t("bookNow")}
                </Button>
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-secondary">
                  <Lock className="size-3 text-accent-green" aria-hidden="true" />
                  {language === "fr" ? "Paiement sécurisé via CMI (simulation)" : "دفع آمن عبر CMI (محاكاة)"}
                </p>
                <p className="text-center text-[11px] leading-relaxed text-ink-secondary">
                  {language === "fr"
                    ? "Identité et pièces obligatoires requises avant confirmation."
                    : "التحقق من الهوية وإرفاق الوثائق الإلزامية مطلوب قبل تأكيد الحجز."}
                </p>
                <p className="text-center text-[11px] text-ink-secondary">
                  {language === "fr"
                    ? "Le prix final est calculé côté serveur lors de la réservation."
                    : "يُحتسب السعر النهائي على الخادم أثناء الحجز."}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
