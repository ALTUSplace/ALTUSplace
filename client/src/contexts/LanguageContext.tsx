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