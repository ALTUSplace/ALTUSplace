import { cn } from "@/lib/utils";
import { BRAND_NAME, BRAND_TAGLINE } from "@/config/brand";

/** Wordmark suffix painted in the accent colour ("ALTUS" + "place"). */
const ACCENT_SUFFIX = "place";

interface BrandMarkProps {
  /** Layout classes for the wrapper (spacing inside a flex row, etc.). */
  className?: string;
  /** Render the "Rent. Drive. Live." tagline beneath the wordmark. */
  withTagline?: boolean;
}

/**
 * The ALTUSplace wordmark — Latin script in every locale.
 *
 * The brand name is product identity, not translatable copy, so it comes from
 * BRAND_NAME (single source of truth) rather than a translation key. The wrapper
 * carries dir="ltr" so an RTL (Arabic) page cannot reorder or flip the Latin
 * mark; the surrounding navigation stays fully localised.
 */
export function BrandMark({ className, withTagline = false }: BrandMarkProps) {
  const hasAccent = BRAND_NAME.toLowerCase().endsWith(ACCENT_SUFFIX);
  const head = hasAccent
    ? BRAND_NAME.slice(0, BRAND_NAME.length - ACCENT_SUFFIX.length)
    : BRAND_NAME;
  const accent = hasAccent ? BRAND_NAME.slice(head.length) : "";

  return (
    <span className={cn("inline-flex flex-col", className)} dir="ltr">
      <span className="font-display font-bold text-lg sm:text-xl leading-none text-ink-primary">
        {head}
        {accent && <span className="font-medium text-accent-clay">{accent}</span>}
      </span>
      {withTagline && (
        <span className="text-[9px] sm:text-[10px] tracking-[0.18em] text-ink-tertiary uppercase -mt-1 font-semibold">
          {BRAND_TAGLINE}
        </span>
      )}
    </span>
  );
}
