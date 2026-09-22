import { useEffect, useMemo } from "react";
import { Link, useRoute } from "wouter";
import { ArrowRight, Car, MapPin, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { ListingCard } from "@/components/ui/ListingCard";
import { renderJsonLd, useSEO, BASE_URL } from "@/lib/seo";
import { isCarCategory } from "@/lib/categories";
import {
  MOROCCO_REGIONS,
  cityFromSlug,
  slugForCity,
  cityLabelFr,
  matchListingCity,
} from "@/data/moroccoCities";

const locations = {
  marrakech: {
    path: "/locations/marrakech-car-rental",
    ar: { title: "كراء السيارات في مراكش", description: "اكتشف سيارات موثوقة للكراء في مراكش، قرب المدينة القديمة، كليز والمطار.", city: "مراكش" },
    fr: { title: "Location de voitures à Marrakech", description: "Trouvez une voiture fiable à Marrakech, près de la médina, Guéliz et de l'aéroport.", city: "Marrakech" },
    en: { title: "Car rental in Marrakech", description: "Find reliable cars for rent in Marrakech, near the medina, Gueliz and the airport.", city: "Marrakech" },
  },
  casablancaAirport: {
    path: "/locations/mohammed-v-airport-car-rental",
    ar: { title: "كراء السيارات في مطار محمد الخامس", description: "احجز سيارة عند الوصول إلى مطار محمد الخامس واستلمها بسهولة من شركاء ALTUSplace.", city: "الدار البيضاء" },
    fr: { title: "Location de voitures à l'aéroport Mohammed V", description: "Réservez votre voiture à l'arrivée à l'aéroport Mohammed V auprès des partenaires ALTUSplace.", city: "Casablanca" },
    en: { title: "Car rental at Mohammed V Airport", description: "Book a car on arrival at Mohammed V Airport with trusted ALTUSplace partners.", city: "Casablanca" },
  },
} as const;

type LocationKey = keyof typeof locations;

function FeatureCards({ isArabic, language }: { isArabic: boolean; language: string }) {
  return (
    <section className="grid gap-5 md:grid-cols-3">
      <div className="rounded-2xl bg-white p-6 shadow-sm"><ShieldCheck className="mb-3 h-6 w-6 text-emerald-600" /><h2 className="font-bold">{isArabic ? "شركاء محليون" : language === "fr" ? "Partenaires locaux" : "Local partners"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{isArabic ? "عروض من وكالات وشركاء داخل المغرب." : language === "fr" ? "Des offres proposées par des partenaires au Maroc." : "Offers from local Moroccan partners."}</p></div>
      <div className="rounded-2xl bg-white p-6 shadow-sm"><MapPin className="mb-3 h-6 w-6 text-amber-600" /><h2 className="font-bold">{isArabic ? "مواقع مرنة" : language === "fr" ? "Points flexibles" : "Flexible locations"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{isArabic ? "اختر المدينة أو المطار المناسب لرحلتك." : language === "fr" ? "Choisissez la ville ou l'aéroport adapté à votre voyage." : "Choose the city or airport that fits your trip."}</p></div>
      <div className="rounded-2xl bg-white p-6 shadow-sm"><Car className="mb-3 h-6 w-6 text-accent-clay" /><h2 className="font-bold">{isArabic ? "بحث سريع" : language === "fr" ? "Recherche rapide" : "Fast search"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{isArabic ? "قارن العروض والأسعار قبل التواصل مع الشريك." : language === "fr" ? "Comparez les offres et les prix avant de contacter le partenaire." : "Compare offers and prices before contacting the partner."}</p></div>
    </section>
  );
}

function BespokeLocationPage({ location }: { location: LocationKey }) {
  const { language } = useLanguage();
  const content = locations[location][language] ?? locations[location].fr;
  const isArabic = language === "ar";
  const path = locations[location].path;

  useSEO({ title: content.title, description: content.description, path, language });

  useEffect(() => {
    renderJsonLd("locations-breadcrumb-jsonld", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ALTUSplace", item: `${BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: content.city, item: `${BASE_URL}${path}` },
      ],
    });
  }, [content.city, path]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-3xl bg-[#1C1C1E] p-8 text-white shadow-xl md:p-12">
          <div className="mb-4 flex items-center gap-2 text-amber-300"><MapPin className="h-5 w-5" /><span>ALTUSplace Morocco</span></div>
          <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-5xl">{content.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-200">{content.description}</p>
          <Link href={`/search?city=${encodeURIComponent(content.city)}`} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-bold text-slate-950 hover:bg-amber-400"><Car className="h-5 w-5" />{isArabic ? "شاهد السيارات المتاحة" : language === "fr" ? "Voir les voitures disponibles" : "View available cars"}<ArrowRight className="h-4 w-4" /></Link>
        </section>
        <FeatureCards isArabic={isArabic} language={language} />
        <nav className="flex flex-wrap gap-3 text-sm"><Link href="/locations/marrakech-car-rental" className="text-[#1C1C1E] underline">Marrakech</Link><Link href="/locations/mohammed-v-airport-car-rental" className="text-[#1C1C1E] underline">Mohammed V Airport</Link><Link href="/locations" className="text-[#1C1C1E] underline">{isArabic ? "كل مدن المغرب" : "Toutes les villes du Maroc"}</Link><Link href="/search" className="text-[#1C1C1E] underline">{isArabic ? "كل العروض" : language === "fr" ? "Toutes les offres" : "All listings"}</Link></nav>
      </div>
    </div>
  );
}

function CityLocationPage({ city, canonicalPath: canonicalPathProp }: { city: string; canonicalPath?: string }) {
  const { language } = useLanguage();
  const slug = slugForCity(city);
  const isArabic = language === "ar";
  const cityNameFr = cityLabelFr(city);
  // The /city/:slug marketing routes canonicalize to themselves; the legacy
  // /locations/:slug pages keep pointing at their own canonical path.
  const cityPath = canonicalPathProp ?? `/locations/${slug}`;

  const { data: listings = [], isLoading, isError } = trpc.listings.list.useQuery();

  const cityListings = useMemo(() => listings.filter((item) => matchListingCity(item.city, city)), [listings, city]);
  const carCount = cityListings.filter((item) => isCarCategory(item.category)).length;
  const propertyCount = cityListings.length - carCount;

  const listingTitle = `${cityListings.length} ${isArabic ? "إعلان متاح" : language === "fr" ? "annonce(s) disponible(s)" : "available listing(s)"}`;

  const title = isArabic
    ? `كراء السيارات والعقارات في ${city}`
    : language === "fr"
      ? `Location de voitures et immobilier à ${cityNameFr}`
      : `Rent cars and properties in ${cityNameFr}`;

  const description = isArabic
    ? `اكتشف سيارات وعقارات للكراء في ${city} مع ALTUSplace: وكالات محلية، أسعار واضحة، وحجز سهل عبر الإنترنت.`
    : language === "fr"
      ? `Trouvez des voitures et des biens à louer à ${cityNameFr} sur ALTUSplace : agences locales, prix transparents et réservation en ligne.`
      : `Find rental cars and properties in ${cityNameFr} with ALTUSplace: local agencies, clear pricing and easy online booking.`;

  const isEmptyCity = !isLoading && !isError && cityListings.length === 0;

  useSEO({
    title,
    description,
    path: cityPath,
    canonicalPath: cityPath,
    language,
    robots: isEmptyCity ? "noindex, follow" : "index, follow, max-image-preview:large",
  });

  useEffect(() => {
    renderJsonLd("locations-breadcrumb-jsonld", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ALTUSplace", item: `${BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: cityNameFr, item: `${BASE_URL}${cityPath}` },
      ],
    });
  }, [cityNameFr, cityPath]);

  useEffect(() => {
    if (cityListings.length === 0) return;
    renderJsonLd("locations-listing-jsonld", {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: title,
      itemListElement: cityListings.slice(0, 20).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.title,
        url: `${BASE_URL}${isCarCategory(item.category) ? "/car/" : "/property/"}${item.id}`,
      })),
    });
  }, [cityListings, title]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-3xl bg-[#1C1C1E] p-8 text-white shadow-xl md:p-12">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-amber-300"><MapPin className="h-5 w-5" /><span>ALTUSplace Morocco</span><span className="text-white/60">·</span><span>{isArabic ? city : cityNameFr}</span></div>
          <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-5xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-200">{description}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={`/search?city=${encodeURIComponent(slug)}`} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-bold text-slate-950 hover:bg-amber-400">{isArabic ? "شاهد كل العروض" : language === "fr" ? "Voir toutes les offres" : "View all offers"}<ArrowRight className="h-4 w-4" /></Link>
            {cityListings.length > 0 && <span className="rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-amber-200">{listingTitle}</span>}
          </div>
        </section>

        <FeatureCards isArabic={isArabic} language={language} />

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-black">{isArabic ? "عروض نشطة" : language === "fr" ? "Offres actives" : "Active listings"}</h2>
            {carCount > 0 && propertyCount > 0 && (
              <span className="text-sm text-muted-foreground">{isArabic ? `${carCount} سيارات · ${propertyCount} عقارات` : language === "fr" ? `${carCount} voitures · ${propertyCount} biens immobiliers` : `${carCount} cars · ${propertyCount} properties`}</span>
            )}
          </div>

          {isLoading ? (
            <div className="rounded-2xl bg-white p-10 text-center text-sm text-muted-foreground">{isArabic ? "جاري تحميل العروض..." : "Chargement des offres…"}</div>
          ) : isError ? (
            <div className="rounded-2xl bg-white p-10 text-center text-sm text-rose-600">{isArabic ? "تعذر تحميل العروض." : "Impossible de charger les offres."}</div>
          ) : cityListings.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {cityListings.map((item) => (
                <ListingCard
                  key={item.id}
                  id={String(item.id)}
                  title={item.title}
                  city={city}
                  pricePerDay={item.pricePerDay}
                  unitLabel={isCarCategory(item.category) ? "درهم / يوم" : "درهم / شهر"}
                  images={item.imageUrl ? [item.imageUrl] : []}
                  type={isCarCategory(item.category) ? "car" : "property"}
                  hostName={item.ownerName || undefined}
                  specs={{
                    transmission: item.transmission || undefined,
                    fuel: item.fuelType || undefined,
                    rooms: item.rooms ?? 0,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
              <MapPin className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-muted-foreground">{isArabic ? "لا توجد عروض نشطة في هذه المدينة بعد — تصفح مناطق أخرى أو تواصل مع وكالاة محلية." : language === "fr" ? "Aucune offre active dans cette ville pour le moment — explorez d'autres régions ou contactez une agence locale." : "No active listings in this city yet — explore other regions or reach out to a local agency."}</p>
              <Link href="/locations" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1C1C1E] px-5 py-3 text-sm font-bold text-white hover:opacity-90">{isArabic ? "تصفح كل المدن" : language === "fr" ? "Explorer toutes les villes" : "Browse all cities"}<ArrowRight className="h-4 w-4" /></Link>
            </div>
          )}
        </section>

        <nav className="flex flex-wrap gap-3 text-sm"><Link href="/locations" className="text-[#1C1C1E] underline">{isArabic ? "كل مدن المغرب" : "Toutes les villes du Maroc"}</Link><Link href="/locations/marrakech-car-rental" className="text-[#1C1C1E] underline">Marrakech</Link><Link href="/locations/mohammed-v-airport-car-rental" className="text-[#1C1C1E] underline">Mohammed V Airport</Link><Link href="/search" className="text-[#1C1C1E] underline">{isArabic ? "كل العروض" : language === "fr" ? "Toutes les offres" : "All listings"}</Link></nav>
      </div>
    </div>
  );
}

function LocationsHub({ knownSlugSeen }: { knownSlugSeen?: boolean }) {
  const { language } = useLanguage();
  const isArabic = language === "ar";

  useSEO({
    title: isArabic ? "مدن المغرب" : language === "fr" ? "Villes du Maroc" : "Cities in Morocco",
    description: isArabic
      ? "تصفح العروض حسب المدينة في جميع أنحاء المغرب: من الدار البيضاء والرباط إلى أغادير والداخلة."
      : language === "fr"
        ? "Parcourez les offres par ville dans tout le Maroc : de Casablanca et Rabat à Agadir et Dakhla."
        : "Browse listings by city across Morocco: from Casablanca and Rabat to Agadir and Dakhla.",
    path: "/locations",
    language,
  });

  useEffect(() => {
    renderJsonLd("locations-breadcrumb-jsonld", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ALTUSplace", item: `${BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Locations", item: `${BASE_URL}/locations` },
      ],
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-3xl bg-[#1C1C1E] p-8 text-white shadow-xl md:p-12">
          <div className="mb-4 flex items-center gap-2 text-amber-300"><MapPin className="h-5 w-5" /><span>ALTUSplace Morocco</span></div>
          <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-5xl">{isArabic ? "مدن المغرب: سيارات وعقارات للكراء" : language === "fr" ? "Villes du Maroc : voitures et immobilier à louer" : "Moroccan cities: cars and properties for rent"}</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-200">{isArabic ? "اختر مدينة لعرض الإعلانات النشطة على ALTUSplace. تغطي المنصة جميع جهات المغرب الاثنتي عشرة." : language === "fr" ? "Choisissez une ville pour voir les annonces actives sur ALTUSplace. La plateforme couvre les douze régions du Maroc." : "Choose a city to view active listings on ALTUSplace. The platform covers all twelve regions of Morocco."}</p>
          {knownSlugSeen && <p className="mt-4 text-sm text-slate-400">{isArabic ? "لم نتعرف على هذه المدينة — إليك قائمة كاملة بالوجهات." : language === "fr" ? "Cette ville n'est pas reconnue — voici la liste complète des destinations." : "We could not identify this city — here is the full list of destinations."}</p>}
        </section>

        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {MOROCCO_REGIONS.map((region) => (
            <div key={region.name} className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="flex items-center gap-2 font-black">{isArabic ? region.name : region.nameFr}</h2>
              <ul className="mt-4 space-y-2">
                {region.cities.map((city) => (
                  <li key={city}>
                    <Link href={`/locations/${slugForCity(city)}`} className="flex items-center gap-2 text-sm font-medium text-[#1C1C1E] hover:text-amber-600">
                      <MapPin className="h-3.5 w-3.5 text-slate-300" />{isArabic ? city : cityLabelFr(city)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <nav className="flex flex-wrap gap-3 text-sm"><Link href="/locations/marrakech-car-rental" className="text-[#1C1C1E] underline">Marrakech</Link><Link href="/locations/mohammed-v-airport-car-rental" className="text-[#1C1C1E] underline">Mohammed V Airport</Link><Link href="/search" className="text-[#1C1C1E] underline">{isArabic ? "كل العروض" : language === "fr" ? "Toutes les offres" : "All listings"}</Link></nav>
      </div>
    </div>
  );
}

export default function LocationLanding({
  location,
  slug: slugProp,
  canonicalPath,
}: {
  location?: LocationKey;
  slug?: string;
  canonicalPath?: string;
}) {
  const [, params] = useRoute("/locations/:slug");
  const slug = slugProp ?? params?.slug;

  if (location) return <BespokeLocationPage location={location} />;

  const city = slug ? cityFromSlug(slug) : null;
  if (!city) return <LocationsHub knownSlugSeen={Boolean(slug)} />;
  return <CityLocationPage city={city} canonicalPath={canonicalPath} />;
}
