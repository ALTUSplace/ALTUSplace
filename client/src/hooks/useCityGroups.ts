/**
 * Single source of truth for the grouped city catalogue consumed by BOTH city
 * pickers — the desktop dropdown (NavbarCitySelect) and the mobile accordion
 * (NavbarMobileCitySelect). They share this hook rather than each building
 * their own list so the two can never drift out of sync.
 *
 * Group order: the popular shortlist first, then the remaining regions
 * alphabetically. VERIFIED at 375/768/1024/1280px by
 * scripts/verify-city-selector-responsive.mjs and
 * scripts/audit-city-accordion-geometry.mjs.
 *
 * The shortlist is editorial, not derived from booking volume: no
 * bookings-by-city aggregate exists in this codebase. See the note in
 * moroccoCities.ts.
 */
import { useCallback, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  MOROCCO_REGIONS,
  POPULAR_MOROCCO_CITIES,
  cityLabelFr,
  slugForCity,
} from "@/data/moroccoCities";

export type CityOption = {
  /** Canonical Arabic city name — also the value stored on listings. */
  city: string;
  /** Canonical latin slug, used for /search?city=<slug> and /locations/<slug>. */
  slug: string;
  label: string;
};

export type CityGroup = {
  id: string;
  label: string;
  options: CityOption[];
};

/**
 * Builds the city groups shared by every city picker in the chrome:
 * a pinned "popular cities" shortlist followed by the nationwide catalogue
 * grouped by Morocco's 12 administrative regions, sorted alphabetically by
 * region name so the order is stable and scannable.
 *
 * Lives in a hook rather than in a component so the desktop dropdown and the
 * mobile accordion cannot drift apart — both render the same groups, the same
 * labels and the same slugs.
 */
export function useCityGroups() {
  const { language, t } = useLanguage();
  const isFr = language === "fr";

  const labelFor = useCallback(
    (city: string) => (isFr ? cityLabelFr(city) : city),
    [isFr]
  );

  const groups = useMemo<CityGroup[]>(() => {
    const popularOptions: CityOption[] = POPULAR_MOROCCO_CITIES.map((city) => ({
      city,
      slug: slugForCity(city),
      label: labelFor(city),
    })).filter((option) => option.slug !== "");

    const regionGroups: CityGroup[] = [...MOROCCO_REGIONS]
      .sort((a, b) => labelFor(a.name).localeCompare(labelFor(b.name), isFr ? "fr" : "ar"))
      .map((region) => ({
        id: `region-${region.name}`,
        label: isFr ? region.nameFr : region.name,
        options: region.cities.map((city) => ({
          city,
          slug: slugForCity(city),
          label: labelFor(city),
        })),
      }));

    return [{ id: "popular", label: t("popularCities"), options: popularOptions }, ...regionGroups];
  }, [isFr, labelFor, t]);

  /** Flattened options in render order — the order keyboard navigation walks. */
  const flatOptions = useMemo(() => groups.flatMap((group) => group.options), [groups]);

  return { groups, flatOptions, labelFor, isFr };
}

/**
 * Case/diacritic-insensitive filter over city labels, so typing "fes", "Fès"
 * or "فاس" all narrow to the same city. Arabic and Latin are both handled by
 * normalising to lowercase and stripping the Arabic diacritics.
 */
export function filterCityGroups(groups: CityGroup[], query: string): CityGroup[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return groups;
  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => {
        const label = option.label.toLowerCase();
        const latin = cityLabelLatin(option.city);
        return label.includes(trimmed) || latin.includes(trimmed);
      }),
    }))
    .filter((group) => group.options.length > 0);
}

function cityLabelLatin(city: string): string {
  return cityLabelFr(city).toLowerCase();
}
