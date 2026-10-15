import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "wouter";
import { MapPin, ShieldCheck } from "lucide-react";
import { cityLabelFr } from "@/data/moroccoCities";
import { BrandMark } from "@/components/BrandMark";
import { BRAND_NAME } from "@/config/brand";

export default function Footer() {
  const { t, language } = useLanguage();

  return (
    <footer className="bg-bg-page dark:bg-bg-base pt-14 pb-8 border-t border-border-subtle text-ink-secondary">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="flex items-center gap-3">
              <img
                src="/assets/images/logo.png"
                alt={BRAND_NAME}
                className="brand-logo h-11 w-auto object-contain"
                loading="lazy"
              />
              <BrandMark withTagline />
            </div>
            <p className="mt-5 max-w-xs text-xs leading-relaxed text-ink-secondary">
              {t("heroDescription")}
            </p>
            <p className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-ink-primary">
              <ShieldCheck className="h-4 w-4 text-accent-clay" />
              {t("trustTitle1")}
            </p>
          </div>

          <div className="md:col-span-7">
            <h3 className="mb-5 border-s-2 border-accent-clay ps-3 text-sm font-bold text-ink-primary">
              {t("searchCityOdgency")}
            </h3>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
                { href: "/search?city=agadir", label: t("cityAgadir") },
                { href: "/search?city=marrakech", label: t("cityMarrakech") },
                { href: "/search?city=casablanca", label: t("cityCasablancaFooter") },
                { href: "/search?city=tangier", label: t("cityTangier") },
                { href: "/search?city=rabat", label: t("cityRabat") },
                { href: "/search?city=fez", label: language === "fr" ? cityLabelFr("فاس") : "فاس" },
                { href: "/search?city=meknes", label: language === "fr" ? cityLabelFr("مكناس") : "مكناس" },
                { href: "/search?city=oujda", label: language === "fr" ? cityLabelFr("وجدة") : "وجدة" },
                { href: "/search?city=kenitra", label: language === "fr" ? cityLabelFr("القنيطرة") : "القنيطرة" },
                { href: "/search?city=laayoune", label: language === "fr" ? cityLabelFr("العيون") : "العيون" },
                { href: "/search", label: t("viewAllListings") },
              ].map((item) => (
                <li key={item.href + item.label}>
                  <Link
                    href={item.href}
                    className="group flex items-center gap-2 text-xs font-semibold text-ink-secondary transition-colors hover:text-accent-clay"
                  >
                    <span className="grid h-7 w-7 place-items-center corner-cut-sm bg-bg-muted text-accent-clay transition-colors group-hover:bg-accent-clay group-hover:text-[var(--primary-ink)]">
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                    <span className="link-underline">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border-subtle pt-6 flex flex-col items-center gap-3 text-center text-xs text-ink-tertiary">
          <p>{t("footerNoticeText")}</p>
          <p>{t("footerAddress")}</p>
          <nav className="flex flex-wrap items-center justify-center gap-5 pt-1" aria-label="Host">
            <Link href="/add-car" className="text-ink-secondary hover:text-accent-clay transition-colors font-semibold">{t("addCar")}</Link>
            <Link href="/partner" className="text-ink-secondary hover:text-accent-clay transition-colors font-semibold">{t("partnerPortal")}</Link>
          </nav>
          <nav className="flex flex-wrap items-center justify-center gap-5 pt-1" aria-label="Legal">
            <Link href="/conditions-utilisation" className="text-ink-secondary hover:text-accent-clay transition-colors font-semibold">{t("termsOfService")}</Link>
            <Link href="/politique-confidentialite" className="text-ink-secondary hover:text-accent-clay transition-colors font-semibold">{t("privacyPolicy")}</Link>
            <Link href="/mentions-legales" className="text-ink-secondary hover:text-accent-clay transition-colors font-semibold">{t("mentionsLegales")}</Link>
            <Link href="/refunds-cancellations" className="text-ink-secondary hover:text-accent-clay transition-colors font-semibold">{t("refundsCancellations")}</Link>
            <Link href="/about" className="text-ink-secondary hover:text-accent-clay transition-colors font-semibold">{language === "ar" ? "من نحن" : language === "fr" ? "À propos" : "About"}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
