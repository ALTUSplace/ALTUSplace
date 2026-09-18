import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { ListingItem } from '@/data/altusplace';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Filter, Star, ShieldCheck, Users, Car as CarIcon, ArrowUpDown, Award, MapPin, Scale, X, Eye, Home, Map, LayoutGrid, Search as SearchIcon } from 'lucide-react';
import { toast } from 'sonner';
import { MapboxSearchMap } from '@/components/MapboxSearchMap';
import { useLanguage } from '@/contexts/LanguageContext';
import { MOROCCO_CENTER, cityToCoords, resolveListingCoords } from '@/lib/mapbox';
import { OptimizedImage } from '@/components/OptimizedImage';
import { ListingCard, ListingCardSkeleton } from '@/components/ui/ListingCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { isCarCategory, isPropertyCategory } from '@/lib/categories';
import { CitySelect } from '@/components/CitySelect';
import { resolveCitySlug } from '@/data/moroccoCities';
import { useSEO } from '@/lib/seo';

const listingRoute = (item: ListingItem) => (item.type === 'property' ? `/property/${item.id}` : `/car/${item.id}`);

const parseArrayField = (value: string | null | undefined): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    // Legacy rows may contain comma-separated amenities.
  }
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
};

const toListingItem = (item: {
  id: number;
  ownerId: number;
  title: string;
  titleFr?: string | null;
  description: string | null;
  category: string;
  pricePerDay: number;
  imageUrl: string | null;
  images?: string[] | null;
  averageRating?: number | null;
  reviewCount?: number | null;
  city: string;
  fuelType: string | null;
  transmission: string | null;
  seats?: number | null;
  area?: number | null;
  year?: number | null;
  rooms: number | null;
  officeType: string | null;
  rentalPeriod: 'daily' | 'monthly' | 'yearly' | null;
  amenities: string | null;
  dynamicPricePerDay?: number;
  ownerName?: string | null;
}): ListingItem => {
  const amenities = parseArrayField(item.amenities);
  const type: ListingItem['type'] = isCarCategory(item.category) ? 'car' : 'property';
  const unitLabel = item.rentalPeriod === "monthly" ? "درهم / شهر" : item.rentalPeriod === "yearly" ? "درهم / سنة" : "درهم / يوم";
  return {
    id: String(item.id),
    providerId: String(item.ownerId),
    providerName: item.ownerName || `مالك الإعلان #${item.ownerId}`,
    type,
    title: item.title,
    titleFr: item.titleFr ?? undefined,
    category: item.category,
    city: item.city,
    pricePerUnit: item.dynamicPricePerDay ?? item.pricePerDay,
    unitLabel,
    image: item.images?.[0] || item.imageUrl || '',
    images: item.images?.length ? item.images : item.imageUrl ? [item.imageUrl] : [],
    rating: item.averageRating ?? 0,
    reviewCount: item.reviewCount ?? 0,
    features: [item.fuelType, item.transmission, ...amenities].filter((value): value is string => Boolean(value)),
    description: item.description || '',
    specs: {
      transmission: item.transmission || undefined,
      fuel: item.fuelType || undefined,
      rooms: item.rooms ? String(item.rooms) : undefined,
      seats: item.seats && item.seats > 0 ? String(item.seats) : undefined,
      area: item.area && item.area > 0 ? `${item.area} m²` : undefined,
      year: item.year ?? undefined,
    },
  };
};

export default function Search() {
  const [, setLocation] = useLocation();
  const { language, t } = useLanguage();
  const searchParams = new URLSearchParams(window.location.search);

  const rawCity = searchParams.get('city') || 'all';
  const resolvedCity = resolveCitySlug(rawCity);

  const naturalQuery = searchParams.get('q') || '';
  const brandParam = searchParams.get('brand') || '';
  const categoryParam = searchParams.get('category') || '';
  const startDateParam = searchParams.get('startDate') || undefined;
  const endDateParam = searchParams.get('endDate') || undefined;
  const [cityFilter, setCityFilter] = useState(resolvedCity);
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || 'all');
  const [searchQuery, setSearchQuery] = useState(naturalQuery);
  const [maxPrice, setMaxPrice] = useState(4000);
  const [excellenceOnly, setExcellenceOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'recommended' | 'price-asc' | 'price-desc'>('recommended');
  const listingInput = useMemo(() => ({ startDate: startDateParam, endDate: endDateParam }), [startDateParam, endDateParam]);
  const listingsQuery = trpc.listings.list.useQuery(listingInput);
  const serverListings = useMemo(() => (listingsQuery.data ?? []).map(toListingItem), [listingsQuery.data]);

  // ميزة العرض السريع (Quick View Modal)
  const [quickViewItem, setQuickViewItem] = useState<ListingItem | null>(null);

  // عرض الخريطة التفاعلية
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [mapRegion, setMapRegion] = useState(() => ({
    center: resolvedCity !== 'all' ? (cityToCoords(resolvedCity) ?? MOROCCO_CENTER) : MOROCCO_CENTER,
    zoom: 7,
  }));
  const [mapRadius, setMapRadius] = useState(25);

  const mapSearch = trpc.listings.search.useQuery(
    viewMode === 'map'
      ? {
          lat: mapRegion.center.lat,
          lng: mapRegion.center.lng,
          radiusKm: mapRadius,
          type: 'car',
          maxPrice,
          q: searchQuery.trim() || undefined,
          sort: 'distance',
          pageSize: 100,
        }
      : undefined,
    { enabled: viewMode === 'map', staleTime: 15_000 },
  );

  const mapMarkers = useMemo(() => (mapSearch.data?.items ?? [])
    .filter((item) => isCarCategory(item.category))
    .map((item) => {
    const li = toListingItem(item);
    const coords = resolveListingCoords(item.lat, item.lng, item.city) ?? MOROCCO_CENTER;
    return {
      id: li.id,
      title: li.title,
      type: li.type,
      city: li.city,
      pricePerUnit: li.pricePerUnit,
      unitLabel: li.unitLabel,
      image: li.image,
      lat: coords.lat,
      lng: coords.lng,
    };
  }), [mapSearch.data]);

  // ميزة المقارنة (Side-by-Side Comparison)
  const [compareList, setCompareList] = useState<ListingItem[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const toggleCompare = (item: ListingItem) => {
    if (compareList.find(c => c.id === item.id)) {
      setCompareList(compareList.filter(c => c.id !== item.id));
      toast.info('تمت إزالة العنصر من قائمة المقارنة');
    } else {
      if (compareList.length >= 2) {
        toast.error('يمكنك مقارنة عنصرين كحد أقصى في نفس الوقت');
        return;
      }
      setCompareList([...compareList, item]);
      toast.success('تمت إضافة العنصر إلى قائمة المقارنة');
    }
  };

  const filteredListings = useMemo(() => {
    return serverListings.filter((item: ListingItem) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (cityFilter !== 'all' && item.city !== cityFilter) return false;
      if (item.pricePerUnit > maxPrice) return false;
      if (brandParam) {
        const b = brandParam.toLowerCase();
        if (!item.title.toLowerCase().includes(b) && !item.category.toLowerCase().includes(b)) return false;
      }
      if (categoryParam) {
        const c = categoryParam.toLowerCase();
        if (!item.category.toLowerCase().includes(c) && !item.title.toLowerCase().includes(c) && !item.description.toLowerCase().includes(c)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches = item.title.toLowerCase().includes(q) ||
                        item.description.toLowerCase().includes(q) ||
                        item.city.toLowerCase().includes(q) ||
                        item.category.toLowerCase().includes(q) ||
                        item.features.some(f => f.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    }).sort((a: ListingItem, b: ListingItem) => {
      if (sortBy === 'price-asc') return a.pricePerUnit - b.pricePerUnit;
      if (sortBy === 'price-desc') return b.pricePerUnit - a.pricePerUnit;
      return 0;
    });
  }, [serverListings, cityFilter, typeFilter, maxPrice, sortBy, searchQuery, brandParam, categoryParam, excellenceOnly]);

  // Thin-content guard: filtered/sorted/map/empty result states are `noindex`
  // and canonicalize to the clean /search hub so they never compete with it.
  const hasActiveFilters =
    cityFilter !== 'all' ||
    typeFilter !== 'all' ||
    searchQuery.trim() !== '' ||
    Boolean(brandParam || categoryParam) ||
    maxPrice !== 4000 ||
    sortBy !== 'recommended' ||
    viewMode === 'map';
  const resultsEmpty = !listingsQuery.isLoading && !listingsQuery.error && filteredListings.length === 0;
  const isThinSearch = hasActiveFilters || resultsEmpty;
  useSEO({
    title: language === 'fr'
      ? 'Location de voitures et immobilier au Maroc | ALTUSplace'
      : 'كراء السيارات والعقارات في المغرب | ALTUSplace',
    description: language === 'fr'
      ? 'Comparez les voitures et biens à louer dans toutes les villes du Maroc, avec prix transparents et réservation en ligne sécurisée.'
      : 'قارن عروض كراء السيارات والعقارات في جميع مدن المغرب بأسعار واضحة وحجز آمن عبر الإنترنت.',
    path: '/search',
    canonicalPath: '/search',
    language,
    robots: isThinSearch ? 'noindex, follow' : 'index, follow, max-image-preview:large',
  });

  const [isSearching, setIsSearching] = useState(false);

  const categoryPills = [
    { key: 'catAll', type: 'all', q: '' },
    { key: 'catSuv', type: 'car', q: 'SUV' },
    { key: 'catSedan', type: 'car', q: 'سيدان' },
    { key: 'catApartment', type: 'property', q: 'شقة' },
    { key: 'catVilla', type: 'property', q: 'فيلا' },
    { key: 'catStudio', type: 'property', q: 'استوديو' },
  ] as const;
  const activeCategoryKey = categoryPills.find((pill) => pill.type === typeFilter && pill.q === searchQuery)?.key ?? null;
  const applyCategoryPill = (pill: (typeof categoryPills)[number]) => {
    setTypeFilter(pill.type);
    setSearchQuery(pill.q);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20" dir="rtl">
      <div className="container mx-auto px-4 space-y-8">
        
        {/* شريط عائم للمقارنة */}
        {compareList.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-bg-elevated/95 backdrop-blur-xl border border-accent-clay/40 p-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in fade-in-50">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-accent-clay" />
              <span className="text-xs font-bold text-ink-primary">المقارنة ({compareList.length}/2):</span>
            </div>
            <div className="flex items-center gap-2">
              {compareList.map(c => (
                <span key={c.id} className="bg-bg-muted border border-border-default text-xs px-3 py-1 rounded-xl text-ink-secondary flex items-center gap-2">
                  {c.title}
                  <button onClick={() => toggleCompare(c)} className="text-accent-red hover:opacity-80"><X className="w-3.5 h-3.5" /></button>
                </span>
              ))}
            </div>
            {compareList.length === 2 && (
              <Button
                onClick={() => setShowCompareModal(true)}
                className="bg-accent-clay hover:bg-accent-clay-hover text-white font-bold text-xs px-4 py-2 rounded-xl shadow-lg"
              >
                قارن الآن
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink-primary">{language === 'fr' ? 'Guide des voitures disponibles' : 'دليل السيارات المتاحة'}</h1>
            <p className="text-ink-secondary text-sm leading-relaxed">{language === 'fr' ? 'Découvrez les offres vérifiées au Maroc avec filtres professionnels et réservation simplifiée.' : 'استعرض أفضل العروض المعتمدة في المغرب مع فلاتر مهنية وحجز مبسط.'}</p>
          </div>
        </div>

        {/* Horizontal category pills */}
        <div className="pill-rail no-scrollbar">
          {categoryPills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => applyCategoryPill(pill)}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
                activeCategoryKey === pill.key
                  ? 'border-accent-clay bg-accent-clay text-white shadow-[var(--shadow-clay)]'
                  : 'border-border-default bg-bg-surface text-ink-secondary hover:border-accent-clay hover:text-accent-clay'
              }`}
            >
              {t(pill.key)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 bg-bg-surface border border-border-subtle p-6 rounded-3xl space-y-6 h-fit sticky top-28 shadow-xl">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <h2 className="text-lg font-bold text-ink-primary flex items-center gap-2">
                <Filter className="w-5 h-5 text-accent-clay" />
                <span>{t('advancedFilters')}</span>
              </h2>
              <button
                onClick={() => {
                  setCityFilter('all');
                  setTypeFilter('all');
                  setMaxPrice(4000);
                  setExcellenceOnly(false);
                }}
                className="text-xs text-accent-clay hover:underline"
              >
                {t('resetFilters')}
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink-secondary">{t('naturalSearch')}</label>
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-muted border border-border-default text-ink-primary rounded-xl p-3 text-xs focus:outline-none focus:border-accent-clay"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink-secondary">{t('city')}</label>
              <CitySelect
                value={cityFilter}
                onChange={setCityFilter}
                includeAll
                className="w-full bg-bg-muted border-border-default rounded-xl px-3 py-2 text-sm text-ink-primary focus:outline-none focus:border-accent-clay"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink-secondary">النوع</label>
              <div className="grid grid-cols-3 gap-1 bg-bg-muted border border-border-default rounded-xl p-1">
                {([['all', 'الكل'], ['car', 'سيارات'], ['property', 'عقارات']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTypeFilter(value)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      typeFilter === value ? 'bg-accent-clay text-white shadow-lg' : 'text-ink-secondary hover:text-ink-primary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-ink-secondary">{t('maxPrice')}</span>
                <span className="text-accent-clay font-bold">{maxPrice} درهم</span>
              </div>
              <input
                type="range"
                min="200"
                max="5000"
                step="100"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-accent-clay bg-bg-muted cursor-pointer"
              />
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            <div className="bg-bg-surface border border-border-subtle p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-ink-secondary">
                {t('offersFoundPrefix')} <span className="text-accent-clay font-bold">{filteredListings.length}</span> {t('availableOffers')}
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {/* View Toggle Buttons */}
                <div className="flex items-center bg-bg-muted border border-border-default rounded-xl p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      viewMode === 'grid'
                        ? 'bg-accent-clay text-white shadow-lg'
                        : 'text-ink-secondary hover:text-ink-primary'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    شبكة
                  </button>
                  <button
                    onClick={() => setViewMode('map')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      viewMode === 'map'
                        ? 'bg-accent-clay text-white shadow-lg'
                        : 'text-ink-secondary hover:text-ink-primary'
                    }`}
                  >
                    <Map className="w-3.5 h-3.5" />
                    خريطة
                  </button>
                </div>
                <div className="hidden sm:block w-px h-6 bg-border-default" />
                <ArrowUpDown className="w-4 h-4 text-accent-clay" />
                <span className="text-xs text-ink-secondary">{t('sortBy')}:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="bg-bg-muted border border-border-default rounded-xl px-3 py-1.5 text-xs text-ink-primary focus:outline-none focus:border-accent-clay"
                >
                  <option value="recommended">{t('sortRecommended')}</option>
                  <option value="price-asc">{t('lowestPrice')}</option>
                  <option value="price-desc">{t('highestPrice')}</option>
                </select>
              </div>
            </div>

            {listingsQuery.isLoading && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ListingCardSkeleton key={i} />
                ))}
              </div>
            )}
            {listingsQuery.error && (
              <ErrorState
                title={t('listingsLoadErrorTitle') || 'Unable to load listings'}
                message={t('listingsLoadError') || 'Something went wrong while fetching listings.'}
                onRetry={() => listingsQuery.refetch()}
              />
            )}
            {!listingsQuery.isLoading && !listingsQuery.error && filteredListings.length === 0 && (
              <EmptyState
                icon="search"
                title={t('noMatchingListings') || 'No listings found'}
                description={t('noMatchingListingsDesc') || 'Try adjusting your filters or search in a different city.'}
              />
            )}

            {/* Grid View */}
            {viewMode === 'grid' && filteredListings.length > 0 && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredListings.map((item, index) => (
                  <ListingCard
                    key={item.id}
                    id={String(item.id)}
                    title={item.title}
                    titleFr={item.titleFr}
                    city={item.city}
                    pricePerDay={item.pricePerUnit}
                    unitLabel={item.unitLabel}
                    images={item.images?.length ? item.images : item.image ? [item.image] : []}
                    type={item.type === 'car' ? 'car' : 'property'}
                    rating={item.rating}
                    reviewCount={item.reviewCount}
                    startDate={startDateParam}
                    endDate={endDateParam}
                    specs={{
                      transmission: item.specs?.transmission,
                      fuel: item.specs?.fuel,
                      seats: item.specs?.seats ? Number(item.specs.seats) : undefined,
                      rooms: item.specs?.rooms ? Number(item.specs.rooms) : undefined,
                      area: item.specs?.area,
                      year: item.specs?.year,
                    }}
                    className={`stagger-${Math.min(index + 1, 8)} animate-fade-up`}
                  />
                ))}
              </div>
            )}

            {/* Map View */}
            {viewMode === 'map' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 min-w-0">
                  <MapboxSearchMap
                    listings={mapMarkers}
                    center={mapRegion.center}
                    radiusKm={mapRadius}
                    onSelectListing={(listing) => setLocation(`/car/${listing.id}`)}
                    onViewportChange={(viewport) => setMapRegion({ center: viewport.center, zoom: viewport.zoom })}
                    height="640px"
                  />
                </div>

                <div className="space-y-4">
                  <div className="bg-bg-surface border border-border-subtle rounded-2xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-ink-secondary">{t('searchRadius')}</label>
                      <span className="text-xs font-bold text-accent-clay">{mapRadius} {t('mapKmUnit')}</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="150"
                      step="5"
                      value={mapRadius}
                      onChange={(e) => setMapRadius(Number(e.target.value))}
                      className="w-full accent-accent-clay bg-bg-muted cursor-pointer"
                    />
                  </div>

                  <div className="bg-bg-surface border border-border-subtle rounded-2xl p-4 space-y-3 shadow-sm">
                    <div className="text-xs font-bold text-ink-primary border-b border-border-subtle pb-2">
                      {t('mapResultsTitle')} — <span className="text-accent-clay">{mapSearch.data?.total ?? 0}</span>
                    </div>
                    {mapSearch.isLoading && (
                      <div className="flex items-center justify-center py-8 text-xs text-ink-secondary">جاري البحث في المنطقة…</div>
                    )}
                    {!mapSearch.isLoading && (mapSearch.data?.total ?? 0) === 0 && (
                      <p className="text-xs text-ink-secondary leading-relaxed">{t('mapNoResults')}</p>
                    )}
                    <div className="space-y-3 max-h-[520px] overflow-y-auto pl-1">
                      {(mapSearch.data?.items ?? []).map((item) => {
                        const li = toListingItem(item);
                        return (
                          <div key={li.id} className="flex gap-3 bg-bg-muted border border-border-subtle rounded-xl p-3 items-center">
                            <img
                              src={li.image}
                              alt={li.title}
                              loading="lazy"
                              className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0 space-y-1">
                              <h5 className="text-xs font-bold text-ink-primary line-clamp-1">{li.title}</h5>
                              <p className="text-[11px] text-ink-secondary flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {li.city}
                              </p>
                              <div className="text-xs font-extrabold text-accent-clay">{li.pricePerUnit} {li.unitLabel}</div>
                            </div>
                            <button
                              onClick={() => setLocation(listingRoute(li))}
                              className="self-center bg-accent-clay hover:bg-accent-clay-hover text-white text-[11px] font-bold px-3 py-1.5 rounded-full shrink-0"
                            >
                              {t('mapViewListing')}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* نافذة العرض السريع المنبثقة (Quick View Modal) */}
      {quickViewItem && (
        <div className="fixed inset-0 z-50 bg-ink-primary/60 dark:bg-[#1C1C1E]/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-subtle rounded-3xl max-w-2xl w-full p-8 space-y-6 shadow-2xl relative animate-in zoom-in-95">
            <button
              onClick={() => setQuickViewItem(null)}
              className="absolute top-6 left-6 text-ink-tertiary hover:text-ink-primary bg-bg-muted p-2 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative h-64 rounded-2xl overflow-hidden">
              <OptimizedImage
                src={quickViewItem.image}
                srcSet={`${quickViewItem.image} 800w`}
                sizes="(max-width: 768px) 100vw, 672px"
                alt={quickViewItem.title}
                loading="lazy"
                decoding="async"
                width={800}
                height={512}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 right-4 bg-accent-clay text-white px-3 py-1 rounded-full text-xs font-bold">
                {quickViewItem.city}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-accent-clay font-bold">{quickViewItem.providerName}</span>
                  <h2 className="text-xl font-black text-ink-primary">{quickViewItem.title}</h2>
                </div>
                <div className="text-left">
                  <div className="text-2xl font-black text-accent-clay">{quickViewItem.pricePerUnit} {quickViewItem.unitLabel}</div>
                  <div className="text-xs text-ink-tertiary">التقييمات الموثقة تظهر في صفحة الإعلان بعد توفرها</div>
                </div>
              </div>

              <p className="text-xs text-ink-secondary leading-relaxed">{quickViewItem.description}</p>

              <div className="flex flex-wrap gap-2">
                {quickViewItem.features.map((f, i) => (
                  <span key={i} className="text-[11px] bg-bg-muted border border-border-subtle text-ink-secondary px-3 py-1 rounded-full">
                    ✓ {f}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between pt-4 border-t border-border-subtle">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-tertiary">مشاركة:</span>
                  <button
                    onClick={() => {
                      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`شاهد هذا العرض الرائع: ${quickViewItem.title} - ${quickViewItem.pricePerUnit} ${quickViewItem.unitLabel} في ${quickViewItem.city} عبر منصة ALTUSplace: ${window.location.href}`)}`, '_blank');
                    }}
                    className="bg-accent-green-soft hover:bg-[var(--accent-green-s)] text-accent-green p-2 rounded-full text-xs flex items-center gap-1 transition-colors"
                    title="مشاركة عبر واتساب"
                  >
                    واتساب
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      toast.success('تم نسخ رابط العرض بنجاح!');
                    }}
                    className="bg-bg-muted hover:bg-border-default text-ink-secondary p-2 rounded-full text-xs transition-colors"
                    title="نسخ الرابط"
                  >
                    نسخ الرابط
                  </button>
                </div>
                <Button
                  onClick={() => setQuickViewItem(null)}
                  className="bg-bg-muted hover:bg-border-default text-ink-primary font-bold px-4 py-2.5 rounded-full text-xs"
                >
                  إغلاق
                </Button>
                <Button
                  onClick={() => setLocation(listingRoute(quickViewItem))}
                  className="bg-accent-clay hover:bg-accent-clay-hover text-white font-bold px-6 py-2.5 rounded-full text-xs shadow-lg"
                >
                  الانتقال لصفحة الحجز الكاملة
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة المقارنة المنبثقة */}
      {showCompareModal && compareList.length === 2 && (
        <div className="fixed inset-0 z-50 bg-ink-primary/60 dark:bg-[#1C1C1E]/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-bg-surface border border-border-subtle p-8 rounded-3xl max-w-4xl w-full space-y-6 shadow-2xl relative animate-in zoom-in-95">
            <button
              onClick={() => setShowCompareModal(false)}
              className="absolute top-6 left-6 text-ink-tertiary hover:text-ink-primary bg-bg-muted p-2 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center space-y-2">
              <span className="text-accent-clay text-xs font-bold uppercase tracking-widest">مقارنة تفصيلية</span>
              <h2 className="text-2xl font-black text-ink-primary">مقارنة جنباً إلى جنب</h2>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {compareList.map(c => (
                <div key={c.id} className="bg-bg-muted border border-border-subtle p-6 rounded-2xl space-y-4">
                  <OptimizedImage
                    src={c.image}
                    srcSet={`${c.image} 640w`}
                    sizes="(max-width: 768px) 100vw, 320px"
                    alt={c.title}
                    loading="lazy"
                    decoding="async"
                    width={640}
                    height={256}
                    className="w-full h-40 object-cover rounded-xl"
                  />
                  <h3 className="text-lg font-bold text-ink-primary text-center">{c.title}</h3>
                  <div className="space-y-2 text-xs text-ink-secondary">
                    <div className="flex justify-between py-2 border-b border-border-subtle">
                      <span className="text-ink-tertiary">السعر:</span>
                      <span className="font-extrabold text-accent-clay">{c.pricePerUnit} {c.unitLabel}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border-subtle">
                      <span className="text-ink-tertiary">المدينة:</span>
                      <span className="font-bold">{c.city}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-ink-tertiary">المزود:</span>
                      <span className="font-bold">{c.providerName}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <Button
                onClick={() => setShowCompareModal(false)}
                className="bg-accent-clay hover:bg-accent-clay-hover text-white font-bold px-8 py-2.5 rounded-full text-xs"
              >
                إنهاء المقارنة
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
