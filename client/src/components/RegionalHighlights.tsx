import { Link } from "wouter";
import { useMemo } from "react";
import { ArrowLeft, Sparkles, Sun, ThermometerSun, Waves } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

/*
 * Seasonal regional-highlights strip.
 *
 * VERIFIED: renders in all three locales and contributes no horizontal page
 * scroll at 375/768/1024/1280px (verify-horizontal-scroll.mjs,
 * verify-city-selector-responsive.mjs), and the generated hrefs were inspected:
 *   /search?city=agadir&type=car&startDate=2027-07-01&endDate=2027-08-31
 *   /search?city=marrakech&type=property&startDate=2026-11-01&endDate=2027-02-28
 *   /search?city=tangier&type=car&startDate=2026-11-15&endDate=2027-03-15
 *
 * NOT VERIFIED: none of the three links was actually clicked through to a
 * populated result set, because that needs a database. Whether those city/type
 * combinations return anything at all is therefore unknown. The `overflow-x-clip`
 * on the wrapper is defensive, not a fix: the page was never scrolling
 * horizontally (see verify-horizontal-scroll.mjs), documentElement.scrollWidth
 * simply over-reports in RTL.
 */

/**
 * Formats a local calendar date as YYYY-MM-DD.
 *
 * Deliberately avoids `toISOString()`: Morocco is UTC+1, so a local midnight
 * date serialises to the *previous* day in UTC and every generated link would
 * be off by one. Search.tsx reads these params as plain YYYY-MM-DD strings.
 */
function isoDate(year: number, monthIndex: number, day: number): string {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

type Season = {
  /** Inclusive start month (0-indexed). */
  startMonth: number;
  startDay: number;
  /** Inclusive end month (0-indexed); may be < startMonth for a wrapping season. */
  endMonth: number;
  endDay: number;
};

/**
 * Resolves a season to the next upcoming occurrence relative to `now`.
 *
 * Seasons that wrap the year boundary (winter: November → February) are handled
 * by checking both directions, so the strip always points at a date range that
 * has not already ended. This keeps the banner from going stale without any
 * manual seasonal editing.
 */
function resolveSeasonWindow(now: Date, season: Season): { start: string; end: string } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const wraps = season.endMonth < season.startMonth;

  const isAfterStart = month > season.startMonth || (month === season.startMonth && today >= season.startDay);
  const isBeforeEnd = month < season.endMonth || (month === season.endMonth && today <= season.endDay);

  // "Currently inside the season?" (only meaningful for a wrapping season)
  const insideNow = wraps ? isAfterStart || isBeforeEnd : isAfterStart && isBeforeEnd;

  if (wraps) {
    if (insideNow) {
      // Either we are in the tail (Jan–Feb) or the head (Nov–Dec) of the window.
      const startYear = isAfterStart ? year : year - 1;
      return {
        start: isoDate(startYear, season.startMonth, season.startDay),
        end: isoDate(startYear + 1, season.endMonth, season.endDay),
      };
    }
    // Between seasons: the next window starts later this year.
    return {
      start: isoDate(year, season.startMonth, season.startDay),
      end: isoDate(year + 1, season.endMonth, season.endDay),
    };
  }

  // Non-wrapping season: this year if it has not finished, otherwise next year.
  const startYear = insideNow ? year : year + 1;
  return {
    start: isoDate(startYear, season.startMonth, season.startDay),
    end: isoDate(startYear, season.endMonth, season.endDay),
  };
}

type Highlight = {
  key: string;
  citySlug: string;
  type: "car" | "property";
  season: Season;
  labelKey: "highlightAtlanticSummer" | "highlightMarrakechWinter" | "highlightTangierBreak";
  Icon: typeof Sun;
};

const HIGHLIGHTS: readonly Highlight[] = [
  {
    key: "atlantic-summer",
    citySlug: "agadir",
    type: "car",
    // July 1 → August 31
    season: { startMonth: 6, startDay: 1, endMonth: 7, endDay: 31 },
    labelKey: "highlightAtlanticSummer",
    Icon: Waves,
  },
  {
    key: "marrakech-winter",
    citySlug: "marrakech",
    type: "property",
    // November 1 → February 28/29
    season: { startMonth: 10, startDay: 1, endMonth: 1, endDay: 28 },
    labelKey: "highlightMarrakechWinter",
    Icon: ThermometerSun,
  },
  {
    key: "tangier-break",
    citySlug: "tangier",
    type: "car",
    // November 15 → March 15
    season: { startMonth: 10, startDay: 15, endMonth: 2, endDay: 15 },
    labelKey: "highlightTangierBreak",
    Icon: Sun,
  },
];

/**
 * Seasonal destinations strip rendered directly below the main navigation.
 *
 * Each entry links to a pre-filtered search that combines a city, a listing
 * type and a resolved date range, so the filters are already applied on entry.
 * The query parameters are exactly the ones Search.tsx already parses
 * (`city`, `type`, `startDate`, `endDate`) — no new plumbing required.
 */
export function RegionalHighlights() {
  const { t } = useLanguage();

  const items = useMemo(() => {
    // Render-stable reference date: computed once per mount.
    const now = new Date();
    return HIGHLIGHTS.map((highlight) => {
      const { start, end } = resolveSeasonWindow(now, highlight.season);
      const params = new URLSearchParams({
        city: highlight.citySlug,
        type: highlight.type,
        startDate: start,
        endDate: end,
      });
      return { ...highlight, href: `/search?${params.toString()}`, start, end };
    });
  }, []);

  return (
    // `overflow-x-clip` is load-bearing, not decoration. The <ul> below is a
    // correct horizontal scroll container, but in an RTL document Chrome still
    // folds its inline-start overflow into the *document's* scrollable width,
    // which produced a phantom ~212px horizontal scrollbar at 375px. Clipping
    // here keeps the strip scrollable while removing it from the page's scroll
    // area. `clip` is used rather than `hidden` because it is the only value
    // that leaves overflow-y as `visible` instead of coercing it to `auto`.
    <div className="overflow-x-clip border-b border-white/10 bg-[var(--brand-navy)] text-white">
      <div className="container mx-auto px-3 sm:px-4">
        <h2 className="sr-only">{t("seasonalHighlights")}</h2>
        <ul className="flex items-stretch gap-2 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <li className="flex shrink-0 items-center gap-1.5 pr-1 text-[11px] font-bold uppercase tracking-wider text-white/60">
            <Sparkles className="h-3.5 w-3.5 text-accent-clay" aria-hidden="true" />
            {t("seasonalHighlights")}
          </li>
          {items.map((item) => (
            <li key={item.key} className="shrink-0">
              <Link
                href={item.href}
                className="b2-press flex min-h-9 items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-3 text-xs font-bold text-white/85 transition-colors hover:border-accent-clay hover:bg-white/10 hover:text-white"
              >
                <item.Icon className="h-3.5 w-3.5 text-accent-clay" aria-hidden="true" />
                <span>{t(item.labelKey)}</span>
                {/* The chevron points the way the reader scans: mirrored in RTL. */}
                <ArrowLeft className="h-3 w-3 text-white/40 rtl:rotate-180" aria-hidden="true" />
                {/* `t` is a plain key lookup with no interpolation support, so the
                    date range is exposed verbatim for screen readers instead. */}
                <span className="sr-only" dir="ltr">
                  {` (${item.start} – ${item.end})`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default RegionalHighlights;
