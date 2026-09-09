import { Link } from "wouter";
import { ArrowRight, Car, MapPin, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const locations = {
  marrakech: {
    ar: { title: "كراء السيارات في مراكش", description: "اكتشف سيارات موثوقة للكراء في مراكش، قرب المدينة القديمة، كليز والمطار.", city: "مراكش" },
    fr: { title: "Location de voitures à Marrakech", description: "Trouvez une voiture fiable à Marrakech, près de la médina, Guéliz et de l'aéroport.", city: "Marrakech" },
    en: { title: "Car rental in Marrakech", description: "Find reliable cars for rent in Marrakech, near the medina, Gueliz and the airport.", city: "Marrakech" },
  },
  casablancaAirport: {
    ar: { title: "كراء السيارات في مطار محمد الخامس", description: "احجز سيارة عند الوصول إلى مطار محمد الخامس واستلمها بسهولة من شركاء ALTUSplace.", city: "الدار البيضاء" },
    fr: { title: "Location de voitures à l'aéroport Mohammed V", description: "Réservez votre voiture à l'arrivée à l'aéroport Mohammed V auprès des partenaires ALTUSplace.", city: "Casablanca" },
    en: { title: "Car rental at Mohammed V Airport", description: "Book a car on arrival at Mohammed V Airport with trusted ALTUSplace partners.", city: "Casablanca" },
  },
} as const;

type LocationKey = keyof typeof locations;

export default function LocationLanding({ location = "marrakech" }: { location?: LocationKey }) {
  const { language } = useLanguage();
  const content = locations[location][language] ?? locations[location].fr;
  const isArabic = language === "ar";
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-3xl bg-[#0B0F19] p-8 text-white shadow-xl md:p-12">
          <div className="mb-4 flex items-center gap-2 text-amber-300"><MapPin className="h-5 w-5" /><span>ALTUSplace Morocco</span></div>
          <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-5xl">{content.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-200">{content.description}</p>
          <Link href={`/search?city=${encodeURIComponent(content.city)}`} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-bold text-slate-950 hover:bg-amber-400"><Car className="h-5 w-5" />{isArabic ? "شاهد السيارات المتاحة" : language === "fr" ? "Voir les voitures disponibles" : "View available cars"}<ArrowRight className="h-4 w-4" /></Link>
        </section>
        <section className="grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 shadow-sm"><ShieldCheck className="mb-3 h-6 w-6 text-emerald-600" /><h2 className="font-bold">{isArabic ? "شركاء محليون" : language === "fr" ? "Partenaires locaux" : "Local partners"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{isArabic ? "عروض من وكالات وشركاء داخل المغرب." : language === "fr" ? "Des offres proposées par des partenaires au Maroc." : "Offers from local Moroccan partners."}</p></div>
          <div className="rounded-2xl bg-white p-6 shadow-sm"><MapPin className="mb-3 h-6 w-6 text-amber-600" /><h2 className="font-bold">{isArabic ? "مواقع مرنة" : language === "fr" ? "Points flexibles" : "Flexible locations"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{isArabic ? "اختر المدينة أو المطار المناسب لرحلتك." : language === "fr" ? "Choisissez la ville ou l'aéroport adapté à votre voyage." : "Choose the city or airport that fits your trip."}</p></div>
          <div className="rounded-2xl bg-white p-6 shadow-sm"><Car className="mb-3 h-6 w-6 text-blue-700" /><h2 className="font-bold">{isArabic ? "بحث سريع" : language === "fr" ? "Recherche rapide" : "Fast search"}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{isArabic ? "قارن السيارات والأسعار قبل التواصل مع الشريك." : language === "fr" ? "Comparez les véhicules et les prix avant de contacter le partenaire." : "Compare cars and prices before contacting the partner."}</p></div>
        </section>
        <nav className="flex flex-wrap gap-3 text-sm"><Link href="/locations/marrakech-car-rental" className="text-[#0B0F19] underline">Marrakech</Link><Link href="/locations/mohammed-v-airport-car-rental" className="text-[#0B0F19] underline">Mohammed V Airport</Link><Link href="/search" className="text-[#0B0F19] underline">{isArabic ? "كل العروض" : language === "fr" ? "Toutes les offres" : "All listings"}</Link></nav>
      </div>
    </div>
  );
}
