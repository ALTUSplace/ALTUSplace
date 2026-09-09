import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-slate-900 text-slate-300 pt-12 pb-8 border-t border-slate-800">
      <div className="container mx-auto px-4">
        <div className="mb-12 grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="mb-4 border-l-2 border-blue-600 pl-3 text-base font-bold text-white">
              {t("searchCityOdgency")}
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link to="/search?city=%D8%A3%D9%83%D8%A7%D8%AF%D9%8A%D8%B1" className="flex items-center gap-2 hover:text-white">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span>{t("cityAgadir")}</span>
                </Link>
              </li>
              <li>
                <Link to="/search?city=%D9%85%D8%B1%D8%A7%D9%83%D8%B4" className="flex items-center gap-2 hover:text-white">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span>{t("cityMarrakech")}</span>
                </Link>
              </li>
              <li>
                <Link to="/search?city=%D8%A7%D9%84%D8%AF%D8%A7%D8%B1%D8%A%20%D8%A7%D9%84%D8%A8%D9%8A%D8%B6%D8%A7%D8%A1" className="flex items-center gap-2 hover:text-white">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span>{t("cityCasablancaFooter")}</span>
                </Link>
              </li>
              <li>
                <Link to="/search?city=%D8%B7%D9%86%D8%AC%D8%A9" className="flex items-center gap-2 hover:text-white">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span>{t("cityTangier")}</span>
                </Link>
              </li>
              <li>
                <Link to="/search?city=%D8%A7%D9%84%D8%B1%D8%A8%D8%A7%D8%B7" className="flex items-center gap-2 hover:text-white">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span>{t("cityRabat")}</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-6 text-center text-xs text-slate-500">
          <p>{t("footerNoticeText")}</p>
          <p className="mt-1">{t("footerAddress")}</p>
        </div>
      </div>
    </footer>
  );
}