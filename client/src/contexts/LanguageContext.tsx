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