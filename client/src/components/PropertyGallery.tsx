/**
 * Full-width property gallery carousel.
 *
 * Replaces the previous "one large image + wrapping thumbnail strip" layout.
 * The strip broke onto several rows once a listing had more than ~8 photos,
 * which pushed the description far down the page; the carousel keeps the gallery
 * to a single fixed-height band so the vertical order stays predictable.
 *
 * RTL: the shared shadcn `Carousel` wrapper hardcodes physical offsets
 * (`CarouselContent` → `-ml-4`, `CarouselItem` → `pl-4`). Under `dir="rtl"`
 * those land on the wrong edge and show as a lopsided gutter, so both are
 * overridden to zero here and the slide padding is left to logical properties
 * instead. Embla is put in `"rtl"` mode so `scrollPrev`/`scrollNext` move the
 * slides the way an RTL reader expects, and the arrow glyphs are swapped to
 * match — the arrow direction must never be assumed to be constant.
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { OptimizedImage } from "@/components/OptimizedImage";
import { cn } from "@/lib/utils";

export interface PropertyGalleryProps {
  images: string[];
  /** Listing title — used to build per-slide alt text. */
  title: string;
  /** `"rtl"` flips the carousel direction and the arrow glyphs. */
  direction: "rtl" | "ltr";
  emptyLabel: string;
  className?: string;
}

export function PropertyGallery({
  images,
  title,
  direction,
  emptyLabel,
  className,
}: PropertyGalleryProps) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [selected, setSelected] = useState(0);
  const isRtl = direction === "rtl";
  const count = images.length;
  const hasMultiple = count > 1;

  // Keep the counter and dot state in step with the slide the user lands on,
  // including after a resize re-init (which changes the snap count).
  const syncSelection = useCallback((instance: CarouselApi) => {
    // `CarouselApi` is `EmblaCarouselType | undefined` in this codebase, and the
    // `on` handlers fire with the live instance but the type cannot prove it.
    if (!instance) return;
    setSelected(instance.selectedScrollSnap());
  }, []);

  useEffect(() => {
    if (!api) return;
    syncSelection(api);
    api.on("select", syncSelection);
    api.on("reInit", syncSelection);
    return () => {
      api.off("select", syncSelection);
      api.off("reInit", syncSelection);
    };
  }, [api, syncSelection]);

  if (count === 0) {
    return (
      <div
        className={cn(
          "flex aspect-[16/9] w-full items-center justify-center gap-2 rounded-3xl border border-border-subtle bg-bg-muted text-sm text-ink-secondary",
          className,
        )}
      >
        <Images className="size-5" aria-hidden="true" />
        {emptyLabel}
      </div>
    );
  }

  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className={cn("space-y-3", className)}>
      <Carousel
        opts={{ loop: hasMultiple, align: "start", direction: isRtl ? "rtl" : "ltr" }}
        setApi={setApi}
        aria-label={title}
        // Overrides the wrapper's physical `-ml-4` / `pl-4`, which mis-place the
        // gutter under RTL. One slide fills the viewport, so no gutter is needed.
        className="rounded-3xl"
      >
        <CarouselContent className="-ml-0">
          {images.map((src, index) => (
            <CarouselItem key={`${src}-${index}`} className="pl-0">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl bg-bg-muted sm:aspect-[2/1]">
                <OptimizedImage
                  src={src}
                  alt={`${title} — ${index + 1}`}
                  width={1400}
                  height={700}
                  widthHint={1400}
                  sizes="100vw"
                  // The first slide is the page's Largest Contentful Paint
                  // candidate, so it must not be lazy.
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
                  className="size-full object-cover"
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={() => api?.scrollPrev()}
              aria-label={isRtl ? "الصورة السابقة" : "Image précédente"}
              className="absolute start-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border-subtle bg-background/90 text-ink-primary shadow-lg backdrop-blur transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-clay"
            >
              <PrevIcon className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => api?.scrollNext()}
              aria-label={isRtl ? "الصورة التالية" : "Image suivante"}
              className="absolute end-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border-subtle bg-background/90 text-ink-primary shadow-lg backdrop-blur transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-clay"
            >
              <NextIcon className="size-5" aria-hidden="true" />
            </button>
            {/* Fixed dark scrim, not `bg-ink-primary`: --ink-primary inverts to
                near-white in the dark theme, which would render this white-on-
                white. A constant scrim keeps the ratio over any photo. */}
            <span className="pointer-events-none absolute end-3 top-3 z-10 rounded-full bg-black/70 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
              {selected + 1} / {count}
            </span>
          </>
        )}
      </Carousel>

      {hasMultiple && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {images.map((src, index) => (
            <button
              key={`dot-${src}-${index}`}
              type="button"
              onClick={() => api?.scrollTo(index)}
              aria-label={isRtl ? `الانتقال إلى الصورة ${index + 1}` : `Aller à l'image ${index + 1}`}
              aria-current={index === selected}
              className={cn(
                "h-1.5 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-clay",
                index === selected ? "w-6 bg-accent-clay" : "w-1.5 bg-ink-tertiary/40 hover:bg-ink-tertiary/70",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default PropertyGallery;
