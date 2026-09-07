import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { readBrandPreference, writeBrandPreference } from "@/config/brand";
import {
  Bell,
  BookOpen,
  Building2,
  Car,
  Coins,
  CreditCard,
  Globe,
  HelpCircle,
  LayoutDashboard,
  Menu,
  Moon,
  Shield,
  ShieldAlert,
  Sun,
  X,
  BookmarkCheck,
  MessageSquare,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { Language, useLanguage } from "@/contexts/LanguageContext";
import { useCurrency, Currency } from "@/contexts/CurrencyContext";
const CMIPaymentModal = lazy(() => import("./CMIPaymentModal").then((module) => ({ default: module.CMIPaymentModal })));
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
  { href: "/search?type=property", label: "العقارات الفاخرة", labelKey: "properties", icon: Building2 },
  { href: "/admin", label: "لوحة الإدارة", labelKey: "admin", icon: ShieldAlert },
  { href: "/host", label: "لوحة المالك", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/my-bookings", label: "حجوزاتي", labelKey: "myBookings", icon: BookmarkCheck },
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
  const [cmiModalOpen, setCmiModalOpen] = useState(false);
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
      toast.success(language === "ar" ? "تم تحديد جميع الإشعارات كمقروءة" : "Toutes les notifications sont marquées comme lues");
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
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        setNotificationsOpen(false);
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
    toast.success(`تم تبديل العملة بنجاح إلى ${nextCurrency}`);
  };

  const selectLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    toast.success(
      nextLanguage === "ar"
        ? "تم التبديل إلى اللغة العربية"
        : nextLanguage === "fr"
          ? "Passé au français avec succès"
          : "Switched to English successfully",
    );
  };

  const renderNavLinks = (mobile = false) =>
    navLinks
      // Desktop keeps the five primary destinations; role-gated dashboards and
      // support remain reachable from the drawer, footer and dashboards.
      .filter((link) => mobile || !["admin", "dashboard", "help"].includes(link.labelKey ?? ""))
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
              ? `flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
                  active
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              : `flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-bold transition-colors ${
                  active
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
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
        className="glass-header sticky top-0 z-50 border-b text-foreground shadow-sm"
          dir={direction}
        >
        <div className="container mx-auto flex h-16 sm:h-20 items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4">
          <Link href="/" className="group flex shrink-0 items-center gap-3" aria-label="الرئيسية">
  <div className="flex shrink-0 items-center">
    <img
      src="/images/logo.png"
      alt="ALTUSplace"
      className="brand-logo h-10 sm:h-12 w-auto object-contain dark:brightness-0 dark:invert"
    />
  </div>
  <div className="flex flex-col">
    <span className="font-bold text-lg sm:text-xl tracking-tight text-slate-900 dark:text-white">
      ALTUS<span className="font-normal text-amber-600">place</span>
    </span>
    <span className="text-[9px] sm:text-[10px] tracking-wider text-muted-foreground uppercase -mt-1 font-medium">
      Rent. Drive. Live.
    </span>
  </div>
</Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex" aria-label="التنقل الرئيسي">
            {renderNavLinks()}
          </nav>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <div className="hidden 2xl:block" aria-label="اختيار العملة">
              <div className="b2-segmented-control">
                <Coins className="mx-1 h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                {(["MAD", "EUR", "USD"] as Currency[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={currency === item}
                    onClick={() => selectCurrency(item)}
                    className={currency === item ? "bg-amber-500 text-white" : "text-muted-foreground hover:bg-background hover:text-foreground"}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="hidden 2xl:block" aria-label="اختيار اللغة">
              <div className="b2-segmented-control">
                <Globe className="mx-1 h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                {(["ar", "fr", "en"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={language === item}
                    onClick={() => selectLanguage(item)}
                    className={language === item ? "bg-amber-500 text-white" : "text-muted-foreground hover:bg-background hover:text-foreground"}
                  >
                    {item === "ar" ? "عربي" : item === "fr" ? "FR" : "EN"}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="b2-icon-button border border-border bg-muted text-foreground hover:bg-background"
              onClick={() => setTwoFaModalOpen(true)}
              title="إدارة الأمان والمصادقة الثنائية"
              aria-label="إدارة الأمان والمصادقة الثنائية"
            >
              <Shield className="h-4 w-4 text-amber-600 dark:text-amber-300" />
            </button>
            <button
              type="button"
              className="b2-icon-button border border-border bg-muted text-foreground hover:bg-background"
              onClick={() => setCmiModalOpen(true)}
              title="بوابة الدفع CMI"
              aria-label="فتح بوابة الدفع CMI"
            >
              <CreditCard className="h-4 w-4 text-amber-600 dark:text-amber-300" />
            </button>
            <button
              type="button"
              className="b2-icon-button border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
              onClick={() => setWhatsappModalOpen(true)}
              title="إشعار WhatsApp / SMS"
              aria-label="فتح إشعار واتساب"
            >
              <MessageSquare className="h-4 w-4" />
            </button>

            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                className={`b2-icon-button relative border border-border bg-muted text-foreground hover:bg-background ${notificationPulse ? "ring-2 ring-rose-400/70 ring-offset-2 ring-offset-background motion-safe:animate-pulse" : ""}`}
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setNotificationPulse(false);
                }}
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
                aria-label={`الإشعارات${unreadCount ? `، ${unreadCount} غير مقروءة` : ""}`}
                title="الإشعارات"
              >
                <Bell className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute left-0 mt-3 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-4 text-right text-popover-foreground shadow-xl" role="dialog" aria-label="قائمة الإشعارات">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <h2 className="flex items-center gap-1.5 text-xs font-bold">
                      <Bell className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                      الإشعارات والتحديثات
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleNotificationSound}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                        aria-pressed={notificationSoundEnabled}
                        title={notificationSoundEnabled ? "إيقاف صوت الإشعارات" : "تفعيل صوت الإشعارات"}
                      >
                        {notificationSoundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                        <span className="hidden sm:inline">{notificationSoundEnabled ? "الصوت مفعّل" : "الصوت متوقف"}</span>
                      </button>
                      {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        disabled={markAllMutation.isPending}
                        aria-busy={markAllMutation.isPending}
                        className="text-[10px] font-bold text-amber-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300"
                      >
                        {markAllMutation.isPending ? "جارٍ التحديث…" : "تحديد الكل كمقروء"}
                      </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-64 space-y-2.5 overflow-y-auto py-3">
                    {!isAuthenticated ? (
                      <p className="py-5 text-center text-xs text-muted-foreground">سجّل الدخول لمتابعة إشعارات حجوزاتك.</p>
                    ) : notifications.length === 0 ? (
                      <p className="py-5 text-center text-xs text-muted-foreground">لا توجد إشعارات جديدة.</p>
                    ) : notifications.map((item) => {
                      const unread = item.readAt === null;
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => unread && markReadMutation.mutate({ notificationId: item.id }, { onSuccess: () => { void notificationQuery.refetch(); void unreadQuery.refetch(); } })}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (unread) markReadMutation.mutate({ notificationId: item.id }, { onSuccess: () => { void notificationQuery.refetch(); void unreadQuery.refetch(); } }); } }}
                          className={`space-y-1 rounded-xl border p-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${unread ? "border-amber-500/30 bg-amber-500/10" : "border-border bg-muted"}`}
                        >
                          <div className="flex items-center justify-between gap-2 font-bold">
                            <span>{item.title}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString(language === "ar" ? "ar-MA" : language === "fr" ? "fr-MA" : "en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
                          </div>
                          <p className="whitespace-pre-line text-[11px] text-muted-foreground">{item.message}</p>
                        </div>
                      );
                    })}
                  </div>
                  <Link href="/notifications" className="block border-t border-border pt-3 text-center text-xs font-bold text-amber-700 hover:underline dark:text-amber-300">
                    عرض كل الإشعارات
                  </Link>
                </div>
              )}
            </div>

            {toggleTheme && (
              <button
                type="button"
                className="b2-icon-button border border-border bg-muted text-foreground hover:bg-background"
                onClick={() => {
                  toggleTheme();
                  toast.success(theme === "dark" ? "تم تفعيل الوضع النهاري" : "تم تفعيل الوضع الليلي");
                }}
                aria-label="تبديل الوضع الليلي"
                title="تبديل الوضع الليلي"
              >
                {theme === "dark" ? <Sun className="h-4 w-4 text-amber-600 dark:text-amber-300" /> : <Moon className="h-4 w-4 text-amber-600 dark:text-amber-300" />}
              </button>
            )}

            <Link href="/add-car" className="inline-flex min-h-11 items-center rounded-xl bg-amber-500 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-amber-600">
              {t("addCar")}
            </Link>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 2xl:hidden">
            <Link href="/search" className={`b2-icon-button border border-border bg-muted text-foreground ${currentSection === "search" ? "text-amber-700 dark:text-amber-300" : ""}`} aria-label="فتح البحث" title="البحث">
              <Car className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="b2-icon-button border border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileMenuOpen ? "إغلاق القائمة" : "فتح القائمة"}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      <Suspense fallback={null}>
        <CMIPaymentModal
          isOpen={cmiModalOpen}
          onClose={() => setCmiModalOpen(false)}
          onSuccess={() => setCmiModalOpen(false)}
          amount={1500}
        />
        <WhatsAppNotificationModal
          isOpen={whatsappModalOpen}
          onClose={() => setWhatsappModalOpen(false)}
          bookingDetails={{
            id: "ALT-9942",
            carName: "Dacia Duster 2026",
            customerName: "محمد العلوي",
            customerPhone: "",
            totalPrice: 1500,
          }}
        />
        <TwoFactorAuthModal
          isOpen={twoFaModalOpen}
          onClose={() => setTwoFaModalOpen(false)}
          onSuccess={() => setTwoFaModalOpen(false)}
        />
      </Suspense>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] 2xl:hidden" role="presentation">
          <button type="button" className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" aria-label={t("close")} onClick={() => setMobileMenuOpen(false)} />
          <aside ref={mobileMenuRef} id="mobile-navigation" className={`absolute top-0 flex h-full w-[min(88vw,22rem)] flex-col overflow-y-auto bg-background p-4 shadow-2xl ${direction === "rtl" ? "right-0" : "left-0"}`} dir={direction} aria-label={t("search")} aria-modal="true" role="dialog" tabIndex={-1}>
          <div className="flex items-center justify-between border-b border-border pb-4">
            <Link href="/" onClick={() => setMobileMenuOpen(false)} className="flex h-10 w-32 items-center justify-start" aria-label="ALTUSplace">
              <img src="/images/logo.png" alt="ALTUSplace" className="brand-logo max-h-full w-auto object-contain dark:brightness-0 dark:invert" />
            </Link>
            <button type="button" onClick={() => setMobileMenuOpen(false)} className="b2-icon-button border border-border bg-muted" aria-label={t("close")}><X className="h-5 w-5" /></button>
          </div>
          <div className="mx-auto flex w-full flex-1 flex-col gap-2 pt-4">
            <nav className="space-y-1" aria-label="التنقل على الهاتف">
              {renderNavLinks(true)}
            </nav>

            <div className="mt-3 space-y-4 border-t border-border pt-4">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><Coins className="h-3.5 w-3.5 text-[#D98236] dark:text-[#D98236]" /> العملة</p>
                <div className="b2-segmented-control w-full">
                  {(["MAD", "EUR", "USD"] as Currency[]).map((item) => (
                    <button key={item} type="button" aria-pressed={currency === item} onClick={() => selectCurrency(item)} className={currency === item ? "bg-[#D98236] text-white" : "text-muted-foreground hover:bg-background hover:text-foreground"}>{item}</button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><Globe className="h-3.5 w-3.5 text-[#D98236] dark:text-[#D98236]" /> {t("language")}</p>
                <div className="b2-segmented-control w-full">
                  {(["ar", "fr", "en"] as const).map((item) => (
                    <button key={item} type="button" aria-pressed={language === item} onClick={() => selectLanguage(item)} className={language === item ? "bg-[#D98236] text-white" : "text-muted-foreground hover:bg-background hover:text-foreground"}>{item === "ar" ? "العربية" : item === "fr" ? "Français" : "English"}</button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setTwoFaModalOpen(true); setMobileMenuOpen(false); }} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold text-foreground hover:bg-background"><Shield className="h-3.5 w-3.5 text-[#D98236] dark:text-[#D98236]" /> أمان الحساب</button>
                <button type="button" onClick={() => { setCmiModalOpen(true); setMobileMenuOpen(false); }} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold text-foreground hover:bg-background"><CreditCard className="h-3.5 w-3.5 text-[#D98236] dark:text-[#D98236]" /> الدفع CMI</button>
              </div>

              <Link href="/add-car" onClick={() => setMobileMenuOpen(false)} className="flex min-h-11 items-center justify-center rounded-xl bg-[#D98236] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#B96A28]">
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
