import { Link } from "wouter";
import { MapPin, ArrowLeft } from "lucide-react";
import { CATALOG_ITEMS, type CatalogItem } from "@/data/catalog";
import { isCarCategory } from "@/lib/categories";
import { OptimizedImage } from "@/components/OptimizedImage";

/**
 * Static showcase of the ALTUSplace 2026 catalog (client/src/data/catalog.ts).
 *
 * Rendered directly from the local dataset — not from the database — so the
 * modern showcase entries (apartments, offices, Duster 2026, Clio 2026,
 * Wrangler 2025) are ALWAYS visible on the homepage regardless of seeding or
 * database availability. Cards deep-link to the search experience.
 */
export function CatalogShowcase() {
  return (
    <section className="py-10 md:py-16 px-4 container mx-auto max-w-6xl">
      <div className="mb-8 md:mb-10 flex flex-col gap-2">
        <span className="section-index">Catalog 2026 · كتالوج 2026</span>
        <h2 className="text-2xl md:text-3xl font-bold text-ink-primary">أحدث عروض كتالوج ALTUSplace</h2>
        <p className="text-ink-secondary text-sm leading-relaxed max-w-2xl">
          شقق ومكاتب عصرية وسيارات 2026 محدثة — مواقع دقيقة ومواصفات دقيقة وصور حية.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CATALOG_ITEMS.map((item) => (
          <CatalogCard key={item.slug} item={item} />
        ))}
      </div>
    </section>
  );
}

function CatalogCard({ item }: { item: CatalogItem }) {
  const cover = item.images[0] || item.imageUrl;
  const car = isCarCategory(item.category);
  const property = !car;
  const altText = item.imageCaptions.find((caption) => caption.url === cover)?.captionAr ?? item.title;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-sm transition-shadow hover:shadow-md">
      <div className="relative overflow-hidden">
        <OptimizedImage
          src={cover}
          alt={altText}
          widthHint={760}
          className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          loading="lazy"
          decoding="async"
        />
        <span className="absolute start-3 top-3 inline-flex items-center rounded-full bg-bg-surface/95 px-3 py-1 text-[11px] font-extrabold text-ink-primary shadow-sm border border-border-subtle">
          {car ? "سيارة · Car" : "عقار · Property"}
        </span>
        {!!item.year && (
          <span className="absolute end-3 top-3 inline-flex items-center rounded-full bg-accent-clay px-3 py-1 text-[11px] font-extrabold text-white shadow-sm">
            {item.year}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="font-bold leading-snug text-ink-primary">{item.title}</h3>

        <p className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-secondary">
          <MapPin className="h-3.5 w-3.5 text-accent-clay" />
          {item.city}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {item.features.slice(0, 3).map((feature) => (
            <span
              key={feature}
              className="rounded-full border border-border-subtle bg-bg-muted/60 px-2.5 py-1 text-[10px] font-bold text-ink-tertiary"
            >
              {feature}
            </span>
          ))}
        </div>

        <div className="mt-auto space-y-2 pt-1">
          {property && !!item.pricePerMonth ? (
            <p className="text-sm font-bold text-ink-primary">
              <span className="text-lg font-extrabold text-accent-clay">{item.pricePerMonth.toLocaleString("fr-MA")}</span>{" "}
              درهم / شهر
            </p>
          ) : (
            <p className="text-sm font-bold text-ink-primary">
              <span className="text-lg font-extrabold text-accent-clay">{item.pricePerDay.toLocaleString("fr-MA")}</span>{" "}
              درهم / يوم
            </p>
          )}
          {car && (
            <p className="text-[11px] font-bold text-ink-tertiary">
              {item.transmission} · {item.seats} مقاعد · {item.fuelType}
            </p>
          )}
          {property && (
            <p className="text-[11px] font-bold text-ink-tertiary">
              {!!item.rooms && item.rooms > 0 ? `${item.rooms} غرف · ` : ""}
              {!!item.area && item.area > 0 ? `${item.area} m²` : ""}
            </p>
          )}
          <Link
            href={property ? "/search?type=property" : "/search?type=car"}
            className="b2-press mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent-clay px-4 py-2.5 text-xs font-extrabold text-white shadow-[var(--shadow-clay)] transition-colors hover:bg-accent-clay-hover"
          >
            عرض العروض
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}