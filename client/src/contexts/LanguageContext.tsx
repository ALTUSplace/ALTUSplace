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
    searchCityOdgency: "المدينة أو الوكالة",
    cityAgadir: "تأجير في أكادير",
    cityMarrakech: "تأجير في مراكش",
    cityCasablancaFooter: "تأجير في الدار البيضاء",
    cityTangier: "تأجير في طنجة",
    cityRabat: "تأجير في الرباط",
    footerNoticeText: "جميع الحقوق محفوظة للمنصة",
    footerAddress: "المغرب",
    // مفاتيح الـ Hero والبحث المفقودة:
    heroBadge: "المنصة الأولى للتأجير بالمغرب",
    heroTitlePrefix: "اكتشف أفضل عروض",
    heroTitleCars: "السيارات",
    heroTitleProperties: "والعقارات",
    heroDescription: "قارن وحجز بسهولة تامة وبأفضل الأسعار عبر مختلف المدن المغربية.",
    heroReviewButton: "تقييمات العملاء",
    searchTabProperties: "العقارات",
    searchTabCars: "السيارات",
    searchDropoffDate: "تاريخ الاسترجاع",
    searchPickupDate: "تاريخ الاستلام",
    searchSubmitAdvanced: "بحث متقدم",
  },
  fr: {
    searchCityOdgency: "Ville ou agence",
    cityAgadir: "Louer à Agadir",
    cityMarrakech: "Louer à Marrakech",
    cityCasablancaFooter: "Louer à Casablanca",
    cityTangier: "Louer à Tanger",
    cityRabat: "Louer à Rabat",
    footerNoticeText: "Tous droits réservés",
    footerAddress: "Maroc",
    heroBadge: "La première plateforme de location au Maroc",
    heroTitlePrefix: "Découvrez les meilleures offres de",
    heroTitleCars: "Voitures",
    heroTitleProperties: "et Immobiliers",
    heroDescription: "Comparez et réservez facilement aux meilleurs prix dans toutes les villes marocaines.",
    heroReviewButton: "Avis clients",
    searchTabProperties: "Immobilier",
    searchTabCars: "Voitures",
    searchDropoffDate: "Date de retour",
    searchPickupDate: "Date de départ",
    searchSubmitAdvanced: "Recherche avancée",
  },
  en: {
    searchCityOdgency: "City or Agency",
    cityAgadir: "Rent in Agadir",
    cityMarrakech: "Rent in Marrakech",
    cityCasablancaFooter: "Rent in Casablanca",
    cityTangier: "Rent in Tanger",
    cityRabat: "Rent in Rabat",
    footerNoticeText: "All rights reserved",
    footerAddress: "Morocco",
    heroBadge: "The leading rental platform in Morocco",
    heroTitlePrefix: "Discover the best offers for",
    heroTitleCars: "Cars",
    heroTitleProperties: "and Properties",
    heroDescription: "Compare and book easily at the best prices across various Moroccan cities.",
    heroReviewButton: "Customer Reviews",
    searchTabProperties: "Properties",
    searchTabCars: "Cars",
    searchDropoffDate: "Drop-off Date",
    searchPickupDate: "Pick-up Date",
    searchSubmitAdvanced: "Advanced Search",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ar");

  useEffect(() => {
    const brand = readBrandPreference() as Record<string, any>;
    if (brand && brand.defaultLanguage && ["ar", "fr", "en"].includes(brand.defaultLanguage)) {
      setLanguageState(brand.defaultLanguage as Language);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    const brand = (readBrandPreference() as Record<string, any>) || {};
    writeBrandPreference({ ...brand, defaultLanguage: lang } as any);
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