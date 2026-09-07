import { Link, useLocation } from "wouter";
import { ChevronLeft, Home } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const routeNames: Record<string, Record<string, string>> = {
  "/": {
    ar: "الرئيسية",
    fr: "Accueil",
    en: "Home"
  },
  "/search": {
    ar: "بحث الإعلانات",
    fr: "Recherche et offres",
    en: "Search & listings"
  },
  "/booking": {
    ar: "حجز موعد",
    fr: "Réservation",
    en: "Booking"
  },
  "/checkout": {
    ar: "إتمام الدفع",
    fr: "Paiement",
    en: "Checkout"
  },
  "/success": {
    ar: "تأكيد الحجز",
    fr: "Confirmation",
    en: "Confirmation"
  },
  "/dashboard": {
    ar: "لوحة المالك",
    fr: "Tableau de bord agence",
    en: "Agency dashboard"
  },
  "/admin": {
    ar: "لوحة المشرف العام",
    fr: "Administration",
    en: "Admin dashboard"
  },
  "/profile": {
    ar: "الملف الشخصي",
    fr: "Profil",
    en: "Profile"
  },
  "/renter-dashboard": {
    ar: "حجوزاتي وفواتيري",
    fr: "Mes réservations et factures",
    en: "My bookings and invoices"
  },
  "/add-car": {
    ar: "إضافة إعلان جديد",
    fr: "Ajouter une annonce",
    en: "Add listing"
  },
  "/my-bookings": {
    ar: "إدارة الحجوزات",
    fr: "Gérer les réservations",
    en: "Manage bookings"
  },
  "/help": {
    ar: "الدعم والمساعدة",
    fr: "Aide et support",
    en: "Help & support"
  },
  "/support-tickets": {
    ar: "تذاكر الدعم",
    fr: "Tickets de support",
    en: "Support tickets"
  },
  "/dispute-resolution": {
    ar: "حل النزاعات",
    fr: "Résolution des litiges",
    en: "Dispute resolution"
  },
  "/notifications": {
    ar: "الإشعارات",
    fr: "Notifications",
    en: "Notifications"
  },
  "/favorites": {
    ar: "المفضلة",
    fr: "Favoris",
    en: "Favorites"
  },
  "/privacy": {
    ar: "سياسة الخصوصية",
    fr: "Politique de confidentialité",
    en: "Privacy policy"
  },
  "/terms": {
    ar: "شروط الاستخدام",
    fr: "Conditions d'utilisation",
    en: "Terms of service"
  },
  "/host": {
    ar: "لوحة المالك",
    fr: "Tableau de bord propriétaire",
    en: "Host dashboard"
  },
  "/host-dashboard": {
    ar: "لوحة المالك",
    fr: "Tableau de bord propriétaire",
    en: "Host dashboard"
  },
  "/partner": {
    ar: "لوحة المالك",
    fr: "Tableau de partenaire",
    en: "Partner dashboard"
  },
  "/partner-dashboard": {
    ar: "لوحة المالك",
    fr: "Tableau de partenaire",
    en: "Partner dashboard"
  },
  "/blog": {
    ar: "المدونة",
    fr: "Blog",
    en: "Blog"
  },
  "/about": {
    ar: "من نحن",
    fr: "À propos",
    en: "About"
  },
};

function dynamicLabel(path: string, segment: string, language: string) {
  if (path.startsWith("/property/")) {
    return language === "ar" ? "تفاصيل العقار" : language === "fr" ? "Détails du bien" : "Property details";
  }
  if (path.startsWith("/car/")) {
    return language === "ar" ? "تفاصيل السيارة" : language === "fr" ? "Détails du véhicule" : "Car details";
  }
  if (/^\d+$/.test(segment)) {
    return language === "ar" ? `الإعلان رقم ${segment}` : language === "fr" ? `Annonce numéro ${segment}` : `Listing number ${segment}`;
  }
  if (segment.startsWith("car_")) {
    return language === "ar" ? "تفاصيل الإعلان" : language === "fr" ? "Détails de l'annonce" : "Listing details";
  }
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function BreadcrumbNav() {
  const [location] = useLocation();
  const { t, language } = useLanguage();
  if (location === "/") return null;

  const pathSegments = location.split("/").filter(Boolean);
  const items = [{ label: t("home"), path: "/" }];
  let currentPath = "";

  pathSegments.forEach((segment) => {
    currentPath += `/${segment}`;
    items.push({
      label: routeNames[currentPath]?.[language] || dynamicLabel(currentPath, segment, language),
      path: currentPath,
    });
  });

  return (
    <nav aria-label={t("search")} className="bg-muted/30 border-b border-border/50 py-2.5 px-4 md:px-8 mb-6" dir={language === "ar" ? "rtl" : "ltr"}>
      <ol className="flex items-center space-x-2 space-x-reverse text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.path} className="flex items-center space-x-2 space-x-reverse">
              {index > 0 && <ChevronLeft className="w-4 h-4 text-muted-foreground/60 mx-1" />}
              {isLast ? (
                <span className="font-semibold text-primary flex items-center gap-1">
                  {index === 0 && <Home className="w-3.5 h-3.5" />}
                  {item.label}
                </span>
              ) : (
                <Link href={item.path} className="hover:text-primary transition-colors flex items-center gap-1">
                  {index === 0 && <Home className="w-3.5 h-3.5" />}
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
