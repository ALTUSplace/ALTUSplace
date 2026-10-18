import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { BRAND_NAME, readBrandPreference, writeBrandPreference } from "@/config/brand";
import {
  Bell,
  BookOpen,
  Building2,
  Car,
  Coins,
  Globe,
  HelpCircle,
  Handshake,
  LayoutDashboard,
  Menu,
  Moon,
  Settings,
  Shield,
  ShieldAlert,
  Sun,
  UserRound,
  X,
  BookmarkCheck,
  Heart,
  MessageSquare,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { Language, useLanguage } from "@/contexts/LanguageContext";
import { useCurrency, Currency } from "@/contexts/CurrencyContext";
import { NavbarCitySelect } from "@/components/NavbarCitySelect";
import { NavbarMobileCitySelect } from "@/components/NavbarMobileCitySelect";
import { RegionalHighlights } from "@/components/RegionalHighlights";
import { BrandMark } from "@/components/BrandMark";
const WhatsAppNotificationModal = lazy(() => import("./WhatsAppNotificationModal").then((module) => ({ default: module.WhatsAppNotificationModal })));
const TwoFactorAuthModal = lazy(() => import("./TwoFactorAuthModal").then((module) => ({ default: module.TwoFactorAuthModal })));
import { toast } from "sonner";

type NavLink = {
  href: string;
  label: string;
  labelKey?: string;
  icon?: typeof Car;
};

const navLinks: NavLink[] = [
  { href: "/", label: "الرئيسية", labelKey: "home" },
  { href: "/search?type=car", label: "تأجير السيارات", labelKey: "cars", icon: Car },
  { href: "/search?type=property", label: "العقارات", labelKey: "properties", icon: Building2 },
  { href: "/partner", label: "فضاء الشركاء", labelKey: "partnerPortal", icon: Handshake },
  { href: "/admin", label: "لوحة الإدارة", labelKey: "admin", icon: ShieldAlert },
  { href: "/host", label: "لوحة المالك", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/my-bookings", label: "حجوزاتي", labelKey: "myBookings", icon: BookmarkCheck },
  { href: "/favorites", label: "المفضلة", labelKey: "favorites", icon: Heart },
  { href: "/support-tickets", label: "الدعم الفني", labelKey: "help", icon: HelpCircle },
  { href: "/blog", label: "المدونة", labelKey: "blog", icon: BookOpen },
];

function isActiveLink(currentLocation: string, href: string) {
  const [currentPath, currentQuery = ""] = currentLocation.split("?");
  const [targetPath, targetQuery = ""] = href.split("?");

  if (targetPath === "/") return currentPath === "/";
  if (currentPath !== targetPath) return false;
  if (!targetQuery) return true;

  const currentParams = new URLSearchParams(currentQuery);
  const targetParams = new URLSearchParams(targetQuery);
  return Array.from(targetParams.entries()).every(
    ([key, value]) => currentParams.get(key) === value,
  );
}

export default function Navbar() {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [twoFaModalOpen, setTwoFaModalOpen] = useState(false);
  const [notificationPulse, setNotificationPulse] = useState(false);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return readBrandPreference("notificationSound") !== "off";
  });
  const notificationRef = useRef<HTMLDivElement>(null);
  const previousNotificationIdsRef = useRef<Set<number>>(new Set());
  const hasInteractedRef = useRef(false);
  const mobileMenuRef = useRef<HTMLElement>(null);

  const { theme, toggleTheme } = useTheme();
  const { direction, language, setLanguage, t } = useLanguage();
  const { currency, setCurrency } = useCurrency();
  const { isAuthenticated } = useAuth();
  const notificationQuery = trpc.notifications.list.useQuery({ unreadOnly: false }, {
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unreadQuery = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const markReadMutation = trpc.notifications.markRead.useMutation();
  const markAllMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: async () => {
      await notificationQuery.refetch();
      await unreadQuery.refetch();
      toast.success(t("markAllReadSuccess"));
    },
  });
  const notifications = notificationQuery.data ?? [];
  const unreadCount = unreadQuery.data ?? 0;

  useEffect(() => {
    const markInteracted = () => {
      hasInteractedRef.current = true;
    };
    document.addEventListener("pointerdown", markInteracted, { once: true });
    document.addEventListener("keydown", markInteracted, { once: true });
    return () => {
      document.removeEventListener("pointerdown", markInteracted);
      document.removeEventListener("keydown", markInteracted);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      previousNotificationIdsRef.current.clear();
      setNotificationPulse(false);
      return;
    }

    const currentIds = new Set(notifications.map((notification) => notification.id));
    const previousIds = previousNotificationIdsRef.current;
    const hasNewNotification = previousIds.size > 0 && notifications.some((notification) => !previousIds.has(notification.id));

    if (hasNewNotification) {
      setNotificationPulse(true);
      if (notificationSoundEnabled && hasInteractedRef.current && typeof window !== "undefined") {
        try {
          const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            const audioContext = new AudioContextClass();
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.12);
            gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.045, audioContext.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.2);
            oscillator.addEventListener("ended", () => void audioContext.close(), { once: true });
          }
        } catch {
          // Browsers may block audio until a user gesture; the visual indicator still works.
        }
      }
    }

    previousNotificationIdsRef.current = currentIds;
  }, [isAuthenticated, notificationSoundEnabled, notifications]);

  const currentSection = useMemo(() => {
    if (location.startsWith("/search")) return "search";
    return location.split("?")[0];
  }, [location]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
  }, [location]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const menu = mobileMenuRef.current;
    if (!menu) return;

    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(menu.querySelectorAll<HTMLElement>(focusableSelector));
    focusable[0]?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const currentFocusable = Array.from(menu.querySelectorAll<HTMLElement>(focusableSelector));
      if (currentFocusable.length === 0) return;
      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
        setSettingsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        setNotificationsOpen(false);
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const markAllAsRead = () => {
    if (!isAuthenticated || unreadCount === 0) return;
    markAllMutation.mutate();
  };

  const toggleNotificationSound = () => {
    setNotificationSoundEnabled((enabled) => {
      const nextEnabled = !enabled;
      writeBrandPreference("notificationSound", nextEnabled ? "on" : "off");
      return nextEnabled;
    });
  };

  const selectCurrency = (nextCurrency: Currency) => {
    setCurrency(nextCurrency);
    toast.success(t("currencySwitched"));
  };

  const selectLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    toast.success(
      nextLanguage === "ar"
        ? t("switchedToArabic")
        : nextLanguage === "fr"
          ? t("switchedToFrench")
          : t("switchedToEnglish"),
    );
  };

  const renderNavLinks = (mobile = false) =>
    navLinks
      // Desktop keeps only the two shopping flows; every other destination
      // stays reachable from the mobile drawer via the hamburger.
      .filter((link) => mobile || ["cars", "properties"].includes(link.labelKey ?? ""))
      .map((link) => {
      const Icon = link.icon;
      const active = isActiveLink(location, link.href);
      return (
        <Link
          key={link.href}
          href={link.href}
          onClick={() => setMobileMenuOpen(false)}
          className={
            mobile
              ? `flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent-clay text-[var(--primary-ink)]"
                    : "text-ink-secondary hover:bg-bg-muted hover:text-ink-primary"
                }`
              : `flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "text-ink-primary font-semibold underline decoration-accent-clay underline-offset-4"
                    : "text-ink-secondary hover:text-ink-primary"
                }`
          }
          aria-current={active ? "page" : undefined}
        >
          {Icon && <Icon className={mobile ? "h-4 w-4" : "h-3.5 w-3.5"} />}
          <span>{link.labelKey ? t(link.labelKey) : link.label}</span>
        </Link>
      );
    });

  return (
    <>
      <header
        className="sticky top-0 z-50 h-16 bg-bg-surface text-ink-primary shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
        dir={direction}
      >
        <div className="container mx-auto flex h-16 sm:h-20 items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4">
          <Link href="/" className="group flex shrink-0 items-center gap-3 pe-6" aria-label={t("home")}>
  <div className="brand-logo-container flex shrink-0 items-center">
    <img
      src="/assets/images/logo.png"
      alt="ALTUSplace"
      className="brand-logo h-11 sm:h-12 w-auto object-contain"
      style={{ height: '44px', maxWidth: '100%', objectFit: 'contain' }}
    />
  </div>
  <BrandMark withTagline />
</Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex" aria-label={t("mainNavLabel")}>
            {renderNavLinks()}
          </nav>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <Link href="/become-partner" className="b2-press corner-cut-sm hidden min-h-10 items-center gap-1.5 rounded-sm bg-accent-clay px-3 text-xs font-extrabold text-[var(--primary-ink)] shadow-[var(--shadow-clay)] transition-colors hover:bg-accent-clay-hover lg:inline-flex" aria-label={t("partnerJoinCta")} title={t("partnerJoinCta")}>
              <Handshake className="h-4 w-4" />
              <span>{t("partnerJoinCta")}</span>
            </Link>
            <NavbarCitySelect className="hidden xl:block" />

            {/* Consolidated desktop menu: theme, notifications, language,
                currency, 2FA and WhatsApp live behind one settings gear,
                so the desktop header stays a calm "Logo | Cars · Properties |
                CTA" row. Panels anchor `end-0` under this wrapper (RTL-safe);
                the wrapper carries notificationRef, so the outside-click
                handler below closes settings and notifications together. */}
            <div className="relative" ref={notificationRef}>
              <Link
                href={isAuthenticated ? "/profile" : "/login"}
                className="b2-icon-button border border-border-subtle bg-bg-surface text-ink-secondary hover:bg-bg-muted hover:text-ink-primary"
                aria-label={isAuthenticated ? t("profile") : t("login")}
                title={isAuthenticated ? t("profile") : t("login")}
              >
                <UserRound className="h-4 w-4 text-accent-clay" aria-hidden="true" />
              </Link>

              <button
                type="button"
                className={`b2-icon-button relative border border-border-subtle bg-bg-surface text-ink-secondary hover:bg-bg-muted hover:text-ink-primary ${settingsOpen ? "ring-1 ring-border-default" : ""}`}
                onClick={() => {
                  setSettingsOpen((open) => !open);
                  setNotificationsOpen(false);
                }}
                aria-expanded={settingsOpen}
                aria-haspopup="menu"
                aria-label={t("settingsLabel")}
                title={t("settingsLabel")}
              >
                <Settings className="h-4 w-4 text-accent-clay" aria-hidden="true" />
              </button>

              {settingsOpen && (
                <div className="absolute end-0 top-full z-50 mt-2 w-64 origin-top animate-fade-in rounded-md border border-border-subtle bg-bg-elevated p-2 shadow-lg">
                  {/* Theme */}
                  <div className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5">
                    <span className="text-xs font-bold text-ink-primary">{t("toggleThemeLabel")}</span>
                    {toggleTheme && (
                      <button
                        type="button"
                        onClick={() => {
                          toggleTheme();
                          toast.success(theme === "dark" ? t("themeToLightToast") : t("themeToDarkToast"));
                        }}
                        className="b2-icon-button border border-border-subtle bg-bg-surface text-ink-secondary hover:bg-bg-muted hover:text-ink-primary"
                        aria-label={t("toggleThemeLabel")}
                      >
                        {theme === "dark" ? <Sun className="h-4 w-4 text-accent-warm" aria-hidden="true" /> : <Moon className="h-4 w-4 text-accent-clay" aria-hidden="true" />}
                      </button>
                    )}
                  </div>

                  {/* Language */}
                  <div className="mt-1 border-t border-border-subtle pt-2">
                    <p className="mb-2 flex items-center gap-1.5 px-2 text-xs font-bold text-ink-secondary">
                      <Globe className="h-3.5 w-3.5 text-accent-clay" aria-hidden="true" /> {t("language")}
                    </p>
                    <div className="b2-segmented-control w-full">
                      {(["ar", "fr", "en"] as const).map((item) => (
                        <button key={item} type="button" aria-pressed={language === item} onClick={() => selectLanguage(item)} className={language === item ? "bg-accent-clay text-[var(--primary-ink)]" : "text-ink-secondary hover:bg-bg-muted hover:text-ink-primary"}>{item === "ar" ? t("arabic") : item === "fr" ? t("french") : t("english")}</button>
                      ))}
                    </div>
                  </div>

                  {/* Currency */}
                  <div className="mt-2 border-t border-border-subtle pt-2">
                    <p className="mb-2 flex items-center gap-1.5 px-2 text-xs font-bold text-ink-secondary">
                      <Coins className="h-3.5 w-3.5 text-accent-clay" aria-hidden="true" /> {t("currency")}
                    </p>
                    <div className="b2-segmented-control w-full">
                      {(["MAD", "EUR", "USD"] as Currency[]).map((item) => (
                        <button key={item} type="button" aria-pressed={currency === item} onClick={() => selectCurrency(item)} className={currency === item ? "bg-accent-clay text-[var(--primary-ink)]" : "text-ink-secondary hover:bg-bg-muted hover:text-ink-primary"}>{item}</button>
                      ))}
                    </div>
                  </div>

                  {/* Secondary actions */}
                  <div className="mt-2 space-y-1 border-t border-border-subtle pt-2">
                    <button
                      type="button"
                      className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-sm px-2 text-xs font-bold text-ink-secondary hover:bg-bg-muted hover:text-ink-primary ${notificationPulse ? "motion-safe:animate-pulse ring-2 ring-accent-red/50" : ""}`}
                      onClick={() => {
                        setNotificationsOpen(true);
                        setSettingsOpen(false);
                        setNotificationPulse(false);
                      }}
                      aria-haspopup="dialog"
                      aria-label={unreadCount ? t("notificationsWithUnread") : t("notifications")}
                    >
                      <span className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-accent-clay" aria-hidden="true" />
                        {t("notifications")}
                      </span>
                      {unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-red px-1.5 text-[10px] font-black text-white">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setTwoFaModalOpen(true); setSettingsOpen(false); }}
                      className="flex min-h-10 w-full items-center gap-2 rounded-sm px-2 text-xs font-bold text-ink-secondary hover:bg-bg-muted hover:text-ink-primary"
                    >
                      <Shield className="h-4 w-4 text-accent-clay" aria-hidden="true" />
                      {t("accountSecurity")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setWhatsappModalOpen(true); setSettingsOpen(false); }}
                      className="flex min-h-10 w-full items-center gap-2 rounded-sm px-2 text-xs font-bold text-ink-secondary hover:bg-bg-muted hover:text-ink-primary"
                    >
                      <MessageSquare className="h-4 w-4 text-accent-green" aria-hidden="true" />
                      {t("whatsappNotify")}
                    </button>
                  </div>
                </div>
              )}
              {notificationsOpen && (
                <div className="absolute end-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-border-subtle bg-bg-elevated p-4 text-end text-ink-primary shadow-lg" role="dialog" aria-label={t("notificationsPanelLabel")}>
                  <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                    <h2 className="flex items-center gap-1.5 text-xs font-bold">
                      <Bell className="h-4 w-4 text-accent-clay" />
                      {t("notificationsTitle")}
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleNotificationSound}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-ink-tertiary hover:text-ink-primary"
                        aria-pressed={notificationSoundEnabled}
                        title={notificationSoundEnabled ? t("soundOffLabel") : t("soundOnLabel")}
                      >
                        {notificationSoundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                        <span className="hidden sm:inline">{notificationSoundEnabled ? t("soundEnabledLabel") : t("soundDisabledLabel")}</span>
                      </button>
                      {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        disabled={markAllMutation.isPending}
                        aria-busy={markAllMutation.isPending}
                        className="text-[10px] font-bold text-accent-clay hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {markAllMutation.isPending ? t("markingAllRead") : t("markAllRead")}
                      </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-64 space-y-2.5 overflow-y-auto py-3">
                    {!isAuthenticated ? (
                      <p className="py-5 text-center text-xs text-ink-tertiary">{t("loginToFollowNotifications")}</p>
                    ) : notifications.length === 0 ? (
                      <p className="py-5 text-center text-xs text-ink-tertiary">{t("noNotifications")}</p>
                    ) : notifications.map((item) => {
                      const unread = item.readAt === null;
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => unread && markReadMutation.mutate({ notificationId: item.id }, { onSuccess: () => { void notificationQuery.refetch(); void unreadQuery.refetch(); } })}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (unread) markReadMutation.mutate({ notificationId: item.id }, { onSuccess: () => { void notificationQuery.refetch(); void unreadQuery.refetch(); } }); } }}
                          className={`space-y-1 rounded-sm border p-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent-clay ${unread ? "border-accent-warm/40 bg-accent-warm-s" : "border-border-subtle bg-bg-muted"}`}
                        >
                          <div className="flex items-center justify-between gap-2 font-bold">
                            <span>{item.title}</span>
                            <span className="shrink-0 text-[10px] text-ink-tertiary">{new Date(item.createdAt).toLocaleString(language === "ar" ? "ar-MA" : language === "fr" ? "fr-MA" : "en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
                          </div>
                          <p className="whitespace-pre-line text-[11px] text-ink-tertiary">{item.message}</p>
                        </div>
                      );
                    })}
                  </div>
                  <Link href="/notifications" className="block border-t border-border-subtle pt-3 text-center text-xs font-bold text-accent-clay hover:underline">
                    {t("viewAllNotifications")}
                  </Link>
                </div>
              )}
            </div>

          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 2xl:hidden">
            <Link href="/search" className={`b2-icon-button border border-border-subtle bg-bg-surface text-ink-secondary hover:bg-bg-muted hover:text-ink-primary ${currentSection === "search" ? "text-accent-clay" : ""}`} aria-label={t("openSearchLabel")} title={t("searchTitleLabel")}>
              <Car className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="b2-icon-button border border-border-subtle bg-bg-surface text-ink-primary hover:bg-bg-muted"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileMenuOpen ? t("closeMenuLabel") : t("openMenuLabel")}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      <RegionalHighlights />

      <Suspense fallback={null}>
        <WhatsAppNotificationModal
          isOpen={whatsappModalOpen}
          onClose={() => setWhatsappModalOpen(false)}
        />
        <TwoFactorAuthModal
          isOpen={twoFaModalOpen}
          onClose={() => setTwoFaModalOpen(false)}
          onSuccess={() => setTwoFaModalOpen(false)}
        />
      </Suspense>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] 2xl:hidden" role="presentation">
          <button type="button" className="absolute inset-0 bg-ink-primary/40 dark:bg-[#1C1C1E]/40 backdrop-blur-[2px] animate-in fade-in duration-200" aria-label={t("close")} onClick={() => setMobileMenuOpen(false)} />
          {/* Drawer: 88vw side panel that slides in from the inline-start edge
              (`slide-in-from-start` reads `:dir()`, so it enters from the right
              in Arabic and the left in French/English). Reduced-motion users get
              a cut instead — the global media query zeroes every animation. */}
          <aside ref={mobileMenuRef} id="mobile-navigation" className={`absolute top-0 flex h-full w-[min(88vw,22rem)] flex-col overflow-y-auto bg-bg-surface p-4 shadow-xl animate-in slide-in-from-start duration-300 ${direction === "rtl" ? "right-0" : "left-0"}`} dir={direction} aria-label={t("search")} aria-modal="true" role="dialog" tabIndex={-1}>
          <div className="flex items-center justify-between border-b border-border-subtle pb-4">
            <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex min-h-11 w-32 items-center justify-start" aria-label={BRAND_NAME}>
              <img src="/assets/images/logo.png" alt={BRAND_NAME} className="brand-logo max-h-full w-auto object-contain" style={{ height: '44px', maxWidth: '100%', objectFit: 'contain' }} />
            </Link>
            <button type="button" onClick={() => setMobileMenuOpen(false)} className="b2-icon-button border border-border-subtle bg-bg-muted" aria-label={t("close")}><X className="h-5 w-5" /></button>
          </div>
          <div className="mx-auto flex w-full flex-1 flex-col gap-2 pt-4">
            <nav className="space-y-1" aria-label={t("mobileNavLabel")}>
              {renderNavLinks(true)}
            </nav>

            <div className="mt-3 space-y-4 border-t border-border-subtle pt-4">
              <NavbarMobileCitySelect onSelected={() => setMobileMenuOpen(false)} />

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-secondary"><Coins className="h-3.5 w-3.5 text-accent-clay" /> {t("currency")}</p>
                <div className="b2-segmented-control w-full">
                  {(["MAD", "EUR", "USD"] as Currency[]).map((item) => (
                    <button key={item} type="button" aria-pressed={currency === item} onClick={() => selectCurrency(item)} className={currency === item ? "bg-accent-clay text-[var(--primary-ink)]" : "text-ink-secondary hover:bg-bg-muted hover:text-ink-primary"}>{item}</button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-secondary"><Globe className="h-3.5 w-3.5 text-accent-clay" /> {t("language")}</p>
                <div className="b2-segmented-control w-full">
                  {(["ar", "fr", "en"] as const).map((item) => (
                    <button key={item} type="button" aria-pressed={language === item} onClick={() => selectLanguage(item)} className={language === item ? "bg-accent-clay text-[var(--primary-ink)]" : "text-ink-secondary hover:bg-bg-muted hover:text-ink-primary"}>{item === "ar" ? t("arabic") : item === "fr" ? t("french") : t("english")}</button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setTwoFaModalOpen(true); setMobileMenuOpen(false); }} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm border border-border-subtle bg-bg-muted px-3 py-2 text-xs font-bold text-ink-primary hover:bg-bg-base"><Shield className="h-3.5 w-3.5 text-accent-clay" /> {t("accountSecurity")}</button>
              </div>

              {toggleTheme && (
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    toast.success(theme === "dark" ? t("themeToLightToast") : t("themeToDarkToast"));
                  }}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-sm border border-border-subtle bg-bg-muted px-3 py-2 text-xs font-bold text-ink-primary hover:bg-bg-base"
                  aria-label={t("toggleThemeLabel")}
                >
                  {theme === "dark" ? <Sun className="h-3.5 w-3.5 text-accent-warm" /> : <Moon className="h-3.5 w-3.5 text-accent-clay" />}
                  {t("toggleThemeLabel")}
                </button>
              )}

              <Link href="/become-partner" onClick={() => setMobileMenuOpen(false)} className="b2-press corner-cut-sm flex min-h-11 items-center justify-center gap-2 rounded-sm bg-accent-green px-4 py-3 text-sm font-extrabold text-[var(--brand-navy)] transition-colors hover:bg-accent-green/90">
                <Handshake className="h-4 w-4" />
                {t("partnerJoinCta")}
              </Link>
              <Link href="/add-car" onClick={() => setMobileMenuOpen(false)} className="b2-press corner-cut-sm flex min-h-11 items-center justify-center rounded-sm bg-accent-clay px-4 py-3 text-sm font-extrabold text-[var(--primary-ink)] shadow-[var(--shadow-clay)] transition-colors hover:bg-accent-clay-hover">
                {t("addCar")}
              </Link>
            </div>
          </div>
          </aside>
        </div>
      )}
    </>
  );
}