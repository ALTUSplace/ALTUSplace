import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowRight, Bath, Bed, Building2, CheckCircle2, Heart, MapPin, Share2, Video, Calendar, Lock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { calculateRentalDays, calculateRentalSubtotal } from "@/lib/pricing";
import { useLanguage } from "@/contexts/LanguageContext";
import { LISTINGS, type ListingItem } from "@/data/altusplace";
import { toast } from "sonner";
import { OptimizedImage } from "@/components/OptimizedImage";
import CommentSection from "@/components/CommentSection";

function parseAmenities(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

type PropertyDetailShape = {
  id: number | string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  city: string;
  status: string;
  pricePerDay: number;
  officeType: string | null;
  category: string;
  rooms: number | null;
  rentalPeriod: "daily" | "monthly" | "yearly" | null;
  amenities: string | null;
};

function mapStaticToDetail(item: ListingItem): PropertyDetailShape {
  const roomsNumber = Number.parseInt(String(item.specs?.rooms ?? "").replace(/[^0-9]/g, ""), 10);
  const amenities = Array.isArray(item.amenities) && item.amenities.length
    ? item.amenities.join(", ")
    : item.features.length
      ? item.features.join(", ")
      : null;
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    imageUrl: item.image,
    city: item.city,
    status: "متاح",
    pricePerDay: item.pricePerUnit,
    officeType: item.officeType ?? null,
    category: item.category,
    rooms: Number.isNaN(roomsNumber) ? null : roomsNumber,
    rentalPeriod: item.rentalTerms?.[0] ?? null,
    amenities,
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

export default function PropertyDetailWithVideo() {
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const { language, direction, t } = useLanguage();

  // Safely parse listing ID — reject missing, non-numeric, or non-positive values
  const parsedId = Number(params.id);
  const listingId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
  const listingQuery = trpc.listings.getById.useQuery({ id: listingId! }, { enabled: listingId !== null });
  const staticItem = listingId === null ? LISTINGS.find((item) => item.id === params.id && item.type !== "car") : undefined;
  const listing = (listingQuery.data ?? (staticItem ? mapStaticToDetail(staticItem) : undefined)) as PropertyDetailShape | undefined;
  const amenities = useMemo(() => parseAmenities(listing?.amenities), [listing?.amenities]);
  const imageUrl = listing?.imageUrl || "";
  const title = listing?.title || (language === "fr" ? "Détails de l'annonce" : "تفاصيل الإعلان");
  const description = listing?.description || (language === "fr" ? "Aucune description fournie par le propriétaire." : "لم يضف المالك وصفاً لهذا الإعلان بعد.");
  const rawPrice = Number(listing?.pricePerDay);
  const safePrice = Number.isFinite(rawPrice) ? rawPrice : 0;
  const unitLabel = useMemo(() => {
    if (staticItem?.unitLabel) return staticItem.unitLabel;
    if (!listing) return language === "fr" ? "MAD / nuit" : "درهم / ليلة";
    if (language === "fr") {
      if (listing.officeType) {
        const map: Record<string, string> = { daily: "MAD / jour", monthly: "MAD / mois", yearly: "MAD / an" };
        return map[listing.rentalPeriod ?? "daily"] ?? "MAD / jour";
      }
      return "MAD / nuit";
    }
    if (listing.officeType) {
      const map: Record<string, string> = { daily: "درهم / يوم", monthly: "درهم / شهر", yearly: "درهم / سنة" };
      return map[listing.rentalPeriod ?? "daily"] ?? "درهم / يوم";
    }
    return "درهم / ليلة";
  }, [listing, staticItem, language]);

  if (listingQuery.isLoading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600">{t("loading")}</div>;
  }
  
  // Log error details for debugging
  if (listingQuery.isError) {
    console.error('Error fetching property listing:', listingQuery.error);
    console.error('Listing ID being fetched:', listingId);
  }
  
  // Missing or invalid listing ID — show friendly message before query
  if (listingId === null && !staticItem) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-4 text-center" dir={direction}>
        <h1 className="text-2xl font-bold text-slate-900">معرّف الإعلان غير صالح</h1>
        <p className="text-slate-600">لم يتم العثور على معرّف الإعلان في الرابط. يرجى اختيار إعلان من صفحة البحث.</p>
        <Button onClick={() => setLocation("/search")}>{t("back")}</Button>
      </div>
    );
  }

  if (listingQuery.isError || !listing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-4 text-center" dir={direction}>
        <h1 className="text-2xl font-bold text-slate-900">{t("listingsLoadError")}</h1>
        <p className="text-slate-600">الإعلان المطلوب غير متاح حالياً أو تم إزالته.</p>
        <Button onClick={() => setLocation("/search")}>{t("back")}</Button>
      </div>
    );
  }

  const schema = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listing.title,
    description,
    image: imageUrl ? [imageUrl] : [],
    address: { "@type": "PostalAddress", addressLocality: listing.city, addressCountry: "MA" },
    offers: { "@type": "Offer", priceCurrency: "MAD", price: safePrice, availability: "https://schema.org/InStock" },
  };

  // Booking state
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

  const daysCount = useMemo(
    () => calculateRentalDays(startDate, endDate) || 1,
    [startDate, endDate],
  );

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
    const checkoutParams = new URLSearchParams({
      listingId: String(listing.id),
      title: listing.title,
      pricePerDay: String(safePrice),
      startDate,
      endDate,
    });
    setLocation(`/checkout?${checkoutParams.toString()}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4 sm:px-6" dir={direction}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => window.history.back()} className="gap-2 text-slate-600 px-0">
            <ArrowRight className="w-4 h-4" /> {language === "fr" ? "Retour aux résultats" : "العودة إلى النتائج"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toast.success(language === "fr" ? "Lien copié" : "تم نسخ الرابط")}><Share2 className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => toast.success(language === "fr" ? "Ajouté aux favoris" : "تمت الإضافة إلى المفضلة")}><Heart className="w-4 h-4" /></Button>
          </div>
        </div>

        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2"><Badge className="bg-amber-500">{listing.status}</Badge><span className="text-xs text-slate-500">{language === "fr" ? "Aucun avis vérifié pour le moment" : "لا توجد مراجعات موثقة بعد"}</span></div>
          <h1 className="text-2xl sm:text-4xl font-bold text-slate-900">{title}</h1>
          <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="w-4 h-4 text-amber-600" />{listing.city}</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 min-h-[280px] sm:min-h-[420px] rounded-2xl overflow-hidden bg-slate-200">
            {imageUrl ? <OptimizedImage src={imageUrl} alt={title} width={1400} height={820} widthHint={1400} sizes="100vw" className="w-full h-full min-h-[280px] sm:min-h-[420px] object-cover" /> : <div className="h-full min-h-[280px] sm:min-h-[420px] flex items-center justify-center text-slate-500">{language === "fr" ? "Aucune image fournie" : "لا توجد صورة مضافة"}</div>}
          </div>
          <Card className="border-amber-200 shadow-lg shadow-amber-100/50">
            <CardContent className="p-5 space-y-4">
              <div>
                <p className="text-xs text-slate-500">{t("price")}</p>
                <p className="text-3xl font-bold text-slate-900">{safePrice.toLocaleString("fr-MA")} <span className="text-sm font-normal">{unitLabel}</span></p>
              </div>
              
              {/* Date Selection */}
              <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Calendar className="w-4 h-4 text-amber-600" />
                  {language === "fr" ? "Sélectionner les dates" : "اختر تواريخ الحجز"}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-semibold">{language === "fr" ? "Début" : "البداية"}</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-semibold">{language === "fr" ? "Fin" : "النهاية"}</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{daysCount} {language === "fr" ? "jours" : "أيام"}</span>
                  <span className="font-bold text-amber-600">{totalPrice.toLocaleString("fr-MA")} {language === "fr" ? "MAD" : "درهم"}</span>
                </div>
              </div>

              <Button onClick={handleProceedToCheckout} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-3.5 rounded-xl shadow-lg shadow-amber-200/50 flex items-center justify-center gap-2 transition-all hover:shadow-amber-300/50 hover:scale-[1.02] active:scale-[0.98]">
                <ShieldCheck className="w-4 h-4" />
                {t("bookNow")}
              </Button>
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
                <Lock className="w-3 h-3 text-emerald-600" />
                {language === "fr" ? "Paiement sécurisé via CMI (simulation)" : "دفع آمن عبر CMI (محاكاة)"}
              </div>
              <p className="text-xs text-slate-500 text-center">{language === "fr" ? "Le prix final est calculé côté serveur lors de la réservation." : "يُحتسب السعر النهائي على الخادم أثناء الحجز."}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[[Building2, language === "fr" ? "Type" : "النوع", listing.officeType ? (language === "fr" ? OFFICE_TYPE_LABEL_FR[listing.officeType] : OFFICE_TYPE_LABEL[listing.officeType]) || listing.officeType : listing.category || "—"], [Bed, language === "fr" ? "Pièces" : "الغرف", listing.rooms ? String(listing.rooms) : "—"], [Bath, language === "fr" ? "Période" : "المدة", listing.rentalPeriod ? (language === "fr" ? RENTAL_LABEL_FR[listing.rentalPeriod] : RENTAL_LABEL[listing.rentalPeriod]) : "—"], [MapPin, language === "fr" ? "Ville" : "المدينة", listing.city]].map(([Icon, label, value]) => <Card key={String(label)}><CardContent className="p-4"><Icon className="w-5 h-5 text-amber-600 mb-2" /><p className="text-xs text-slate-500">{String(label)}</p><p className="font-semibold text-slate-800 truncate">{String(value)}</p></CardContent></Card>)}
        </div>

        <Card><CardContent className="p-5 space-y-4"><h2 className="text-xl font-bold text-slate-900">{language === "fr" ? "Description" : "الوصف"}</h2><p className="text-slate-600 leading-7">{description}</p></CardContent></Card>
        <Card><CardContent className="p-5 space-y-4"><h2 className="text-xl font-bold text-slate-900">{language === "fr" ? "Équipements et visite vidéo" : "التجهيزات وجولة الفيديو"}</h2>{amenities.length ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{amenities.map((item) => <div key={item} className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 className="w-4 h-4 text-emerald-600" />{item}</div>)}</div> : <p className="text-sm text-slate-500">{language === "fr" ? "Aucun équipement renseigné." : "لم تُسجل تجهيزات لهذا الإعلان بعد."}</p>}<div className="border-t pt-4 flex items-center gap-3 text-sm text-slate-500"><Video className="w-5 h-5 text-slate-400" />{language === "fr" ? "Aucune vidéo vérifiée n’est disponible pour cette annonce." : "لا يوجد فيديو موثق متاح لهذا الإعلان حالياً."}</div></CardContent></Card>
        {listingId !== null && <CommentSection listingId={listingId} />}
      </div>
    </div>
  );
}
