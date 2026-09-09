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
    heroBadge: "المنصة الأولى للتأجير بالمغرب",
    heroTitlePrefix: "اكتشف أفضل عروض",
    heroTitleCars: "السيارات",
    heroTitleProperties: "والعقارات",
    heroTitleSuffix: "",
    heroDescription: "قارن وحجز بسهولة تامة وبأفضل الأسعار عبر مختلف المدن المغربية.",
    heroReviewButton: "تقييمات العملاء",
    searchTabProperties: "العقارات",
    searchTabCars: "السيارات",
    searchDropoffDate: "تاريخ الاسترجاع",
    searchPickupDate: "تاريخ الاستلام",
    searchSubmitAdvanced: "بحث متقدم",
    popularCarBrandsTitle: "أبرز العلامات التجارية للسيارات",
    propertyTypesTitle: "أنواع العقارات المطلوبة",
    bentoBadge: "تجربة متكاملة",
    bentoTitle: "احجز سيارتك أو عقارك بكل أمان",
    bentoSubtitle: "نحن نوفر لك أفضل الخيارات الموثوقة بالمغرب مع ضمان الجودة والسرعة.",
    bentoRealEstateTitle: "عقارات استثنائية للإقامة والاستثمار",
    bentoRealEstateDescription: "استكشف أرقى الفلل والشقق المجهزة بأفضل المواصفات.",
    browsePropertiesAvailable: "تصفح العقارات المتاحة",
    viewAllListings: "عرض كل الإعلانات",
    blogDrivingTipsTag: "نصائح القيادة",
    blogCard3Title: "أهم نصائح القيادة الآمنة في الطرق السيّارة المغربية",
    blogCard3Description: "دليلك الشامل لتجربة قيادة مريحة وخالية من المخاطر.",
    readMore: "اقرأ المزيد",
    blogPropInvestmentTag: "استثمار عقاري",
    blogCard2Title: "لماذا يُعد الاستثمار العقاري في مراكش الأفضل حالياً؟",
    blogCard2Description: "تحليل شامل لفرص العائد الاستثماري المرتفع.",
    browseAllArticles: "تصفح جميع المقالات",
    faqBadge: "الأسئلة الشائعة",
    faqTitle: "كل ما تحتاج معرفته قبل الحجز",
    faqSubtitle: "إجابات واضحة عن أبرز الاستفسارات المتعلقة بعملية الحجز والدفع.",
    trustTitle3: "دعم فني على مدار الساعة",
    trustDesc3: "فريق خدمة العملاء جاهز لمساعدتك طوال أيام الأسبوع.",
    trustTitle2: "أسعار شفافة بدون رسوم خفية",
    trustDesc2: "ندفعك لتدفع القيمة الحقيقية بكل وضوح وأمان.",
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
    heroTitleSuffix: "",
    heroDescription: "Comparez et réservez facilement aux meilleurs prix dans toutes les villes marocaines.",
    heroReviewButton: "Avis clients",
    searchTabProperties: "Immobilier",
    searchTabCars: "Voitures",
    searchDropoffDate: "Date de retour",
    searchPickupDate: "Date de départ",
    searchSubmitAdvanced: "Recherche avancée",
    popularCarBrandsTitle: "Marques de voitures populaires",
    propertyTypesTitle: "Types de propriétés",
    bentoBadge: "Expérience complète",
    bentoTitle: "Réservez votre voiture ou propriété en toute sécurité",
    bentoSubtitle: "Nous vous offrons les meilleures options fiables au Maroc.",
    bentoRealEstateTitle: "Propriétés exceptionnelles",
    bentoRealEstateDescription: "Découvrez les plus belles villas et appartements.",
    browsePropertiesAvailable: "Parcourir les propriétés",
    viewAllListings: "Voir toutes les annonces",
    blogDrivingTipsTag: "Conseils de conduite",
    blogCard3Title: "Conseils de conduite sécurisée au Maroc",
    blogCard3Description: "Votre guide complet pour une conduite sans risque.",
    readMore: "Lire la suite",
    blogPropInvestmentTag: "Investissement",
    blogCard2Title: "Pourquoi investir dans l'immobilier à Marrakech ?",
    blogCard2Description: "Analyse des opportunités de rendement.",
    browseAllArticles: "Tous les articles",
    faqBadge: "FAQ",
    faqTitle: "Questions Fréquentes",
    faqSubtitle: "Réponses claires à vos questions de réservation.",
    trustTitle3: "Support 24/7",
    trustDesc3: "Notre équipe est prête à vous aider.",
    trustTitle2: "Prix transparents",
    trustDesc2: "Aucun frais caché pour vos réservations.",
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
    heroTitleSuffix: "",
    heroDescription: "Compare and book easily at the best prices across various Moroccan cities.",
    heroReviewButton: "Customer Reviews",
    searchTabProperties: "Properties",
    searchTabCars: "Cars",
    searchDropoffDate: "Drop-off Date",
    searchPickupDate: "Pick-up Date",
    searchSubmitAdvanced: "Advanced Search",
    popularCarBrandsTitle: "Popular Car Brands",
    propertyTypesTitle: "Property Types",
    bentoBadge: "Complete Experience",
    bentoTitle: "Book your car or property securely",
    bentoSubtitle: "We provide the best reliable options in Morocco.",
    bentoRealEstateTitle: "Exceptional Properties",
    bentoRealEstateDescription: "Explore luxury villas and apartments.",
    browsePropertiesAvailable: "Browse Available Properties",
    viewAllListings: "View All Listings",
    blogDrivingTipsTag: "Driving Tips",
    blogCard3Title: "Safe driving tips on Moroccan highways",
    blogCard3Description: "Your ultimate guide for a smooth journey.",
    readMore: "Read More",
    blogPropInvestmentTag: "Real Estate",
    blogCard2Title: "Why real estate investment in Marrakech is top",
    blogCard2Description: "Comprehensive analysis of high ROI opportunities.",
    browseAllArticles: "Browse All Articles",
    faqBadge: "FAQ",
    faqTitle: "Frequently Asked Questions",
    faqSubtitle: "Clear answers to your booking questions.",
    trustTitle3: "24/7 Support",
    trustDesc3: "Our customer service team is ready to help.",
    trustTitle2: "Transparent Pricing",
    trustDesc2: "No hidden fees, pay true value.",
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