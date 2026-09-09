import { Link } from 'wouter';
import { Mail, MapPin, ShieldCheck, ChevronLeft } from 'lucide-react';
import { SUPPORT_EMAIL } from '@/config/brand';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Footer() {
  const { t, direction } = useLanguage();
  
  return (
    <footer
      className="relative overflow-hidden border-t border-[var(--brand-navy-deep)] bg-[var(--brand-navy-deep)] pb-12 pt-16 text-slate-200"
      dir={direction}
    >
      {/* Ambient amber glow */}
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[#D98236]/10 blur-3xl" />

      <div className="container mx-auto relative z-10 px-4">
        <div className="mb-12 grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="brand-logo-container rounded-2xl bg-[#efeade] p-2 shadow-lg ring-1 ring-white/15">
                <img
                  src="/assets/images/logo.png"
                  alt="ALTUSplace Logo"
                  loading="lazy"
                  className="brand-logo h-12 w-auto object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-xl text-white">
                  ALTUS<span className="font-normal text-[#D98236]">place</span>
                </span>
                <span className="-mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  {t("searchNow")}
                </span>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-300">
              {t("heroSubtitle")}
            </p>

            <div className="flex items-center gap-3 pt-2">
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-[#D98236] shadow-md">
                <ShieldCheck className="h-4 w-4 text-[#D98236]" />
                <span>{t("verified")}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-4 border-l-2 border-[#D98236] pl-3 text-base font-bold text-white">
              {t("search")}
            </h3>
            <ul className="space-y-3 text-sm">
              {[
                { href: '/', label: t("home") },
                { href: '/search?type=car', label: t("cars") },
                { href: '/search?type=property', label: t("properties") },
                { href: '/host', label: t("dashboard") },
                { href: '/add-car', label: t("addCar") },
                { href: '/support-tickets', label: t("help") },
              ].map((link, idx) => (
                <li key={idx}>
                  <Link
                    href={link.href}
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-2 text-slate-300 transition-all duration-300 hover:bg-slate-800/60 hover:text-[#D98236] cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4 text-[#D98236] opacity-70 transition-opacity group-hover:opacity-100" />
                    <span className="font-medium">{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Main cities */}
          <div>
            <h3 className="mb-4 border-l-2 border-[#D98236] pl-3 text-base font-bold text-white">
              المدن الرئيسية
            </h3>
            <ul className="space-y-3 text-sm">
              {[
                { city: 'أغادير', label: 'تأجير في أغادير' },
                { city: 'مراكش', label: 'تأجير في مراكش' },
                { city: 'الدار البيضاء', label: 'تأجير في الدار البيضاء' },
                { city: 'طنجة', label: 'تأجير في طنجة' },
                { city: 'الرباط', label: 'تأجير في الرباط' },
              ].map((item, idx) => (
                <li key={idx}>
                  <Link
                    href={`/search?city=${encodeURIComponent(item.city)}`}
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-2 text-slate-300 transition-all duration-300 hover:bg-slate-800/60 hover:text-[#D98236] cursor-pointer"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-[#D98236]" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-4 border-l-2 border-[#D98236] pl-3 text-base font-bold text-white">
              {t("help")}
            </h3>
            <ul className="space-y-4 text-sm">
              <li className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-[#D98236] shadow">
                  <Mail className="h-4 w-4" />
                </div>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-xs font-bold text-slate-200 transition-colors hover:text-amber-400 sm:text-sm"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-[#D98236] shadow">
                  <MapPin className="h-4 w-4" />
                </div>
                <span className="pt-2 text-xs leading-relaxed text-slate-300">
                  {t("footerAddress")}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mb-8 rounded-2xl border border-[#D98236]/30 bg-slate-800/70 p-5 text-xs leading-6 text-slate-300"
          role="note"
          aria-label={t("footerNoticeLabel")}
        >
          <h3 className="mb-2 font-black text-[#D98236]">{t("termsOfService")}</h3>
          <p>
            {t("footerNoticeText")}
          </p>
          <Link href="/register" className="mt-2 inline-flex font-bold text-[#D98236] hover:text-white">
            {t("readTermsAndAgree")}
          </Link>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 text-xs text-slate-400 md:flex-row">
          <p>© 2026 ALTUSplace. {t("allRights")}. {t("footerTagline")}</p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="py-1 transition-colors hover:text-[#D98236]">
              {t("terms")}
            </Link>
            <Link href="/privacy" className="py-1 transition-colors hover:text-[#D98236]">
              {t("privacy")}
            </Link>
            <Link href="/support-tickets" className="py-1 transition-colors hover:text-[#D98236]">
              {t("help")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
