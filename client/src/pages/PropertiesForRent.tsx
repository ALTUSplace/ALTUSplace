/**
 * `/properties/for-rent` — the hub page targeting the "شقق للكراء" head term.
 *
 * The homepage and the city landing pages both target the combined
 * "cars + properties" intent, so neither could own a property-type query.
 * This page exists to give that intent one canonical home, and to pass the
 * keyword up from the rest of the site via internal links.
 *
 * Heading structure is deliberate: exactly one <h1>, one <h2> per section, and
 * <h3> only on the listing cards.
 */
import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import { ArrowRight, Building2, MapPin, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { useFavorites } from "@/hooks/useFavorites";
import { ListingCard } from "@/components/ui/ListingCard";
import { renderJsonLd, useSEO, BASE_URL } from "@/lib/seo";
import { isPropertyCategory } from "@/lib/categories";
import { POPULAR_MOROCCO_CITIES, cityLabelFr, slugForCity } from "@/data/moroccoCities";

const PATH = "/properties/for-rent";

type Copy = {
  title: string;
  description: string;
  intro: string;
  citiesTitle: string;
  listingsTitle: string;
  typesTitle: string;
  emptyTitle: string;
  emptyBody: string;
  browseAll: string;
  cta: string;
  propertyTypes: string[];
};

/**
 * "شقق" is the query term; the page also has to cover the neighbouring intents
 * (villas, offices) without diluting the head term, so the supporting copy
 * stays in the body and the <h1> keeps the apartment query intact.
 */
const COPY: Record<string, Copy> = {
  ar: {
    title: "شقق للكراء في المغرب: أسعار واضحة وحجز آمن | ALTUSplace",
    description:
      "اكتشف شقق للكراء في المغرب: شقق مؤثثة وفلل ومكاتب للكراء الشهري في الدار البيضاء ومراكش وأغادير، مع وكالات محلية ودفع آمن عبر ALTUSplace.",
    intro:
      "قارن شقق للكراء في جميع مدن المغرب من منصة واحدة. كل إعلان يعرض السعر الشهري والمساحة وعدد الغرف والصور، والحجز يتم عبر دفع آمن بضمان المنصة.",
    citiesTitle: "شقق للكراء حسب المدينة",
    listingsTitle: "أحدث الشقق للعقد",
    typesTitle: "أنواع العقارات المتوفرة للكراء",
    emptyTitle: "لا توجد شقق متاحة حالياً",
    emptyBody: "لا يوجد أي عقار منشور في هذه الفئة حالياً. تصفح المدن أو تواصل معنا وسنعلمك فور توفر العرض.",
    browseAll: "تصفح كل العروض",
    cta: "شاهد كل العقارات",
    propertyTypes: ["شقق للكراء", "شقق مؤثثة", "فلل للكراء", "مكاتب للكراء", "استوديوهات للكراء"],
  },
  fr: {
    title: "Appartements à louer au Maroc : prix clairs et réservation sûre | ALTUSplace",
    description:
      "Trouvez des appartements à louer au Maroc : appartements meublés, villas et bureaux à louer au Casablanca, Marrakech et Agadir, avec réservation sécurisée via ALTUSplace.",
    intro:
      "Comparez les appartements à louer dans toutes les villes du Maroc depuis une seule plateforme. Chaque annonce affiche le prix mensuel, la surface et le nombre de chambres.",
    citiesTitle: "Appartements à louer par ville",
    listingsTitle: "Derniers appartements disponibles",
    typesTitle: "Types de biens disponibles à la location",
    emptyTitle: "Aucun appartement disponible",
    emptyBody: "Aucun bien publié dans cette catégorie pour le moment. Parcourez les villes ou contactez-nous.",
    browseAll: "Voir toutes les offres",
    cta: "Voir tous les biens",
    propertyTypes: ["Appartements à louer", "Appartements meublés", "Villas à louer", "Bureaux à louer", "Studios"],
  },
  en: {
    title: "Apartments for rent in Morocco: clear pricing and safe booking | ALTUSplace",
    description:
      "Find apartments for rent in Morocco: furnished apartments, villas and offices for rent in Casablanca, Marrakech and Agadir, with safe booking through ALTUSplace.",
    intro:
      "Compare apartments for rent across every Moroccan city on one platform. Each listing shows the monthly price, floor area and room count, and booking runs through safe platform-guarded payment.",
    citiesTitle: "Apartments for rent by city",
    listingsTitle: "Latest apartments available",
    typesTitle: "Property types available to rent",
    emptyTitle: "No apartments available yet",
    emptyBody: "No published properties in this category right now. Browse the cities or get in touch.",
    browseAll: "Browse all listings",
    cta: "View all properties",
    propertyTypes: ["Apartments for rent", "Furnished apartments", "Villas for rent", "Offices for rent", "Studios"],
  },
};

export default function PropertiesForRent() {
  const { language } = useLanguage();
  const favorites = useFavorites();
  const copy = COPY[language] ?? COPY.ar;
  const isArabic = language === "ar";

  const { data: allListings = [], isLoading, isError } = trpc.listings.list.useQuery();

  // isPropertyCategory (not !isCarCategory) so an unrecognized category is
  // treated as a stay rather than silently leaking cars onto this hub.
  const properties = useMemo(
    () => allListings.filter((item) => isPropertyCategory(item.category)),
    [allListings],
  );

  const byCity = useMemo(() => {
    const groups = new Map<string, typeof properties>();
    for (const item of properties) {
      const key = item.city || "";
      if (!key) continue;
      const bucket = groups.get(key);
      if (bucket) bucket.push(item);
      else groups.set(key, [item]);
    }
    // Largest inventory first: those cities carry the most internal links into
    // the detail pages, which is what the hub exists to distribute.
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [properties]);

  useSEO({
    title: copy.title,
    description: copy.description,
    path: PATH,
    language,
  });

  useEffect(() => {
    renderJsonLd("properties-hub-breadcrumb-jsonld", {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "ALTUSplace", item: `${BASE_URL}/` },
        { "@type": "ListItem", position: 2, name: isArabic ? "شقق للكراء" : "Properties", item: `${BASE_URL}${PATH}` },
      ],
    });
  }, [isArabic]);

  useEffect(() => {
    if (properties.length === 0) return;
    renderJsonLd("properties-hub-itemlist-jsonld", {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: copy.listingsTitle,
      numberOfItems: properties.length,
      itemListElement: properties.slice(0, 20).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.title,
        url: `${BASE_URL}/property/${item.id}`,
      })),
    });
  }, [properties, copy.listingsTitle]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-3xl bg-[#1C1C1E] p-8 text-white shadow-xl md:p-12">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-amber-300">
            <Building2 className="h-5 w-5" aria-hidden="true" />
            <span>ALTUSplace Morocco</span>
          </div>
          <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-5xl">
            {isArabic ? "شقق للكراء في المغرب" : language === "fr" ? "Appartements à louer au Maroc" : "Apartments for rent in Morocco"}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-200">{copy.intro}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/search?type=property"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-bold text-slate-950 hover:bg-amber-400"
            >
              {copy.cta}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            {properties.length > 0 && (
              <span className="rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-amber-200">
                {properties.length} {isArabic ? "عقار متاح" : language === "fr" ? "biens disponibles" : "available properties"}
              </span>
            )}
          </div>
        </section>

        <section aria-labelledby="property-types">
          <h2 id="property-types" className="text-xl font-black text-ink-primary md:text-2xl">
            {copy.typesTitle}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {copy.propertyTypes.map((type) => (
              <li key={type}>
                <Link
                  href="/search?type=property"
                  className="inline-block rounded-full border border-border-default bg-bg-surface px-4 py-2 text-sm font-semibold text-ink-primary transition-colors hover:border-accent-clay hover:text-accent-clay"
                >
                  {type}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="properties-by-city">
          <h2 id="properties-by-city" className="text-xl font-black text-ink-primary md:text-2xl">
            {copy.citiesTitle}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-3 text-sm">
            {POPULAR_MOROCCO_CITIES.map((city) => {
              const slug = slugForCity(city);
              return (
                <li key={city}>
                  <Link
                    href={`/search?type=property&city=${encodeURIComponent(city)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-surface px-3 py-2 font-semibold text-ink-primary transition-colors hover:border-accent-clay hover:text-accent-clay"
                  >
                    <MapPin className="h-3.5 w-3.5 text-accent-clay" aria-hidden="true" />
                    <span dir={isArabic ? "rtl" : "ltr"}>
                      {isArabic ? city : cityLabelFr(city)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="latest-properties">
          <h2 id="latest-properties" className="text-xl font-black text-ink-primary md:text-2xl">
            {copy.listingsTitle}
          </h2>

          {isLoading ? (
            <p className="mt-4 rounded-2xl bg-white p-10 text-center text-sm text-muted-foreground">
              {isArabic ? "جاري تحميل العقارات..." : language === "fr" ? "Chargement des biens…" : "Loading properties…"}
            </p>
          ) : isError ? (
            <p className="mt-4 rounded-2xl bg-white p-10 text-center text-sm text-rose-600">
              {isArabic ? "تعذر تحميل العقارات." : language === "fr" ? "Impossible de charger les biens." : "Could not load properties."}
            </p>
          ) : properties.length > 0 ? (
            <>
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {properties.slice(0, 12).map((item) => (
                  <ListingCard
                    key={item.id}
                    id={String(item.id)}
                    title={item.title}
                    city={item.city}
                    pricePerDay={item.pricePerDay}
                    unitLabel={isArabic ? "درهم / شهر" : language === "fr" ? "MAD / mois" : "MAD / month"}
                    images={item.images?.length ? item.images : item.imageUrl ? [item.imageUrl] : []}
                    type="property"
                    isFavorite={favorites.isFavorite(item.id)}
                    onToggleFavorite={() => favorites.toggleFavorite(item.id)}
                    specs={{
                      rooms: item.rooms ?? 0,
                      ...(item.area ? { area: `${item.area} m²` } : {}),
                    }}
                  />
                ))}
              </div>

              {byCity.length > 0 && (
                <div className="mt-8 rounded-2xl border border-border-default bg-bg-surface p-6">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
                    <ShieldCheck className="h-4 w-4 text-accent-clay" aria-hidden="true" />
                    <span>
                      {isArabic
                        ? `${properties.length} عقار منشور في ${byCity.length} مدينة.`
                        : language === "fr"
                          ? `${properties.length} biens publiés dans ${byCity.length} villes.`
                          : `${properties.length} properties listed across ${byCity.length} cities.`}
                    </span>
                  </div>
                  <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    {byCity.slice(0, 12).map(([city, items]) => (
                      <li key={city}>
                        <Link
                          href={`/search?type=property&city=${encodeURIComponent(city)}`}
                          className="font-semibold text-ink-primary underline decoration-accent-clay/40 underline-offset-4 hover:text-accent-clay"
                        >
                          {isArabic ? city : cityLabelFr(city)} ({items.length})
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border-default bg-bg-surface p-10 text-center">
              <Building2 className="mx-auto mb-3 h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="font-bold text-ink-primary">{copy.emptyTitle}</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-ink-secondary">{copy.emptyBody}</p>
              <Link
                href="/search"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1C1C1E] px-5 py-3 text-sm font-bold text-white hover:opacity-90"
              >
                {copy.browseAll}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>

        <nav aria-label={isArabic ? "روابط العقارات" : "Property links"} className="flex flex-wrap gap-3 text-sm">
          <Link href="/locations" className="text-ink-primary underline">
            {isArabic ? "كل مدن المغرب" : language === "fr" ? "Toutes les villes du Maroc" : "All cities in Morocco"}
          </Link>
          <Link href="/search?type=car" className="text-ink-primary underline">
            {isArabic ? "كراء السيارات في المغرب" : language === "fr" ? "Location de voitures au Maroc" : "Car rental in Morocco"}
          </Link>
          <Link href="/search" className="text-ink-primary underline">
            {isArabic ? "كل العروض" : language === "fr" ? "Toutes les offres" : "All listings"}
          </Link>
        </nav>
      </div>
    </div>
  );
}
