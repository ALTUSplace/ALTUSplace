import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cityFromSlug } from "@/data/moroccoCities";
import { filterCityGroups, useCityGroups, type CityOption } from "@/hooks/useCityGroups";

type NavbarMobileCitySelectProps = {
  /** Called after a city is chosen — the host uses it to close the mobile menu. */
  onSelected?: () => void;
};

/**
 * Mobile counterpart to NavbarCitySelect, rendered inside the existing mobile
 * navigation panel.
 *
 * An inline disclosure (not a nested modal) on purpose: the mobile panel is
 * already a fixed overlay with its own scroll container, and opening a Radix
 * Sheet on top of it would nest two scroll-locking dialogs and fight over
 * focus. Expanding in place keeps a single overlay, and the panel's own
 * overflow-y handles the rest.
 *
 * The 71 nationwide cities are long for a phone, so the expanded region is a
 * bounded, independently scrollable list with a filter box rather than an
 * unbounded inline list.
 *
 * Accessibility follows the disclosure pattern (aria-expanded /
 * aria-controls on the trigger) with a plain button list inside: buttons rather
 * than a listbox, because touch users scroll rather than arrow-key, and every
 * option stays a real tab stop that announces its own label and selected state.
 *
 * VERIFIED: scripts/verify-city-selector-responsive.mjs (37 checks) and
 * scripts/audit-city-accordion-geometry.mjs drive the production build in
 * Chromium at 375/768/1024/1280px — expansion, 71 options, filter narrowing,
 * empty state, navigation + menu close, 44px tap targets, no truncation, no rows
 * outside the panel, popular group first, filter autofocused, and the list
 * scrolling internally (3513px of content in a 403px box).
 *
 * NOT VERIFIED: real touch input (only synthetic mouse events), and any device
 * or browser engine other than Chromium. Screenshots were captured but not
 * reviewed by a human — the reviewing model cannot view images, so layout was
 * asserted geometrically instead. See README "Feature verification status".
 */
export function NavbarMobileCitySelect({ onSelected }: NavbarMobileCitySelectProps) {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const panelId = useRef(`mobile-city-list-${Math.random().toString(36).slice(2)}`).current;
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { groups, labelFor } = useCityGroups();

  const currentCity = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("city");
    return raw ? cityFromSlug(raw) : null;
  }, []);

  const visibleGroups = useMemo(() => filterCityGroups(groups, query), [groups, query]);

  useEffect(() => {
    if (expanded && !query) searchRef.current?.focus();
  }, [expanded, query]);

  const commit = (option: CityOption) => {
    setLocation(`/search?city=${encodeURIComponent(option.slug)}`);
    setExpanded(false);
    setQuery("");
    onSelected?.();
  };

  const totalMatches = visibleGroups.reduce((sum, group) => sum + group.options.length, 0);

  return (
    <div className="border-t border-border-subtle pt-4">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-sm border border-border-subtle bg-bg-muted px-3 py-2 text-start text-xs font-bold text-ink-primary transition-colors hover:bg-bg-base"
      >
        <span className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-accent-clay" aria-hidden="true" />
          {t("browseCities")}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-normal text-ink-tertiary">
            {currentCity ? labelFor(currentCity) : ""}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-ink-tertiary transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div id={panelId} className="mt-2 space-y-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 start-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("citySearchPlaceholder")}
              aria-label={t("citySearchPlaceholder")}
              className="min-h-10 w-full rounded-sm border border-border-subtle bg-bg-base ps-8 pe-3 text-xs text-ink-primary placeholder:text-ink-tertiary focus:border-accent-clay focus:outline-none"
            />
          </div>

          {/* Bounded height so the list scrolls inside the panel instead of
              pushing the rest of the mobile menu off-screen. */}
          <div className="max-h-[45vh] overflow-y-auto overscroll-contain rounded-sm border border-border-subtle bg-bg-base">
            {totalMatches === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-ink-secondary">
                {t("citySearchNoResults")}
              </p>
            ) : (
              visibleGroups.map((group) => (
                <div key={group.id} className="border-b border-border-subtle last:border-b-0">
                  <p className="sticky top-0 z-[1] bg-bg-muted px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
                    {group.label}
                  </p>
                  {group.options.map((option) => {
                    const isCurrent = currentCity === option.city;
                    return (
                      <button
                        key={option.slug}
                        type="button"
                        onClick={() => commit(option)}
                        aria-current={isCurrent ? "true" : undefined}
                        className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 text-start text-xs font-bold transition-colors ${
                          isCurrent
                            ? "bg-accent-clay-soft text-accent-clay"
                            : "text-ink-primary hover:bg-bg-muted"
                        }`}
                      >
                        <span>{option.label}</span>
                        {isCurrent && <Check className="h-3.5 w-3.5 text-accent-clay" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NavbarMobileCitySelect;
