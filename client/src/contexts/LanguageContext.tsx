import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { readBrandPreference, writeBrandPreference } from "@/config/brand";

export type Language = "ar" | "fr" | "en";

interface LanguageContextType {
  language: Language;
  direction: "rtl" | "ltr";
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  ar: {
    home: "الرئيسية",
    cars: "تأجير السيارات",
    properties: "العقارات",
    search: "البحث والعروض",
    admin: "لوحة الإدارة",
    dashboard: "لوحة الوكالة",
    addCar: "إضافة إعلان",
    myBookings: "حجوزاتي",
    favorites: "المفضلة",
    profile: "الملف الشخصي",
    help: "الدعم والمساعدة",
    about: "عن المنصة",
    blog: "المدونة",
    notifications: "الإشعارات",
    kyc: "التحقق من الهوية",
    heroTitlePrefix: "ابحث عن",
    heroTitleCars: "أفضل السيارات",
    heroTitleAnd: "و",
    heroTitleProperties: "العقارات",
    heroTitleSuffix: "بكل سهولة",
    heroDescription: "منصة موثوقة لحجز السيارات والعقارات في المغرب",
    heroReviewButton: "تقييمات العملاء",
    searchTabProperties: "العقارات",
    searchTabCars: "السيارات",
    searchDropoffDate: "تاريخ الرجوع",
    searchPickupDate: "تاريخ الانطلاق",
    cityCasablanca: "الدار البيضاء",
    searchSubmitAdvanced: "بحث متقدم",
    heroBadge: "منصة معتمدة",
    searchCityOdgency: "المدينة أو الوكالة",
    popularCarBrandsTitle: "ماركات السيارات الأكثر طلباً",
    propertyTypesTitle: "أنواع العقارات المتاحة",
    bentoBadge: "مميزات المنصة",
    bentoTitle: "اكتشف تجربة حجز متكاملة",
    bentoSubtitle: "نحن نقدم لك أفضل الحلول الرقمية لتسهيل تنقلاتك وإقامتك",
    bentoRealEstateTitle: "عقارات راقية وفاخرة",
    bentoRealEstateDescription: "استكشف مجموعة مختارة من الشقق والفيلات المصممة خصيصاً لراحتك",
    browsePropertiesAvailable: "تصفح العقارات المتاحة",
    viewAllListings: "عرض جميع الإعلانات",
    browseAllArticles: "تصفح جميع المقالات",
    faqBadge: "الأسئلة الشائعة",
    faqTitle: "كل ما تحتاج معرفته حول الخدمة",
    bookNow: "احجز الآن",
    madUnit: "درهم",
    propBusinessStudios: "ستوديو أعمال",
    propCornichePenthouses: "بنتهاوس الكورنيش",
    propModernApartments: "شقق عصرية",
    propLuxuryVillas: "فيلات فاخرة",
    propSecureResidences: "إقامات محروسة",
    blogDrivingTipsTag: "نصائح القيادة",
    blogCard3Title: "دليلك الشامل لاستئجار السيارات بأمان في المغرب",
    blogCard3Description: "تعرف على أهم الشروط والنصائح لتجنب أي رسوم خفية أثناء استئجار سيارتك.",
    blogPropInvestmentTag: "استثمار عقاري",
    blogCard2Title: "أفضل الأماكن للاستثمار العقاري والسياحي في الدار البيضاء ومراكش",
    blogCard2Description: "قراءة تحليلية لأبرز الفرص الواعدة في السوق العقاري المغربي لهذا الموسم.",
    readMore: "اقرأ المزيد",
  },
  fr: {
    home: "Accueil",
    cars: "Location de voitures",
    properties: "Immobilier",
    search: "Recherche et offres",
    admin: "Administration",
    dashboard: "Tableau de bord",
    addCar: "Ajouter une annonce",
    myBookings: "Mes réservations",
    favorites: "Favoris",
    profile: "Profil",
    help: "Aide et support",
    about: "À propos",
    blog: "Blog",
    notifications: "Notifications",
    kyc: "Vérification d'identité",
    heroTitlePrefix: "Trouvez les",
    heroTitleCars: "meilleures voitures",
    heroTitleAnd: "et",
    heroTitleProperties: "propriétés",
    heroTitleSuffix: "en toute simplicité",
    heroDescription: "Plateforme de confiance pour la location de voitures et d'immobilier au Maroc",
    heroReviewButton: "Avis clients",
    searchTabProperties: "Propriétés",
    searchTabCars: "Voitures",
    searchDropoffDate: "Date de retour",
    searchPickupDate: "Date de départ",
    cityCasablanca: "Casablanca",
    searchSubmitAdvanced: "Recherche avancée",
    heroBadge: "Plateforme certifiée",
    searchCityOdgency: "Ville ou agence",
    popularCarBrandsTitle: "Marques de voitures populaires",
    propertyTypesTitle: "Types de propriétés",
    bentoBadge: "Fonctionnalités",
    bentoTitle: "Découvrez une expérience de réservation complète",
    bentoSubtitle: "Nous vous offrons les meilleures solutions numériques pour vos déplacements et séjours",
    bentoRealEstateTitle: "Immobilier haut de gamme",
    bentoRealEstateDescription: "Explorez une sélection d'appartements et de villas conçus pour votre confort",
    browsePropertiesAvailable: "Parcourir les propriétés",
    viewAllListings: "Voir toutes les annonces",
    browseAllArticles: "Parcourir tous les articles",
    faqBadge: "FAQ",
    faqTitle: "Tout ce que vous devez savoir",
    bookNow: "Réserver",
    madUnit: "MAD",
    propBusinessStudios: "Studios d'affaires",
    propCornichePenthouses: "Penthouses Corniche",
    propModernApartments: "Appartements modernes",
    propLuxuryVillas: "Villas de luxe",
    propSecureResidences: "Résidences sécurisées",
    blogDrivingTipsTag: "Conseils de conduite",
    blogCard3Title: "Votre guide complet pour louer une voiture en toute sécurité au Maroc",
    blogCard3Description: "Découvrez les conditions et conseils clés pour éviter les frais cachés.",
    blogPropInvestmentTag: "Investissement",
    blogCard2Title: "Les meilleurs endroits pour investir dans l'immobilier à Casablanca et Marrakech",
    blogCard2Description: "Analyse des opportunités prometteuses sur le marché immobilier marocain.",
    readMore: "Lire la suite",
  },
  en: {
    home: "Home",
    cars: "Car Rental",
    properties: "Properties",
    search: "Search & Offers",
    admin: "Admin Dashboard",
    dashboard: "Agency Dashboard",
    addCar: "Add Listing",
    myBookings: "My Bookings",
    favorites: "Favorites",
    profile: "Profile",
    help: "Help & Support",
    about: "About Us",
    blog: "Blog",
    notifications: "Notifications",
    kyc: "Identity Verification",
    heroTitlePrefix: "Find the best",
    heroTitleCars: "cars",
    heroTitleAnd: "and",
    heroTitleProperties: "properties",
    heroTitleSuffix: "with ease",
    heroDescription: "Trusted platform for car rental and real estate in Morocco",
    heroReviewButton: "Customer Reviews",
    searchTabProperties: "Properties",
    searchTabCars: "Cars",
    searchDropoffDate: "Drop-off Date",
    searchPickupDate: "Pickup Date",
    cityCasablanca: "Casablanca",
    searchSubmitAdvanced: "Advanced Search",
    heroBadge: "Verified Platform",
    searchCityOdgency: "City or Agency",
    popularCarBrandsTitle: "Popular Car Brands",
    propertyTypesTitle: "Property Types",
    bentoBadge: "Platform Features",
    bentoTitle: "Discover a seamless booking experience",
    bentoSubtitle: "We provide the best digital solutions to ease your travel and stay",
    bentoRealEstateTitle: "Luxury Real Estate",
    bentoRealEstateDescription: "Explore a curated selection of apartments and villas designed for your comfort",
    browsePropertiesAvailable: "Browse Available Properties",
    viewAllListings: "View All Listings",
    browseAllArticles: "Browse All Articles",
    faqBadge: "FAQ",
    faqTitle: "Everything you need to know about our service",
    bookNow: "Book Now",
    madUnit: "MAD",
    propBusinessStudios: "Business Studios",
    propCornichePenthouses: "Corniche Penthouses",
    propModernApartments: "Modern Apartments",
    propLuxuryVillas: "Luxury Villas",
    propSecureResidences: "Secure Residences",
    blogDrivingTipsTag: "Driving Tips",
    blogCard3Title: "Your comprehensive guide to safe car rental in Morocco",
    blogCard3Description: "Learn about key terms and tips to avoid hidden fees during your rental.",
    blogPropInvestmentTag: "Real Estate",
    blogCard2Title: "Best places for real estate and tourism investment in Casablanca and Marrakech",
    blogCard2Description: "An analytical review of promising opportunities in the Moroccan real estate market.",
    readMore: "Read More",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ar");

  useEffect(() => {
    const brand = readBrandPreference();
    if (brand && ["ar", "fr", "en"].includes(brand.defaultLanguage)) {
      setLanguageState(brand.defaultLanguage as Language);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    const brand = readBrandPreference();
    writeBrandPreference({ ...brand, defaultLanguage: lang });
  };

  const direction = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
  }, [direction, language]);

  const t = (key: string): string => {
    return translations[language]?.[key] || translations["en"]?.[key] || key;
  };

  const value = useMemo(() => ({ language, direction, setLanguage, t }), [language, direction]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}