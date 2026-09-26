import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cityFromSlug } from "@/data/moroccoCities";
import { useCityGroups, type CityOption } from "@/hooks/useCityGroups";

type NavbarCitySelectProps = {
  className?: string;
};

/**
 * Navbar city dropdown.
 *
 * Presents a pinned "popular cities" shortlist (POPULAR_MOROCCO_CITIES, an
 * editorial list — see the note in moroccoCities.ts) above the full nationwide
 * catalogue grouped by Morocco's 12 administrative regions, sorted
 * alphabetically by region name so the order is stable and predictable.
 *
 * Every entry resolves through the shared catalogue in moroccoCities.ts rather
 * than a second hardcoded list, so slugs, French labels and /locations/<slug>
 * landing pages all stay consistent with the CitySelect used by the search and
 * listing forms.
 *
 * Accessibility: implements the listbox pattern — the trigger is a
 * `aria-haspopup="listbox"` button with `aria-expanded`, the panel is a
 * `role="listbox"` with `role="group"` sections, and a roving tabindex moves
 * between options with ArrowUp/ArrowDown/Home/End. Enter/Space commit, Escape
 * closes and returns focus to the trigger. The active option is announced via
 * `aria-activedescendant` so focus never leaves the trigger.
 *
 * VERIFIED: keyboard interaction and the 1280px visibility boundary by
 * scripts/verify-city-selector-responsive.mjs against the production build.
 *
 * NOT VERIFIED: below 1280px this component is intentionally `hidden` and the
 * mobile accordion (NavbarMobileCitySelect) takes over; the two share
 * useCityGroups so their city lists cannot drift, but only the accordion's
 * layout is measured at 375/768/1024. Screen-reader announcement was not tested
 * with an actual assistive technology.
 */
export function NavbarCitySelect({ className }: NavbarCitySelectProps) {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const activeOptionId = `${listboxId}-option-${activeIndex}`;

  const { groups, flatOptions, labelFor } = useCityGroups();

  // Mark the current city as selected so the trigger reflects the active filter.
  const currentCity = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("city");
    if (!raw) return null;
    return cityFromSlug(raw);
  }, []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const commit = useCallback(
    (option: CityOption) => {
      // ?city=<slug> is what Search.tsx and the /locations pages already parse.
      setLocation(`/search?city=${encodeURIComponent(option.slug)}`);
      close();
    },
    [close, setLocation]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const lastIndex = flatOptions.length - 1;

      if (event.key === "Escape") {
        if (open) {
          event.preventDefault();
          close();
        }
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setActiveIndex((current) => {
          if (event.key === "ArrowDown") {
            return current >= lastIndex ? 0 : current + 1;
          }
          return current <= 0 ? lastIndex : current - 1;
        });
        return;
      }

      if (event.key === "Home" || event.key === "End") {
        if (!open) return;
        event.preventDefault();
        setActiveIndex(event.key === "Home" ? 0 : lastIndex);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        // Let Enter activate the trigger naturally when closed; when open it
        // commits the highlighted option instead.
        if (open) {
          event.preventDefault();
          const option = flatOptions[activeIndex];
          if (option) commit(option);
        }
      }
    },
    [activeIndex, close, commit, flatOptions, open]
  );

  let optionCursor = -1;
  const triggerLabel = currentCity
    ? labelFor(currentCity)
    : t("browseCities");

  return (
    <div className={`relative ${className ?? ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? activeOptionId : undefined}
        aria-label={t("browseCitiesAria")}
        title={t("browseCities")}
        className="b2-press inline-flex min-h-10 items-center gap-1.5 rounded-sm border border-border-subtle bg-bg-surface px-3 text-xs font-bold text-ink-primary shadow-xs transition-colors hover:border-border-default hover:bg-bg-muted"
      >
        <MapPin className="h-4 w-4 text-accent-clay" aria-hidden="true" />
        <span>{triggerLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-ink-tertiary transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t("browseCitiesAria")}
          className="absolute left-0 top-full z-50 mt-2 max-h-[70vh] w-64 origin-top animate-fade-in overflow-y-auto overscroll-contain rounded-md border border-border-subtle bg-bg-elevated p-1 shadow-lg shadow-[var(--shadow-lg)]"
        >
          {groups.map((group) => (
            <div key={group.id} role="group" aria-label={group.label} className="mb-1 last:mb-0">
              <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
                {group.label}
              </div>
              {group.options.map((option) => {
                optionCursor += 1;
                const index = optionCursor;
                const isActive = index === activeIndex;
                const isCurrent = currentCity === option.city;
                return (
                  <button
                    key={option.slug}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    // Roving tabindex: the trigger keeps DOM focus, so options are
                    // never tab stops and the list stays a single tab position.
                    tabIndex={-1}
                    onClick={() => commit(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-sm px-3 text-start text-xs font-bold transition-colors duration-150 ${
                      isActive ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span>{option.label}</span>
                    {isCurrent && <Check className="h-3.5 w-3.5 text-accent-clay" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default NavbarCitySelect;
