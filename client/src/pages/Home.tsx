import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/OptimizedImage';
import { Search, MapPin, Car, ShieldCheck, ArrowRight, CheckCircle2, Award, Clock } from 'lucide-react';
import { LISTINGS } from '@/data/altusplace';
import { SmartRecommendations } from '@/components/SmartRecommendations';
import { FAQSection } from '@/components/FAQSection';
import { ListingCard } from '@/components/ui/ListingCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { isCarCategory, isPropertyCategory } from '@/lib/categories';
import { MOROCCAN_CITIES, cityLabelFr } from '@/data/moroccoCities';
import { toast } from 'sonner';

export default function Home() {
  const [, setLocation] = useLocation();
  const { t, direction, language } = useLanguage();

  // Search states for Cars
  const [carCity, setCarCity] = useState('الدار البيضاء');
  const [pickupDate, setPickupDate] = useState('');
  const [dropoffDate, setDropoffDate] = useState('');

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
    image: item.imageUrl || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800',
    city: item.city || 'الدار البيضاء',
    providerName: t('providerNamePlaceholder'),
    specs: {
      transmission: item.transmission || t('transmissionAutomatic'),
      fuel: item.fuelType || t('fuelDieselPetrol'),
      seats: '5'
    }
  })) : LISTINGS;

  const activeProperties = dbListings.length > 0 ? dbListings
    .filter(item => isPropertyCategory(item.category))
    .map(item => ({
      id: String(item.id),
      title: item.title,
      category: item.category,
      type: 'property' as const,
      pricePerUnit: item.pricePerDay,
      image: item.imageUrl || 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=800',
      city: item.city || 'الدار البيضاء',
      providerName: item.ownerName || 'وكالة عقارية',
      specs: {
        rooms: item.rooms && item.rooms > 0 ? String(item.rooms) : undefined,
      }
    })) : [];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocation(`/search?type=car&city=${encodeURIComponent(carCity)}&startDate=${encodeURIComponent(pickupDate)}&endDate=${encodeURIComponent(dropoffDate)}`);
  };

  // Editorial search field primitives
  const fieldBase =
    'group relative flex flex-1 items-center gap-3 px-4 py-3 text-right transition-colors duration-200 cursor-pointer hover:bg-bg-muted/60 focus-within:bg-bg-muted/60';
  const fieldDivider = 'border-t sm:border-t-0 sm:border-s sm:border-border-subtle';
  const fieldIconClass =
    'shrink-0 h-5 w-5 text-ink-tertiary transition-colors duration-200 group-hover:text-ink-secondary group-focus-within:text-accent-clay';
  const fieldCaptionClass =
    'text-[10px] sm:text-[11px] font-bold tracking-wide text-ink-tertiary transition-colors duration-200 group-focus-within:text-ink-secondary';
  const fieldControlClass =
    'w-full min-w-0 bg-transparent outline-none text-sm font-bold text-ink-primary placeholder:text-ink-tertiary cursor-pointer [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer';

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary flex flex-col" dir={direction}>

      {/* ── Hero: asymmetric editorial composition ── */}
      <section className="relative overflow-hidden border-b border-border-subtle">
        <div className="container mx-auto max-w-6xl px-4 pt-14 pb-14 md:pt-24 md:pb-24">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">

            {/* Copy column — 7/12 with generous, deliberate whitespace */}
            <div className="lg:col-span-7 space-y-7 md:space-y-8">
              <div className="inline-flex items-center gap-2 corner-cut-sm bg-bg-surface border border-border-default px-4 py-2 text-ink-secondary text-sm font-bold shadow-xs">
                <ShieldCheck className="w-4 h-4 text-accent-clay" />
                <span>{t('heroBadge')}</span>
              </div>

              <h1 className="font-display font-bold text-[clamp(2rem,5.2vw,4.25rem)] leading-[1.12] max-w-xl">
                {t('heroTitlePrefix')} <span className="text-accent-clay">{t('heroTitleCars')}</span>
                {t('heroTitleSuffix')}
              </h1>

              <p className="text-ink-secondary text-sm sm:text-base md:text-lg max-w-lg leading-relaxed">
                {t('heroDescription')}
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <Button
                  onClick={() => window.open('/slides_project/cover_slide.html', '_blank')}
                  variant="outline"
                  className="b2-press corner-cut-sm rounded-sm border border-border-default bg-bg-surface px-6 py-2.5 text-sm font-bold text-ink-primary hover:border-accent-clay hover:text-accent-clay shadow-xs"
                >
                  <Award className="w-4 h-4 text-accent-warm" />
                  <span>{t('heroReviewButton')}</span>
                </Button>
                <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-bold text-ink-tertiary">
                  <CheckCircle2 className="w-4 h-4 text-accent-green" />
                  {t('trustTitle1')}
                </span>
              </div>
            </div>

            {/* Visual column — 5/12 framed editorial image */}
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <div className="absolute -top-5 -left-5 hidden h-full w-full corner-cut-sm bg-bg-muted sm:block" aria-hidden="true" />
                <div className="relative corner-cut overflow-hidden border border-border-subtle bg-bg-surface shadow-lg">
                  <OptimizedImage
                    src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=900"
                    alt={t('bentoFleetTitle')}
                    width={700}
                    height={700}
                    className="aspect-[4/5] w-full object-cover"
                  />
                </div>
                <div className="absolute bottom-5 start-5 inline-flex items-center gap-2 corner-cut-sm bg-bg-surface/95 px-4 py-2.5 shadow-md border border-border-subtle">
                  <ShieldCheck className="w-4 h-4 text-accent-clay" />
                  <span className="text-xs font-bold text-ink-primary">{t('trustTitle1')}</span>
                </div>
              </div>
            </div>

            {/* ── Editorial search bar — spans full width below the diptych ── */}
            <div className="lg:col-span-12 mt-2">
              <div className="border border-border-default bg-bg-surface shadow-lg rounded-lg">
                <form onSubmit={handleSearchSubmit} className="flex flex-col lg:flex-row lg:items-stretch">
                  <label className={fieldBase}>
                    <MapPin className={fieldIconClass} strokeWidth={1.5} />
                    <span className="flex min-w-0 flex-1 flex-col items-start text-right">
                      <span className={fieldCaptionClass}>{t('searchCityOdgency')}</span>
                      <select
                        value={carCity}
                        onChange={(e) => setCarCity(e.target.value)}
                        className={fieldControlClass}
                      >
                        {MOROCCAN_CITIES.map((city) => (
                          <option key={city} value={city}>
                            {language === 'fr' ? cityLabelFr(city) : city}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>

                  <label className={`${fieldBase} ${fieldDivider}`}>
                    <span className="flex min-w-0 flex-1 flex-col items-start text-right">
                      <span className={fieldCaptionClass}>{t('searchPickupDate')}</span>
                      <input
                        type="date"
                        value={pickupDate}
                        onChange={(e) => setPickupDate(e.target.value)}
                        className={fieldControlClass}
                      />
                    </span>
                  </label>

                  <label className={`${fieldBase} ${fieldDivider}`}>
                    <span className="flex min-w-0 flex-1 flex-col items-start text-right">
                      <span className={fieldCaptionClass}>{t('searchDropoffDate')}</span>
                      <input
                        type="date"
                        value={dropoffDate}
                        onChange={(e) => setDropoffDate(e.target.value)}
                        className={fieldControlClass}
                      />
                    </span>
                  </label>

                  <div className="flex items-stretch lg:items-center lg:border-s lg:border-border-subtle px-4 py-3 lg:py-0">
                    <button
                      type="submit"
                      aria-label={t('searchSubmitAdvanced')}
                      className="b2-press corner-cut-sm flex w-full items-center justify-center gap-2 rounded-sm bg-accent-clay px-6 py-3 text-sm font-extrabold text-white shadow-[var(--shadow-clay)] transition-colors hover:bg-accent-clay-hover lg:w-auto"
                    >
                      <Search className="h-4 w-4" strokeWidth={2.5} />
                      <span className="lg:hidden 2xl:inline">{t('search')}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bento Grid Section (Separating Cars and Properties cleanly) ── */}
      <section className="py-10 md:py-16 px-4 container mx-auto max-w-6xl">
        <div className="mb-8 md:mb-12 max-w-xl">
          <span className="section-index">{t('bentoBadge')}</span>
          <h2 className="mt-3 text-2xl md:text-3xl font-bold text-ink-primary">{t('bentoTitle')}</h2>
          <p className="mt-2 text-ink-secondary text-sm leading-relaxed">{t('bentoSubtitle')}</p>
        </div>

        {/* Asymmetric bento: full-width fleet panel */}
        <div className="grid grid-cols-1 gap-5">
          <Link href="/search?type=car" className="md:col-span-3 group relative flex flex-col justify-between overflow-hidden bg-ink-primary text-white p-6 md:p-9 rounded-lg shadow-lg min-h-[26rem]">
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
              images={item.image ? [item.image] : []}
              type="car"
              specs={{
                transmission: item.specs?.transmission,
                fuel: item.specs?.fuel,
                seats: item.specs?.seats ? Number(item.specs.seats) : undefined,
              }}
              className={`stagger-${Math.min(index + 1, 8)} animate-fade-up`}
            />
          ))}
        </div>
      </section>

      {/* Featured Properties Section */}
      <section className="py-10 md:py-16 px-4 container mx-auto max-w-6xl border-t border-border-subtle">
        <PageHeader
          eyebrow="عقارات للكراء"
          title="شقق، فيلات ومكاتب معتمدة"
          action={{ label: 'استعرض العقارات', href: '/search?type=property' }}
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
                images={item.image ? [item.image] : []}
                type="property"
                specs={{
                  rooms: item.specs.rooms ? Number(item.specs.rooms) : undefined,
                }}
                className={`stagger-${Math.min(index + 1, 8)} animate-fade-up`}
              />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-border-default bg-bg-surface p-10 text-center text-sm text-ink-secondary">
            لا توجد عقارات معتمدة حالياً — أضف شقتك أو مكتبك من لوحة الوكالة لتظهر هنا.
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
      <section className="py-12 md:py-16 bg-ink-primary text-white">
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