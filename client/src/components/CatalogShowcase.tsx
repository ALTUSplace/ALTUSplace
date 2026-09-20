import { useEffect, useState } from "react";
import { Link } from "wouter";
import { MapPin, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { CATALOG_ITEMS, type CatalogItem } from "@/data/catalog";
import { isCarCategory } from "@/lib/categories";
import { OptimizedImage } from "@/components/OptimizedImage";

/**
 * Static showcase of the ALTUSplace 2026 catalog (client/src/data/catalog.ts).
 *
 * Rendered directly from the local dataset — not from the database — so the
 * modern showcase entries (apartments, Duster 2026, Clio 2026,
 * Wrangler 2025) are ALWAYS visible on the homepage regardless of seeding or
 * database availability. Cards deep-link to the search experience.
 *
 * Each card embeds a light interactive gallery (arrows + dots walk through the
 * listing photos on hover), a prominent price badge, the location tag, feature
 * pills and a clear Details & Booking CTA.
 */
export function CatalogShowcase() {
  return (
    <section className="py-10 md:py-16 px-4 container mx-auto max-w-6xl">
      <div className="mb-8 md:mb-10 flex flex-col gap-2">
        <span className="section-index">Catalog 2026 · كتالوج 2026</span>
        <h2 className="text-2xl md:text-3xl font-bold text-ink-primary">
          أحدث عروض كتالوج ALTUSplace
        </h2>
        <p className="text-ink-secondary text-sm leading-relaxed max-w-2xl">
          شقة معتمدة للكراء اليومي وسيارات 2026 محدثة — مواقع دقيقة ومواصفات
          دقيقة وصور حية.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CATALOG_ITEMS.map(item => (
          <CatalogCard key={item.slug} item={item} />
        ))}
      </div>
    </section>
  );
}

function CatalogCard({ item }: { item: CatalogItem }) {
  const car = isCarCategory(item.category);
  const property = !car;
  const images = item.images.length ? item.images : [item.imageUrl];
  const totalSlides = images.length;
  const [activeSlide, setActiveSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [imgError, setImgError] = useState<Record<number, boolean>>({});

  // Auto-advance the gallery while the card is hovered/focused.
  useEffect(() => {
    if (!isHovered || totalSlides <= 1) return;
    const interval = setInterval(
      () => setActiveSlide(prev => (prev + 1) % totalSlides),
      3500
    );
    return () => clearInterval(interval);
  }, [isHovered, totalSlides]);

  const goTo = (dir: number) => {
    setActiveSlide(prev => (prev + dir + totalSlides) % totalSlides);
  };

  const safeSlide = Math.min(
    Math.max(activeSlide, 0),
    Math.max(totalSlides - 1, 0)
  );
  const activeImage = images[safeSlide];
  const altText =
    item.imageCaptions.find(caption => caption.url === activeImage)
      ?.captionAr ?? item.title;
  const price =
    property && !!item.pricePerMonth
      ? { amount: item.pricePerMonth, unit: "درهم / شهر" }
      : { amount: item.pricePerDay, unit: "درهم / يوم" };

  return (
    <article
      className="group flex flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-sm transition-shadow hover:shadow-md"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <div className="relative overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(${safeSlide * -100}%)` }}
        >
          {images.map((src, i) => (
            <div
              key={`${src}-${i}`}
              className="relative aspect-[16/10] w-full shrink-0"
            >
              {src && !imgError[i] ? (
                <OptimizedImage
                  src={src}
                  alt={
                    item.imageCaptions.find(caption => caption.url === src)
                      ?.captionAr ?? item.title
                  }
                  widthHint={760}
                  className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                  decoding="async"
                  onError={() => setImgError(prev => ({ ...prev, [i]: true }))}
                />
              ) : (
                <div className="flex aspect-[16/10] w-full items-center justify-center bg-bg-muted" />
              )}
            </div>
          ))}
        </div>

        <span className="absolute start-3 top-3 inline-flex items-center rounded-full bg-bg-surface/95 px-3 py-1 text-[11px] font-extrabold text-ink-primary shadow-sm border border-border-subtle">
          {car ? "سيارة · Car" : "عقار · Property"}
        </span>
        {item.badge && (
          <span className="absolute end-3 top-3 inline-flex items-center rounded-full bg-accent-clay px-3 py-1 text-[11px] font-extrabold text-white shadow-sm">
            {item.badge}
          </span>
        )}

        {/* Prominent price badge */}
        <div className="absolute bottom-3 left-3 inline-flex items-baseline gap-1.5 rounded-full bg-bg-surface/92 px-3.5 py-1.5 shadow-lg backdrop-blur-md ring-1 ring-white/25">
          <span className="text-lg font-extrabold leading-none text-accent-clay">
            {price.amount.toLocaleString("fr-MA")}
          </span>
          <span className="text-[11px] font-bold text-ink-primary">
            {price.unit}
          </span>
        </div>

        {totalSlides > 1 && (
          <>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                goTo(-1);
              }}
              aria-label="الصورة السابقة"
              className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-bg-surface/85 shadow-sm backdrop-blur-sm transition-all duration-200 opacity-0 group-hover:opacity-100 hover:bg-bg-surface hover:scale-110"
            >
              <ChevronLeft className="h-4 w-4 text-ink-primary" />
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                goTo(1);
              }}
              aria-label="الصورة التالية"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-bg-surface/85 shadow-sm backdrop-blur-sm transition-all duration-200 opacity-0 group-hover:opacity-100 hover:bg-bg-surface hover:scale-110"
            >
              <ChevronRight className="h-4 w-4 text-ink-primary" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setActiveSlide(i);
                  }}
                  aria-label={`الانتقال إلى الصورة ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === safeSlide ? "w-4 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}
                />
              ))}
            </div>
          </>
        )}
        {totalSlides > 1 && altText && (
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 hidden p-3 text-[10px] font-medium text-white/90 sm:block"
            aria-hidden="true"
          >
            {altText}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="font-bold leading-snug text-ink-primary">
          {item.title}
        </h3>

        <p className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-secondary">
          <MapPin className="h-3.5 w-3.5 text-accent-clay" />
          {item.city}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {item.features.slice(0, 3).map(feature => (
            <span
              key={feature}
              className="rounded-full border border-border-subtle bg-bg-muted/60 px-2.5 py-1 text-[10px] font-bold text-ink-tertiary"
            >
              {feature}
            </span>
          ))}
        </div>

        <div className="mt-auto space-y-2 pt-1">
          {car && (
            <p className="text-[11px] font-bold text-ink-tertiary">
              {item.transmission} · {item.seats} مقاعد · {item.fuelType}
            </p>
          )}
          {property && (
            <p className="text-[11px] font-bold text-ink-tertiary">
              {!!item.rooms && item.rooms > 0 ? `${item.rooms} غرف · ` : ""}
              {!!item.area && item.area > 0 ? `${item.area} m² · ` : ""}
              {!!item.floor && item.floor > 0 ? `الطابق ${item.floor}` : "شقة"}
            </p>
          )}
          <Link
            href={property ? "/search?type=property" : "/search?type=car"}
            className="b2-press mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent-clay px-4 py-2.5 text-xs font-extrabold text-white shadow-[var(--shadow-clay)] transition-colors hover:bg-accent-clay-hover"
          >
            {property ? "عرض التفاصيل والحجز" : "التفاصيل والحجز"}
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
