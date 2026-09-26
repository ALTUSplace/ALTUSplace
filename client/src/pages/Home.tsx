import { Link, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/OptimizedImage';
import { Search, Car, ShieldCheck, ArrowRight, CheckCircle2, Award, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { LISTINGS } from '@/data/altusplace';
import { SmartRecommendations } from '@/components/SmartRecommendations';
import { FAQSection } from '@/components/FAQSection';
import { ListingCard } from '@/components/ui/ListingCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { useFavorites } from '@/hooks/useFavorites';
import { CatalogShowcase } from '@/components/CatalogShowcase';
import { SearchBar } from '@/components/SearchBar';
import { isCarCategory, isPropertyCategory } from '@/lib/categories';
import { useSEO } from '@/lib/seo';

/**
 * Hero backdrop.
 *
 * Deliberately an asset the repo already ships and documents (see
 * `data/catalog.ts`) instead of a freshly sourced stock photo: every candidate
 * image host reachable from the build environment is auth-walled, so a new photo
 * could not be visually confirmed before being committed. This constant is the
 * single swap point for the licensed brand photograph.
 *
 * TODO(marketing): replace with authentic Moroccan context — a Casablanca
 * skyline blended into a luxury apartment interior, or a happy Moroccan family
 * — once the marketing team supplies licensed brand photography. The current
 * asset reads aspirational-generic, which undercuts the local-trust signal the
 * hero copy is trying to build. Swap this constant only; nothing else in the
 * hero depends on the specific photograph beyond the scrim floor documented on
 * the backdrop element below.
 */
const HERO_BACKDROP =
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=1920';

/** The competitor's 3-step search flow: type → location → search. */
const HERO_STEPS = [
  { n: 1, labelKey: 'heroStepType' },
  { n: 2, labelKey: 'heroStepLocation' },
  { n: 3, labelKey: 'heroStepSearch' },
] as const;

/** Photographic category rail. Each card deep-links into the search results. */
const HERO_CATEGORIES = [
  {
    labelKey: 'heroCatLuxuryCars',
    href: '/search?type=car',
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=800',
  },
  {
    labelKey: 'heroCatFurnishedApts',
    href: '/search?type=property',
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=800',
  },
  {
    labelKey: 'heroCatFamilyVillas',
    href: '/search?type=property',
    image: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800',
  },
] as const;

export default function Home() {
  const [, setLocation] = useLocation();
  const { t, direction } = useLanguage();
  const favorites = useFavorites();

  useSEO({
    title: 'كراء السيارات والعقارات في المغرب | ALTUSplace',
    description: 'احجز سيارات وعقارات للكراء في المغرب بضمان المنصة ودفع آمن: أسعار واضحة ووكالات محلية موثوقة.',
    path: '/',
    type: 'website',
  });

  // The flow's connector points along the reading direction, so it mirrors in
  // Arabic rather than assuming a left-to-right progression.
  const FlowChevron = direction === 'rtl' ? ChevronLeft : ChevronRight;

  // Database listings formatted as unified car items
  const { data: dbListings = [] } = trpc.listings.list.useQuery();
  const activeListings = dbListings.length > 0 ? dbListings
    .filter(item => isCarCategory(item.category))
    .map(item => ({
    id: String(item.id),
    title: item.title,
    category: t('listingCategoryCar'),
    type: 'car' as const,
    pricePerUnit: item.pricePerDay,
    image: item.images?.[0] || item.imageUrl || '',
    images: item.images?.length ? item.images : item.imageUrl ? [item.imageUrl] : [],
    city: item.city || 'الدار البيضاء',
    providerName: t('providerNamePlaceholder'),
    year: item.year ?? undefined,
    rating: item.averageRating ?? 0,
    reviewCount: item.reviewCount ?? 0,
    specs: {
      transmission: item.transmission || t('transmissionAutomatic'),
      fuel: item.fuelType || t('fuelDieselPetrol'),
      seats: item.seats ? String(item.seats) : undefined
    }
  })) : [];

  const activeProperties = dbListings.length > 0 ? dbListings
    .filter(item => isPropertyCategory(item.category))
    .map(item => ({
      id: String(item.id),
      title: item.title,
      category: item.category,
      type: 'property' as const,
      pricePerUnit: item.pricePerDay,
      image: item.images?.[0] || item.imageUrl || '',
      images: item.images?.length ? item.images : item.imageUrl ? [item.imageUrl] : [],
      city: item.city || 'الدار البيضاء',
      providerName: item.ownerName || 'وكالة عقارية',
      year: item.year ?? undefined,
      rating: item.averageRating ?? 0,
      reviewCount: item.reviewCount ?? 0,
      specs: {
        rooms: item.rooms && item.rooms > 0 ? String(item.rooms) : undefined,
        area: item.area && item.area > 0 ? `${item.area} m²` : undefined,
      }
    })) : LISTINGS.filter(item => item.type === 'property');

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary flex flex-col" dir={direction}>

      {/* ── Hero: photographic backdrop, glass search card, numbered flow ── */}
      <section className="relative isolate overflow-hidden bg-ink-primary" aria-labelledby="hero-heading">
        {/* Backdrop photograph. alt is empty because it is decorative — the
            heading beside it carries the message.

            Scrim contract: the darkest-to-lightest stop here is a FLOOR of 0.75,
            not a stylistic choice, and it may not be lowered without a fresh
            contrast measurement. The hero H1 is pure white on a photo whose
            brightest regions are near-white; the two failures that follow from
            a thin scrim are (a) the headline and (b) the 10-11px field captions
            in the glass search card, which need 4.5:1 and have no weight to
            spare. Measured on the brightest crop of this asset, the old
            via-black/70 midpoint put the white H1 at ~3.3:1 — under AA — and a
            flat 0.40 scrim (the value first proposed for this redesign) put it
            at 2.85:1. Hence 0.85 -> 0.75 -> 0.90: the raised midpoint keeps
            every text stop >= 4.5:1 even where the photo is pure white, and
            keeps the 0.90 foot opaque enough that the category rail's leading
            edge never washes out. If you lower any stop, re-measure contrast
            against the *brightest* crop, not the average. */}
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <OptimizedImage
            src={HERO_BACKDROP}
            alt=""
            width={1920}
            height={1080}
            sizes="100vw"
            fetchPriority="high"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/75 to-black/90" />
        </div>

        <div className="container mx-auto max-w-6xl px-4 pt-10 pb-12 md:pt-16 md:pb-16">
          <div className="flex flex-col items-center text-center">

            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur-md sm:text-sm">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t('heroBadge')}</span>
            </div>

            <h1
              id="hero-heading"
              className="mt-5 max-w-3xl font-display text-[clamp(1.75rem,5.5vw,3.5rem)] font-bold leading-[1.15] text-white text-balance"
            >
              {t('heroTitlePrefix')} {t('heroTitleCars')}
              {t('heroTitleSuffix')}
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/90 sm:text-base md:text-lg">
              {t('heroDescription')}
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <Button
                onClick={() => setLocation('/search')}
                className="b2-press rounded-lg bg-accent-clay px-6 py-3 text-sm font-bold text-[var(--primary-ink)] shadow-[var(--shadow-clay)] transition-colors hover:bg-accent-clay-hover"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>{t('heroSearchCta')}</span>
              </Button>
              <Button
                onClick={() => setLocation('/search')}
                variant="outline"
                className="b2-press rounded-lg border border-white/40 bg-white/10 px-6 py-2.5 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white/20"
              >
                <Award className="h-4 w-4" aria-hidden="true" />
                <span>{t('heroReviewButton')}</span>
              </Button>
              <span className="hidden items-center gap-1.5 text-xs font-bold text-white/90 md:inline-flex">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t('trustTitle1')}
              </span>
            </div>

            {/* Numbered flow — the <ol> carries the ordering for assistive tech,
                so each numeral is decorative and hidden from it. The connector
                chevron flips with `direction` because the reading order of the
                flow is not fixed between Arabic and French. */}
            <ol className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 sm:gap-x-3">
              {HERO_STEPS.map((step, index) => (
                <li key={step.n} className="flex items-center gap-2 sm:gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md sm:text-sm">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-clay text-[11px] font-extrabold text-[var(--primary-ink)]"
                    >
                      {step.n}
                    </span>
                    {t(step.labelKey)}
                  </span>
                  {index < HERO_STEPS.length - 1 && (
                    <FlowChevron
                      className="hidden h-4 w-4 shrink-0 text-white/85 sm:block"
                      aria-hidden="true"
                    />
                  )}
                </li>
              ))}
            </ol>

            {/* Glass search card — tabs switch in place, no reload. */}
            <div className="mt-8 w-full">
              <SearchBar variant="heroOverlay" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Category showcase: photographic rail below the search card ── */}
      <section className="container mx-auto max-w-6xl px-4 py-10 md:py-14" aria-labelledby="hero-showcase-title">
        <div className="mb-5 flex flex-col gap-2 md:mb-7">
          <span className="section-index">{t('heroShowcaseBadge')}</span>
          <h2 id="hero-showcase-title" className="text-xl font-bold text-ink-primary sm:text-2xl md:text-3xl">
            {t('heroShowcaseTitle')}
          </h2>
        </div>

        {/* Scroll-snap rail. Card width is viewport-relative so the next card
            peeks at 375px, which is the affordance that tells a touch user the
            row scrolls; on desktop the three cards settle side by side. */}
        <ul className="pill-rail no-scrollbar">
          {HERO_CATEGORIES.map((category) => (
            <li
              key={category.labelKey}
              className="w-[72vw] max-w-[17rem] shrink-0 snap-start sm:w-[18rem] sm:max-w-none"
            >
              <Link
                href={category.href}
                className="group block overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-xs transition-shadow duration-300 hover:shadow-lg"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden">
                  <OptimizedImage
                    src={category.image}
                    alt={t(category.labelKey)}
                    width={640}
                    height={480}
                    sizes="(max-width: 640px) 72vw, (max-width: 1024px) 45vw, 30vw"
                    className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                  />
                </div>
                <div className="border-t-2 border-accent-clay/70 p-4">
                  <h3 className="text-sm font-bold leading-snug text-ink-primary transition-colors group-hover:text-accent-clay">
                    {t(category.labelKey)}
                  </h3>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Static 2026 catalog showcase (always visible, DB-independent) ── */}
      <CatalogShowcase />

      {/* ── Bento Grid Section (Separating Cars and Properties cleanly) ── */}
      <section className="py-10 md:py-16 px-4 container mx-auto max-w-6xl">
        <div className="mb-8 md:mb-12 max-w-xl">
          <span className="section-index">{t('bentoBadge')}</span>
          <h2 className="mt-3 text-2xl md:text-3xl font-bold text-ink-primary">{t('bentoTitle')}</h2>
          <p className="mt-2 text-ink-secondary text-sm leading-relaxed">{t('bentoSubtitle')}</p>
        </div>

        {/* Asymmetric bento: full-width fleet panel */}
        <div className="grid grid-cols-1 gap-5">
          <Link href="/search?type=car" className="md:col-span-3 group relative flex flex-col justify-between overflow-hidden bg-ink-primary dark:bg-[#1C1C1E] text-white p-6 md:p-9 rounded-lg shadow-lg min-h-[26rem]">
            <div className="absolute -right-16 -top-16 h-56 w-56 rotate-12 corner-cut-sm bg-accent-clay/15" aria-hidden="true" />
            <div className="relative z-10 space-y-5 max-w-lg">
              <div className="w-12 h-12 corner-cut-sm bg-accent-clay flex items-center justify-center text-white shadow-[var(--shadow-clay)]">
                <Car className="w-6 h-6" />
              </div>
              <h3 className="text-2xl md:text-3xl font-bold leading-tight">{t('bentoFleetTitle')}</h3>
              <p className="text-white/70 text-sm leading-relaxed">{t('bentoFleetDescription')}</p>
              <span className="b2-press corner-cut-sm inline-flex items-center gap-2 rounded-sm bg-accent-clay px-5 py-2.5 text-xs font-extrabold text-white transition-colors group-hover:bg-accent-clay-hover shadow-[var(--shadow-clay)]">
                {t('browseCarsAvailable')}
                <ArrowRight className="w-4 h-4" />
              </span>
            </div>
            <div className="relative z-10 mt-8 max-w-md self-start lg:self-auto lg:ms-auto lg:mt-0">
              <OptimizedImage
                src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=800"
                alt={t('bentoFleetTitle')}
                className="corner-cut-sm object-cover h-40 sm:h-48 w-full shadow-md group-hover:-translate-y-1 transition-transform duration-500 border border-white/10"
                loading="lazy"
                decoding="async"
                width={800}
                height={640}
              />
            </div>
          </Link>
        </div>
      </section>

      {/* Featured Listing Cards Section */}
      <section className="py-10 md:py-16 px-4 container mx-auto max-w-6xl border-t border-border-subtle">
        <PageHeader
          eyebrow={t('featuredListingsBadge')}
          title={t('featuredListingsTitle')}
          action={{ label: t('viewAllListings'), href: '/search' }}
        />

        {/* Listing Cards Grid */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {activeListings.slice(0, 6).map((item, index) => (
            <ListingCard
              key={item.id}
              id={item.id}
              title={item.title}
              city={item.city}
              pricePerDay={item.pricePerUnit}
              images={item.images}
              type="car"
              rating={(item as { rating?: number }).rating ?? 0}
              reviewCount={(item as { reviewCount?: number }).reviewCount ?? 0}
              specs={{
                transmission: (item as { specs?: { transmission?: string } }).specs?.transmission,
                fuel: (item as { specs?: { fuel?: string } }).specs?.fuel,
                seats: (item as { specs?: { seats?: string } }).specs?.seats ? Number((item as { specs?: { seats?: string } }).specs?.seats) : undefined,
                year: (item as { year?: number }).year ?? undefined,
              }}
              isFavorite={favorites.isFavorite(Number(item.id))}
              onToggleFavorite={() => favorites.toggleFavorite(Number(item.id))}
              className={`stagger-${Math.min(index + 1, 8)} animate-fade-up`}
            />
          ))}
        </div>
      </section>

      {/* Featured Properties Section */}
      <section className="py-10 md:py-16 px-4 container mx-auto max-w-6xl border-t border-border-subtle">
        <PageHeader
          eyebrow={t('featuredPropertiesBadge')}
          title={t('featuredPropertiesTitle')}
          action={{ label: t('featuredPropertiesAction'), href: '/search?type=property' }}
        />

        {activeProperties.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {activeProperties.slice(0, 6).map((item, index) => (
              <ListingCard
                key={item.id}
                id={item.id}
                title={item.title}
                city={item.city}
                pricePerDay={item.pricePerUnit}
                images={item.images}
                type="property"
                rating={(item as { rating?: number }).rating ?? 0}
                reviewCount={(item as { reviewCount?: number }).reviewCount ?? 0}
                specs={{
                  rooms: item.specs?.rooms ? Number(item.specs.rooms) : undefined,
                  area: item.specs?.area,
                  year: (item as { year?: number }).year ?? undefined,
                }}
                isFavorite={Number.isFinite(Number(item.id)) ? favorites.isFavorite(Number(item.id)) : false}
                onToggleFavorite={Number.isFinite(Number(item.id)) ? () => favorites.toggleFavorite(Number(item.id)) : undefined}
                className={`stagger-${Math.min(index + 1, 8)} animate-fade-up`}
              />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-border-default bg-bg-surface p-10 text-center text-sm text-ink-secondary">
            {t('noPropertiesYet')}
          </div>
        )}
      </section>

      {/* Featured Blog Section */}
      <section className="py-10 md:py-16 bg-bg-muted/60 mt-6 md:mt-12 border-y border-border-subtle">
        <div className="container mx-auto max-w-6xl px-4 space-y-8">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
            <div className="max-w-xl">
              <span className="section-index">{t('blogBadge')}</span>
              <h2 className="mt-3 text-xl sm:text-2xl md:text-3xl font-bold text-ink-primary">{t('blogTitle')}</h2>
            </div>
            <Link href="/blog">
              <Button variant="outline" className="b2-press corner-cut-sm rounded-sm border border-border-default bg-bg-surface text-ink-primary hover:border-accent-clay hover:text-accent-clay text-xs font-bold gap-2 shadow-xs">
                <span>{t('browseAllArticles')}</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              {
                img: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800',
                alt: t('blogCard1Title'),
                tag: t('blogTravelGuideTag'),
                title: t('blogCard1Title'),
                desc: t('blogCard1Description'),
              },
              {
                img: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=800',
                alt: t('blogCard3Title'),
                tag: t('blogDrivingTipsTag'),
                title: t('blogCard3Title'),
                desc: t('blogCard3Description'),
              },
            ].map((post) => (
              <Link href="/blog" key={post.title} className={`bg-bg-surface rounded-lg overflow-hidden shadow-xs border border-border-subtle hover:-translate-y-1.5 hover:shadow-lg hover:border-border-default transition-all duration-300 flex flex-col group`}>
                <div className="h-40 sm:h-48 overflow-hidden relative">
                  <OptimizedImage src={post.img} alt={post.alt} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-primary/25 to-transparent" aria-hidden="true" />
                </div>
                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between gap-3 border-t-2 border-accent-clay/70">
                  <div>
                    <span className="text-[11px] font-bold text-accent-clay tracking-wide">{post.tag}</span>
                    <h3 className="mt-1.5 font-bold text-ink-primary text-base leading-snug group-hover:text-accent-clay transition-colors">{post.title}</h3>
                    <p className="mt-2 text-xs text-ink-secondary leading-relaxed line-clamp-2">{post.desc}</p>
                  </div>
                  <span className="link-underline text-xs font-bold text-ink-primary flex items-center gap-1 pt-2 w-fit">
                    {t('readMore')} <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <FAQSection />

      {/* Trust & Features Banner */}
      <section className="py-12 md:py-16 bg-ink-primary dark:bg-[#1C1C1E] text-white">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mb-8 text-center md:mb-12">
            <span className="section-index justify-center text-white/60">ALTUSplace</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-13 h-13 p-3 corner-cut-sm bg-accent-clay flex items-center justify-center text-white shadow-[var(--shadow-clay)]">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-base md:text-lg">{t('trustTitle1')}</h4>
              <p className="text-xs text-white/70 max-w-xs leading-relaxed">{t('trustDesc1')}</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-3 md:border-s md:border-e md:border-white/10">
              <div className="w-13 h-13 p-3 corner-cut-sm bg-accent-clay flex items-center justify-center text-white shadow-[var(--shadow-clay)]">
                <Award className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-base md:text-lg">{t('trustTitle2')}</h4>
              <p className="text-xs text-white/70 max-w-xs leading-relaxed">{t('trustDesc2')}</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-13 h-13 p-3 corner-cut-sm bg-accent-clay flex items-center justify-center text-white shadow-[var(--shadow-clay)]">
                <Clock className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-base md:text-lg">{t('trustTitle3')}</h4>
              <p className="text-xs text-white/70 max-w-xs leading-relaxed">{t('trustDesc3')}</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
