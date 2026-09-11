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

const CITIES = [
  { id: 'all', name: 'جميع المدن' },
  { id: 'مراكش', name: 'مراكش' },
  { id: 'أغادير', name: 'أغادير' },
  { id: 'الدار البيضاء', name: 'الدار البيضاء' },
  { id: 'طنجة', name: 'طنجة' },
  { id: 'الرباط', name: 'الرباط' },
];

const OFFICE_TYPES = ['private', 'coworking', 'meeting_room', 'company_headquarters'] as const;
const AMENITY_OPTIONS = ['fiber', 'air_conditioning', 'reception', 'parking', 'security'] as const;

const listingRoute = (item: ListingItem) => item.type === 'car' ? `/car/${item.id}` : `/property/${item.id}`;

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
  description: string | null;
  category: string;
  pricePerDay: number;
  imageUrl: string | null;
  city: string;
  fuelType: string | null;
  transmission: string | null;
  rooms: number | null;
  officeType: string | null;
  rentalPeriod: 'daily' | 'monthly' | 'yearly' | null;
  amenities: string | null;
  dynamicPricePerDay?: number;
  ownerName?: string | null;
}): ListingItem => {
  const normalizedCategory = item.category.toLowerCase();
  const type: ListingItem['type'] = normalizedCategory.includes('car') || normalizedCategory.includes('سيارة')
    ? 'car'
    : item.officeType || normalizedCategory.includes('office') || normalizedCategory.includes('مكتب')
      ? 'office'
      : 'property';
  const amenities = parseArrayField(item.amenities).filter((entry): entry is NonNullable<ListingItem['amenities']>[number] =>
    ['fiber', 'air_conditioning', 'reception', 'parking', 'security'].includes(entry),
  );
  const unitLabel = type === 'office'
    ? item.rentalPeriod === 'monthly' ? 'درهم / شهر' : item.rentalPeriod === 'yearly' ? 'درهم / سنة' : 'درهم / يوم'
    : type === 'car' ? 'درهم / يوم' : 'درهم / ليلة';
  return {
    id: String(item.id),
    providerId: String(item.ownerId),
    providerName: item.ownerName || `مالك الإعلان #${item.ownerId}`,
    type,
    title: item.title,
    category: item.category,
    city: item.city,
    pricePerUnit: item.dynamicPricePerDay ?? item.pricePerDay,
    unitLabel,
    image: item.imageUrl || '',
    images: item.imageUrl ? [item.imageUrl] : [],
    features: [item.fuelType, item.transmission, ...amenities].filter((value): value is string => Boolean(value)),
    description: item.description || '',
    officeType: type === 'office' && ['private', 'coworking', 'meeting_room', 'company_headquarters'].includes(item.officeType || '')
      ? item.officeType as ListingItem['officeType']
      : undefined,
    amenities: amenities.length ? amenities : undefined,
    rentalTerms: item.rentalPeriod ? [item.rentalPeriod] : undefined,
    specs: {
      transmission: item.transmission || undefined,
      fuel: item.fuelType || undefined,
      rooms: item.rooms ? String(item.rooms) : undefined,
    },
  };
};

const cityMap: Record<string, string> = {
  agadir: 'أغادير',
  marrakech: 'مراكش',
  casablanca: 'الدار البيضاء',
  tangier: 'طنجة',
  rabat: 'الرباط',
};

export default function Search() {
  const [, setLocation] = useLocation();
  const { language, t } = useLanguage();
  const searchParams = new URLSearchParams(window.location.search);

  const rawCity = searchParams.get('city') || 'all';
  const resolvedCity = cityMap[rawCity] || rawCity;

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
  const [sortBy, setSortBy] = useState<'price-asc' | 'price-desc'>('price-asc');
  const [officeTypeFilter, setOfficeTypeFilter] = useState<string>('all');
  const [amenityFilters, setAmenityFilters] = useState<string[]>([]);
  const [rentalTermFilter, setRentalTermFilter] = useState<string>('all');
  const listingInput = useMemo(() => ({ startDate: startDateParam, endDate: endDateParam }), [startDateParam, endDateParam]);
  const listingsQuery = trpc.listings.list.useQuery(listingInput);
  const serverListings = useMemo(() => (listingsQuery.data ?? []).map(toListingItem), [listingsQuery.data]);

  const toggleAmenity = (amenity: string) => {
    setAmenityFilters((current) => current.includes(amenity)
      ? current.filter((value) => value !== amenity)
      : [...current, amenity]);
  };

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
          type: typeFilter === 'all' ? undefined : (typeFilter as 'car' | 'property' | 'office'),
          officeType: typeFilter === 'office' && officeTypeFilter !== 'all' ? officeTypeFilter : undefined,
          rentalPeriod: typeFilter === 'office' && rentalTermFilter !== 'all' ? (rentalTermFilter as 'daily' | 'monthly' | 'yearly') : undefined,
          amenities: typeFilter === 'office' && amenityFilters.length > 0 ? amenityFilters : undefined,
          maxPrice,
          q: searchQuery.trim() || undefined,
          sort: 'distance',
          pageSize: 100,
        }
      : undefined,
    { enabled: viewMode === 'map', staleTime: 15_000 },
  );

  const mapMarkers = useMemo(() => (mapSearch.data?.items ?? []).map((item) => {
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
      if (cityFilter !== 'all' && item.city !== cityFilter) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (typeFilter === 'office' && officeTypeFilter !== 'all' && item.officeType !== officeTypeFilter) return false;
      if (typeFilter === 'office' && rentalTermFilter !== 'all' && !item.rentalTerms?.includes(rentalTermFilter as 'daily' | 'monthly' | 'yearly')) return false;
      if (typeFilter === 'office' && amenityFilters.length > 0 && !amenityFilters.every((amenity) => item.amenities?.includes(amenity as NonNullable<ListingItem['amenities']>[number]))) return false;
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
  }, [serverListings, cityFilter, typeFilter, maxPrice, sortBy, searchQuery, brandParam, categoryParam, excellenceOnly, officeTypeFilter, amenityFilters, rentalTermFilter]);

  const [isSearching, setIsSearching] = useState(false);
  const cityLabel = (city: string) => language === 'fr' ? ({ 'جميع المدن': 'Toutes les villes', 'مراكش': 'Marrakech', 'أغادير': 'Agadir', 'الدار البيضاء': 'Casablanca', 'طنجة': 'Tanger', 'الرباط': 'Rabat' }[city] ?? city) : city;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20" dir="rtl">
      <div className="container mx-auto px-4 space-y-8">
        
        {/* شريط عائم للمقارنة */}
        {compareList.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 backdrop-blur-xl border border-amber-500/50 p-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in fade-in-50">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-amber-400" />
              <span className="text-xs font-bold text-white">المقارنة ({compareList.length}/2):</span>
            </div>
            <div className="flex items-center gap-2">
              {compareList.map(c => (
                <span key={c.id} className="bg-slate-900 border border-slate-700 text-xs px-3 py-1 rounded-xl text-slate-200 flex items-center gap-2">
                  {c.title}
                  <button onClick={() => toggleCompare(c)} className="text-red-400 hover:text-red-300"><X className="w-3.5 h-3.5" /></button>
                </span>
              ))}
            </div>
            {compareList.length === 2 && (
              <Button
                onClick={() => setShowCompareModal(true)}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl shadow-lg"
              >
                قارن الآن
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-white">{language === 'fr' ? 'Guide des voitures, biens et bureaux disponibles' : 'دليل السيارات والعقارات والمكاتب المتاحة'}</h1>
            <p className="text-slate-400 text-sm">{language === 'fr' ? 'Découvrez les offres vérifiées au Maroc avec filtres professionnels et réservation simplifiée.' : 'استعرض أفضل العروض المعتمدة في المغرب مع فلاتر مهنية وحجز مبسط.'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 bg-slate-950 border border-slate-800 p-6 rounded-3xl space-y-6 h-fit sticky top-28 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Filter className="w-5 h-5 text-amber-400" />
                <span>{t('advancedFilters')}</span>
              </h2>
              <button
                onClick={() => {
                  setCityFilter('all');
                  setTypeFilter('all');
                  setMaxPrice(4000);
                  setExcellenceOnly(false);
                  setOfficeTypeFilter('all');
                  setAmenityFilters([]);
                  setRentalTermFilter('all');
                }}
                className="text-xs text-amber-400 hover:underline"
              >
                {t('resetFilters')}
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">{t('naturalSearch')}</label>
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">{t('sector')}</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                <option value="all">{t('allSectors')}</option>
                <option value="car">{t('carsOnly')}</option>
                <option value="property">{t('propertiesOnly')}</option>
                <option value="office">{t('officeOnly')}</option>
              </select>
            </div>

            {typeFilter === 'office' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">{t('officeType')}</label>
                  <select value={officeTypeFilter} onChange={(e) => setOfficeTypeFilter(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500">
                    <option value="all">{t('all')}</option>
                    {OFFICE_TYPES.map((officeType) => (
                      <option key={officeType} value={officeType}>{t({ private: 'privateOffice', coworking: 'coworking', meeting_room: 'meetingRoom', company_headquarters: 'companyHeadquarters' }[officeType])}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">{t('rentalType')}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['daily', 'monthly', 'yearly'] as const).map((term) => (
                      <button key={term} type="button" onClick={() => setRentalTermFilter(rentalTermFilter === term ? 'all' : term)} className={`rounded-lg border px-2 py-2 text-[11px] ${rentalTermFilter === term ? 'border-amber-400 bg-amber-500/15 text-amber-300' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>{t(term)}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">{t('amenities')}</label>
                  <div className="space-y-2">
                    {AMENITY_OPTIONS.map((amenity) => (
                      <label key={amenity} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={amenityFilters.includes(amenity)} onChange={() => toggleAmenity(amenity)} className="accent-amber-500" />
                        {t(amenity === 'air_conditioning' ? 'airConditioning' : amenity)}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">{t('city')}</label>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                {CITIES.map((c) => (
                  <option key={c.id} value={c.name}>
                    {cityLabel(c.name)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-300">{t('maxPrice')}</span>
                <span className="text-amber-400 font-bold">{maxPrice} درهم</span>
              </div>
              <input
                type="range"
                min="200"
                max="5000"
                step="100"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-amber-500 bg-slate-800 cursor-pointer"
              />
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-slate-300">
                {t('offersFoundPrefix')} <span className="text-amber-400 font-bold">{filteredListings.length}</span> {t('availableOffers')}
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {/* View Toggle Buttons */}
                <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      viewMode === 'grid'
                        ? 'bg-amber-500 text-slate-950 shadow-lg'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    شبكة
                  </button>
                  <button
                    onClick={() => setViewMode('map')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      viewMode === 'map'
                        ? 'bg-amber-500 text-slate-950 shadow-lg'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Map className="w-3.5 h-3.5" />
                    خريطة
                  </button>
                </div>
                <div className="hidden sm:block w-px h-6 bg-slate-700" />
                <ArrowUpDown className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400">{t('sortBy')}:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                >
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
                    city={item.city}
                    pricePerDay={item.pricePerUnit}
                    images={item.image ? [item.image] : []}
                    type={item.type === 'property' ? 'property' : 'car'}
                    specs={{
                      transmission: item.specs?.transmission,
                      fuel: item.specs?.fuel,
                      seats: item.specs?.seats ? Number(item.specs.seats) : undefined,
                      rooms: item.specs?.rooms ? Number(item.specs.rooms) : undefined,
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
                    onSelectListing={(listing) => setLocation(listing.type === 'car' ? `/car/${listing.id}` : `/property/${listing.id}`)}
                    onViewportChange={(viewport) => setMapRegion({ center: viewport.center, zoom: viewport.zoom })}
                    height="640px"
                  />
                </div>

                <div className="space-y-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">{t('searchRadius')}</label>
                      <span className="text-xs font-bold text-amber-400">{mapRadius} {t('mapKmUnit')}</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="150"
                      step="5"
                      value={mapRadius}
                      onChange={(e) => setMapRadius(Number(e.target.value))}
                      className="w-full accent-amber-500 bg-slate-800 cursor-pointer"
                    />
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="text-xs font-bold text-white border-b border-slate-800 pb-2">
                      {t('mapResultsTitle')} — <span className="text-amber-400">{mapSearch.data?.total ?? 0}</span>
                    </div>
                    {mapSearch.isLoading && (
                      <div className="flex items-center justify-center py-8 text-xs text-slate-400">جاري البحث في المنطقة…</div>
                    )}
                    {!mapSearch.isLoading && (mapSearch.data?.total ?? 0) === 0 && (
                      <p className="text-xs text-slate-400 leading-relaxed">{t('mapNoResults')}</p>
                    )}
                    <div className="space-y-3 max-h-[520px] overflow-y-auto pl-1">
                      {(mapSearch.data?.items ?? []).map((item) => {
                        const li = toListingItem(item);
                        return (
                          <div key={li.id} className="flex gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3 items-center">
                            <img
                              src={li.image}
                              alt={li.title}
                              loading="lazy"
                              className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0 space-y-1">
                              <h5 className="text-xs font-bold text-white line-clamp-1">{li.title}</h5>
                              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {li.city}
                              </p>
                              <div className="text-xs font-extrabold text-amber-400">{li.pricePerUnit} {li.unitLabel}</div>
                            </div>
                            <button
                              onClick={() => setLocation(listingRoute(li))}
                              className="self-center bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-bold px-3 py-1.5 rounded-lg shrink-0"
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl max-w-2xl w-full p-8 space-y-6 shadow-2xl relative animate-in zoom-in-95">
            <button
              onClick={() => setQuickViewItem(null)}
              className="absolute top-6 left-6 text-slate-400 hover:text-white bg-slate-900 p-2 rounded-full"
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
              <div className="absolute top-4 right-4 bg-amber-500 text-slate-950 px-3 py-1 rounded-xl text-xs font-bold">
                {quickViewItem.city}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-amber-400 font-bold">{quickViewItem.providerName}</span>
                  <h2 className="text-xl font-black text-white">{quickViewItem.title}</h2>
                </div>
                <div className="text-left">
                  <div className="text-2xl font-black text-amber-400">{quickViewItem.pricePerUnit} {quickViewItem.unitLabel}</div>
                  <div className="text-xs text-slate-500">التقييمات الموثقة تظهر في صفحة الإعلان بعد توفرها</div>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{quickViewItem.description}</p>

              <div className="flex flex-wrap gap-2">
                {quickViewItem.features.map((f, i) => (
                  <span key={i} className="text-[11px] bg-slate-900 border border-slate-800 text-slate-300 px-3 py-1 rounded-xl">
                    ✓ {f}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between pt-4 border-t border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">مشاركة:</span>
                  <button
                    onClick={() => {
                      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`شاهد هذا العرض الرائع: ${quickViewItem.title} - ${quickViewItem.pricePerUnit} ${quickViewItem.unitLabel} في ${quickViewItem.city} عبر منصة ALTUSplace: ${window.location.href}`)}`, '_blank');
                    }}
                    className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 p-2 rounded-xl text-xs flex items-center gap-1 transition-colors"
                    title="مشاركة عبر واتساب"
                  >
                    واتساب
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      toast.success('تم نسخ رابط العرض بنجاح!');
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-xl text-xs transition-colors"
                    title="نسخ الرابط"
                  >
                    نسخ الرابط
                  </button>
                </div>
                <Button
                  onClick={() => setQuickViewItem(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs"
                >
                  إغلاق
                </Button>
                <Button
                  onClick={() => setLocation(listingRoute(quickViewItem))}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs shadow-lg shadow-amber-500/20"
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl max-w-4xl w-full space-y-6 shadow-2xl relative animate-in zoom-in-95">
            <button
              onClick={() => setShowCompareModal(false)}
              className="absolute top-6 left-6 text-slate-400 hover:text-white bg-slate-900 p-2 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center space-y-2">
              <span className="text-amber-500 text-xs font-bold uppercase tracking-widest">مقارنة تفصيلية</span>
              <h2 className="text-2xl font-black text-white">مقارنة جنباً إلى جنب (Side-by-Side)</h2>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {compareList.map(c => (
                <div key={c.id} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4">
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
                  <h3 className="text-lg font-bold text-white text-center">{c.title}</h3>
                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="flex justify-between py-2 border-b border-slate-800">
                      <span className="text-slate-400">السعر:</span>
                      <span className="font-extrabold text-amber-400">{c.pricePerUnit} {c.unitLabel}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-800">
                      <span className="text-slate-400">المدينة:</span>
                      <span className="font-bold">{c.city}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-400">المزود:</span>
                      <span className="font-bold">{c.providerName}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <Button
                onClick={() => setShowCompareModal(false)}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-8 py-2.5 rounded-xl text-xs"
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
