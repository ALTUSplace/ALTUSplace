import * as React from "react";
import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Car, Home, MapPin, Star, Heart, Fuel, Settings, Users, Award, Zap, CheckCircle2, Calendar, Ruler } from "lucide-react";

import { cn } from "@/lib/utils";
import { OptimizedImage } from "@/components/OptimizedImage";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { PartnerVerifiedBadge } from "@/components/ui/PartnerVerifiedBadge";

export interface ListingCardProps {
  id: string;
  title: string;
  titleFr?: string;
  city: string;
  pricePerDay: number;
  unitLabel?: string;
  currency?: string;
  images: string[];
  type: "car" | "property";
  badges?: Array<"top-host" | "premium" | "instant-book" | "featured" | "superhost">;
  /** True when the listing owner is an onboarded ALTUSplace partner account. */
  providerVerified?: boolean;
  rating?: number;
  reviewCount?: number;
  hostName?: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  specs?: { transmission?: string; fuel?: string; seats?: number; rooms?: number; area?: string; year?: number };
  /** Optional search dates carried through to the detail page for 1-tap booking. */
  startDate?: string;
  endDate?: string;
  className?: string;
  style?: React.CSSProperties;
}

const BADGE_CONFIG: Record<
  string,
  { labelKey: string; icon: typeof Award; className: string }
> = {
  "top-host": { labelKey: "badgeTopHost", icon: Award, className: "bg-ink-primary/85 dark:bg-[#1C1C1E]/85 text-white" },
  premium: { labelKey: "badgePremium", icon: Star, className: "bg-accent-clay/90 text-white" },
  "instant-book": { labelKey: "badgeInstant", icon: Zap, className: "bg-accent-green/90 text-white" },
  featured: { labelKey: "badgeFeatured", icon: CheckCircle2, className: "bg-accent-warm text-white" },
  superhost: { labelKey: "badgeSuperhost", icon: Award, className: "bg-accent-clay/90 text-white" },
};

export function ListingCard(props: ListingCardProps) {
  const { id, title, titleFr, city, pricePerDay, unitLabel, currency = "MAD", images, type,
    badges, providerVerified, rating, reviewCount, hostName, isFavorite, onToggleFavorite, specs, startDate, endDate, className, style } = props;
  const [, setLocation] = useLocation();
  const { language, direction, t } = useLanguage();
  const [activeSlide, setActiveSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const { currency: activeCurrency, formatPrice, formatTotalPrice, showTotal } = useCurrency();
  const [imgError, setImgError] = useState<Record<number, boolean>>({});
  const hasImages = images.length > 0;
  const displayImages = hasImages ? images : [""];
  const totalSlides = displayImages.length;
  const safePrice = Number.isFinite(Number(pricePerDay)) ? Number(pricePerDay) : 0;
  const displayTitle = language === "fr" && titleFr ? titleFr : title;
  // Callers that omit unitLabel fall back to a localized per-day suffix.
  const unitText = unitLabel ?? t("unitPerDay");

  const goTo = useCallback((dir: number) => {
    setActiveSlide((prev) => {
      const next = prev + dir;
      if (next < 0) return totalSlides - 1;
      if (next >= totalSlides) return 0;
      return next;
    });
  }, [totalSlides]);

  useEffect(() => {
    if (!isHovered || totalSlides <= 1) return;
    const interval = setInterval(() => setActiveSlide((p) => (p + 1) % totalSlides), 3500);
    return () => clearInterval(interval);
  }, [isHovered, totalSlides]);

  const handleCardClick = () => {
    const basePath = type === "property" ? `/property/${id}` : `/car/${id}`;
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const query = params.toString();
    setLocation(query ? `${basePath}?${query}` : basePath);
  };

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl bg-bg-surface border border-border-subtle",
        "shadow-xs hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer",
        className,
      )}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
      role="link" tabIndex={0} aria-label={`${title} — ${city}`}
      onKeyDown={(e) => { if (e.key === "Enter") handleCardClick(); }}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-accent-clay scale-x-0 origin-start transition-transform duration-300 ease-out group-hover:scale-x-100" aria-hidden="true" />
      <div className="relative aspect-[5/4] overflow-hidden bg-bg-muted">
        <div className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ transform: `translateX(${activeSlide * -100}%)` }}>
          {displayImages.map((src, i) => (
            <div key={i} className="relative h-full w-full shrink-0">
              {src && !imgError[i] ? (
                <OptimizedImage src={src} alt={`${title} — photo ${i + 1}`} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" width={640} height={480} onError={() => setImgError((p) => ({ ...p, [i]: true }))} />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-bg-muted">
                  {type === "car" ? <Car className="h-12 w-12 text-ink-tertiary/60" /> : <Home className="h-12 w-12 text-ink-tertiary/60" />}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-primary/35 via-transparent to-transparent" />
        {(providerVerified || (badges && badges.length > 0)) && (
          <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
            {providerVerified && <PartnerVerifiedBadge />}
            {badges && badges.length > 0 && badges.slice(0, 2).map((badge) => {
              const cfg = BADGE_CONFIG[badge];
              const Icon = cfg.icon;
              return (<span key={badge} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide shadow-md ring-1 ring-white/20 backdrop-blur-md", cfg.className)}><Icon className="h-3 w-3" />{t(cfg.labelKey)}</span>);
            })}
          </div>
        )}
        {onToggleFavorite && (
          <button onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(); }} className="absolute end-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-bg-surface/85 backdrop-blur-sm shadow-sm transition-all duration-200 hover:bg-bg-surface hover:scale-110 active:scale-95" aria-label={isFavorite ? t("ariaRemoveFavorite") : t("ariaAddFavorite")}>
            <Heart className={cn("h-4 w-4 transition-colors", isFavorite ? "fill-accent-red text-accent-red" : "text-ink-secondary")} />
          </button>
        )}
        <div className="absolute bottom-3 start-3">
          <div className="inline-flex items-baseline gap-1.5 rounded-full bg-bg-surface/92 px-3.5 py-1.5 shadow-lg backdrop-blur-md ring-1 ring-white/25">
            <span key={`${activeCurrency}-${showTotal ? "total" : "day"}`} className="price-figure inline-block text-lg text-ink-primary animate-fade-in">{showTotal ? formatTotalPrice(safePrice) : formatPrice(safePrice)}</span>
            <span className="rounded-md bg-accent-clay/12 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-accent-clay" aria-label={currency}>{currency}</span>
            <span className="text-[10px] font-medium text-ink-tertiary">{unitText}</span>
          </div>
        </div>
        {totalSlides > 1 && (<>
          <button onClick={(e) => { e.stopPropagation(); goTo(-1); }} className="absolute start-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-bg-surface/85 shadow-sm backdrop-blur-sm transition-all duration-200 opacity-0 group-hover:opacity-100 hover:bg-bg-surface hover:scale-110" aria-label={t("ariaPreviousImage")}>
            <svg className="h-4 w-4 text-ink-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={direction === "rtl" ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} /></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); goTo(1); }} className="absolute end-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-bg-surface/85 shadow-sm backdrop-blur-sm transition-all duration-200 opacity-0 group-hover:opacity-100 hover:bg-bg-surface hover:scale-110" aria-label={t("ariaNextImage")}>
            <svg className="h-4 w-4 text-ink-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={direction === "rtl" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} /></svg>
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {displayImages.map((_, i) => (<button key={i} onClick={(e) => { e.stopPropagation(); setActiveSlide(i); }} className={cn("h-1.5 rounded-full transition-all duration-300", i === activeSlide ? "w-4 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80")} aria-label={t("ariaGoToImage").replace("{n}", String(i + 1))} />))}
          </div>
        </>)}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-ink-primary transition-colors group-hover:text-accent-clay" title={displayTitle}>{displayTitle}</h3>
          {rating && rating > 0 && (<div className="flex shrink-0 items-center gap-1 text-xs font-medium text-ink-secondary"><Star className="h-3.5 w-3.5 fill-accent-warm text-accent-warm" /><span>{rating.toFixed(1)}</span>{reviewCount ? <span className="text-ink-tertiary">({reviewCount})</span> : null}</div>)}
          {(reviewCount === undefined || reviewCount === 0) && (!rating || rating <= 0) && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5 text-[10px] font-semibold text-ink-tertiary">{t("reviewsNewEmpty")}</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-ink-secondary"><MapPin className="h-3 w-3 text-ink-tertiary" /><span className="line-clamp-1">{city}</span></div>
        {specs && (specs.transmission || specs.fuel || specs.seats || specs.rooms) && (
          <div className="flex flex-wrap gap-2 text-[11px] text-ink-tertiary">
            {specs.transmission && <span className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5"><Settings className="h-3 w-3" /> {specs.transmission}</span>}
            {specs.fuel && <span className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5"><Fuel className="h-3 w-3" /> {specs.fuel}</span>}
            {specs.seats && <span className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5"><Users className="h-3 w-3" /> {specs.seats} seats</span>}
            {specs.rooms && specs.rooms > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5"><Home className="h-3 w-3" /> {specs.rooms} rooms</span>}
            {specs.area && <span className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5"><Ruler className="h-3 w-3" /> {specs.area}</span>}
            {specs.year && <span className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5"><Calendar className="h-3 w-3" /> {specs.year}</span>}
          </div>
        )}
        {hostName && (<div className="mt-auto pt-2 border-t border-border-subtle"><span className="text-[11px] text-ink-tertiary">Hosted by <span className="font-medium text-ink-secondary">{hostName}</span></span></div>)}
      </div>
    </article>
  );
}

// ── Skeleton Variant ─────────────────────────────────────────────────────────

export function ListingCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface", className)}>
      <div className="aspect-[5/4] animate-shimmer bg-skeleton-from" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex justify-between">
          <div className="h-4 w-2/3 animate-shimmer rounded bg-skeleton-from" />
          <div className="h-4 w-12 animate-shimmer rounded bg-skeleton-from" />
        </div>
        <div className="h-3 w-1/2 animate-shimmer rounded bg-skeleton-from" />
        <div className="flex gap-2">
          <div className="h-5 w-16 animate-shimmer rounded bg-skeleton-from" />
          <div className="h-5 w-16 animate-shimmer rounded bg-skeleton-from" />
        </div>
        <div className="mt-2 border-t border-border-subtle pt-2">
          <div className="h-3 w-1/3 animate-shimmer rounded bg-skeleton-from" />
        </div>
      </div>
    </div>
  );
}