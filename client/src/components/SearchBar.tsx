import { useState } from "react";
import { useLocation } from "wouter";
import { Car, Building2, MapPin, CalendarDays, Search, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { CitySelect } from "@/components/CitySelect";

export type SearchBarValues = {
  type: "car" | "property";
  city: string;
  startDate?: string;
  endDate?: string;
};

type SearchBarProps = {
  /** Hero = large pill fields on the homepage; compact = results-page bar. */
  variant?: "hero" | "compact";
  initialTab?: "car" | "property";
  defaultCity?: string;
  /** When provided, the bar reports the search instead of navigating. */
  onSubmit?: (values: SearchBarValues) => void;
};

/**
 * Shared unified search widget — the Kayak-style tabbed vertical
 * (Cars | Properties) with city → pickup → return fields and
 * return ≥ pickup validation. Never navigates with an impossible date range.
 *
 * Direction (RTL/LTR) is inherited from the parent via the `dir` attribute —
 * only logical start/end utilities are used here, never hardcoded sides.
 */
export function SearchBar({
  variant = "hero",
  initialTab = "car",
  defaultCity = "الدار البيضاء",
  onSubmit,
}: SearchBarProps) {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const isCompact = variant === "compact";

  const [tab, setTab] = useState<"car" | "property">(initialTab);
  const [city, setCity] = useState(defaultCity);
  const [pickupDate, setPickupDate] = useState("");
  const [dropoffDate, setDropoffDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const clearError = () => {
    if (error) setError(null);
  };

  const submit = () => {
    if (pickupDate && dropoffDate && dropoffDate < pickupDate) {
      const message = t("searchDateInvalid");
      setError(message);
      toast.error(message);
      return;
    }
    const values: SearchBarValues = {
      type: tab,
      city,
      startDate: pickupDate || undefined,
      endDate: dropoffDate || undefined,
    };
    if (onSubmit) {
      onSubmit(values);
      return;
    }
    const params = new URLSearchParams();
    params.set("type", tab);
    if (city) params.set("city", city);
    if (pickupDate) params.set("startDate", pickupDate);
    if (dropoffDate) params.set("endDate", dropoffDate);
    setLocation(`/search?${params.toString()}`);
  };

  const fieldBase = isCompact
    ? "group relative flex flex-1 items-center gap-2.5 rounded-xl bg-bg-muted/55 px-3.5 py-2.5 text-start transition-colors duration-200 cursor-pointer hover:bg-bg-muted focus-within:bg-bg-muted"
    : "group relative flex min-w-0 flex-1 items-center gap-3 rounded-full bg-bg-muted/55 px-5 py-3 text-start transition-colors duration-200 cursor-pointer hover:bg-bg-muted focus-within:bg-bg-muted";
  const fieldIconClass =
    "shrink-0 h-5 w-5 text-ink-tertiary transition-colors duration-200 group-hover:text-ink-secondary group-focus-within:text-accent-clay";
  const fieldCaptionClass =
    "text-[10px] sm:text-[11px] font-bold tracking-wide text-ink-tertiary transition-colors duration-200 group-focus-within:text-ink-secondary";
  const fieldControlClass =
    "w-full min-w-0 bg-transparent outline-none text-sm font-bold text-ink-primary placeholder:text-ink-tertiary cursor-pointer [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer";

  const tabButtonClass = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold transition-colors duration-200 ${
      active
        ? "bg-accent-clay text-white shadow-[var(--shadow-clay)]"
        : "text-ink-secondary hover:text-ink-primary"
    }`;

  return (
    <div className={isCompact ? "w-full" : "mx-auto max-w-4xl"}>
      {/* Segmented tabs — Cars | Properties */}
      <div className={isCompact ? "mb-2 flex justify-start" : "mb-4 flex justify-center"}>
        <div
          role="tablist"
          aria-label={t("browseCategories")}
          className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-surface/85 p-1 shadow-md backdrop-blur-md"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "car"}
            onClick={() => setTab("car")}
            className={tabButtonClass(tab === "car")}
          >
            <Car className="h-4 w-4" />
            {t("searchTabCars")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "property"}
            onClick={() => setTab("property")}
            className={tabButtonClass(tab === "property")}
          >
            <Building2 className="h-4 w-4" />
            {t("searchTabProperties")}
          </button>
        </div>
      </div>

      {/* Search card */}
      <div
        className={
          isCompact
            ? "rounded-2xl border border-border-subtle bg-bg-surface p-2 shadow-md ring-1 ring-ink-primary/[0.03]"
            : "rounded-[2rem] border border-border-subtle bg-bg-surface p-2 shadow-2xl ring-1 ring-ink-primary/[0.03]"
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-2 lg:flex-row lg:items-stretch"
        >
          <label className={fieldBase}>
            <MapPin className={fieldIconClass} strokeWidth={1.5} />
            <span className="flex min-w-0 flex-1 flex-col items-start text-start">
              <span className={fieldCaptionClass}>{t("searchCityOdgency")}</span>
              <CitySelect
                value={city}
                onChange={(value) => {
                  setCity(value);
                  clearError();
                }}
                className={fieldControlClass}
              />
            </span>
          </label>

          <label className={fieldBase}>
            <CalendarDays className={fieldIconClass} strokeWidth={1.5} />
            <span className="flex min-w-0 flex-1 flex-col items-start text-start">
              <span className={fieldCaptionClass}>{t("searchPickupDate")}</span>
              <input
                type="date"
                value={pickupDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => {
                  setPickupDate(e.target.value);
                  clearError();
                }}
                className={fieldControlClass}
              />
            </span>
          </label>

          <label className={fieldBase}>
            <CalendarDays className={fieldIconClass} strokeWidth={1.5} />
            <span className="flex min-w-0 flex-1 flex-col items-start text-start">
              <span className={fieldCaptionClass}>{t("searchDropoffDate")}</span>
              <input
                type="date"
                value={dropoffDate}
                min={pickupDate || new Date().toISOString().split("T")[0]}
                onChange={(e) => {
                  setDropoffDate(e.target.value);
                  clearError();
                }}
                className={fieldControlClass}
              />
            </span>
          </label>

          <button
            type="submit"
            aria-label={t("searchSubmitAdvanced")}
            className={
              isCompact
                ? "b2-press flex shrink-0 items-center justify-center gap-2 self-stretch rounded-xl bg-accent-clay px-6 py-3 text-sm font-extrabold text-white shadow-[var(--shadow-clay)] transition-colors hover:bg-accent-clay-hover lg:ms-1"
                : "b2-press flex shrink-0 items-center justify-center gap-2 self-stretch rounded-full bg-accent-clay px-8 py-3.5 text-sm font-extrabold text-white shadow-[var(--shadow-clay)] transition-colors hover:bg-accent-clay-hover lg:ms-1"
            }
          >
            <Search className="h-4 w-4" strokeWidth={2.5} />
            <span>{t("search")}</span>
          </button>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent-red/10 px-3 py-2 text-xs font-bold text-accent-red"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* Trust microcopy — a promise, never a fabricated number */}
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-ink-tertiary">
        <ShieldCheck className="h-4 w-4 text-accent-green" />
        {t("searchTrustNote")}
      </p>
    </div>
  );
}