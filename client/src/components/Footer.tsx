import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";

export default function Footer() {
  const { t } = useLanguage();

  const cities = [
    { city: "أكادير", label: t("cityAgadir") },
    { city: "مراكش", label: t("cityMarrakech") },
    { city: "الدار البيضاء", label: t("cityCasablancaFooter") },
    { city: "طنجة", label: t("cityTangier") },
    { city: "الرباط", label: t("cityRabat") },
  ];

  return (
    <footer className="bg-slate-900 text-slate-300 pt-12 pb-8 border-t border-slate-800">
      <div className="container mx-auto relative z-10 px-4">
        <div className="mb-12 grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          
          {/* Main cities section */}
          <div>
            <h3 className="mb-4 border-l-2 border-[#2563EB] pl-3 text-base font-bold text-white">
              {t("searchCityOdgency")}
            </h3>
            <ul className="space-y-3 text-sm">
              {cities.map((item, idx) => (
                <li key={idx}>
                  <Link
                    to={`/search?city=${encodeURIComponent(item.city)}`}
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-2 text-slate-300 transition-all duration-200 hover:bg-slate-800 hover:text-white"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-[#2563EB]" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Footer bottom notice */}
        <div className="border-t border-slate-800 pt-6 text-center text-xs text-slate-500">
          <p>{t("footerNoticeText")}</p>
          <p className="mt-1">{t("footerAddress")}</p>
        </div>
      </div>
    </footer>
  );
}