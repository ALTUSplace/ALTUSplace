import { CalendarDays, Home, Search, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

const navItems = [
  { labelKey: "home", path: "/", icon: Home },
  { labelKey: "search", path: "/search", icon: Search },
  { labelKey: "myBookings", path: "/my-bookings", icon: CalendarDays },
  { labelKey: "profile", path: "/profile", icon: UserRound },
];

export default function BottomNavigationBar() {
  const [location, setLocation] = useLocation();
  const { t } = useLanguage();
  const currentPath = location.split("?")[0];

  return (
    <nav className="mobile-bottom-nav md:hidden" aria-label={t("search")} dir="rtl">
      <div className="mobile-bottom-nav__inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.path === "/" ? currentPath === "/" : currentPath === item.path || currentPath.startsWith(`${item.path}/`);
          const label = t(item.labelKey);

          return (
            <button
              key={item.path}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => setLocation(item.path)}
              className={`mobile-bottom-nav__item ${isActive ? "is-active" : ""}`}
            >
              <span className="mobile-bottom-nav__icon" aria-hidden="true">
                <Icon className="h-[19px] w-[19px]" strokeWidth={isActive ? 2.5 : 1.9} />
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
