import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/OptimizedImage';
import { Search, MapPin, Building2, Car, ShieldCheck, ArrowRight, CheckCircle2, Award, Clock, Bot, Send, Mic, Bookmark, Check, Calendar, DollarSign, Filter, Phone } from 'lucide-react';
import { PARTNERS, LISTINGS, ListingItem } from '@/data/altusplace';
import { SmartRecommendations } from '@/components/SmartRecommendations';
import { FAQSection } from '@/components/FAQSection';
import { ListingCard } from '@/components/ui/ListingCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { toast } from 'sonner';

function getListingPath(item: { id: string; type: string }) {
  return item.type === 'property' ? `/property/${item.id}` : `/car/${item.id}`;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { t, direction } = useLanguage();
  const [activeTab, setActiveTab] = useState<'cars' | 'properties'>('cars');
  
  // Search states for Cars
  const [carCity, setCarCity] = useState('الدار البيضاء');
  const [pickupDate, setPickupDate] = useState('');
  const [dropoffDate, setDropoffDate] = useState('');

  // Search states for Properties
  const [propLocation, setPropLocation] = useState('مراكش');
  const [propType, setPropType] = useState('apartment');
  const [maxPrice, setMaxPrice] = useState('2000');

  // Database listings formatted as unified items
  const { data: dbListings = [] } = trpc.listings.list.useQuery();
  const activeListings = dbListings.length > 0 ? dbListings.map(item => ({
    id: String(item.id),
    title: item.title,
    category: item.category === 'property' ? t('listingCategoryProperty') : t('listingCategoryCar'),
    type: item.category,
    pricePerUnit: item.pricePerDay,
    image: item.imageUrl || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800',
    city: item.city || 'الدار البيضاء',
    providerName: t('providerNamePlaceholder'),
    specs: {
      transmission: t('transmissionAutomatic'),
      fuel: t('fuelDieselPetrol'),
      seats: '5'
    }
  })) : LISTINGS;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'cars') {
      setLocation(`/search?type=car&city=${encodeURIComponent(carCity)}&startDate=${encodeURIComponent(pickupDate)}&endDate=${encodeURIComponent(dropoffDate)}`);
    } else {
      setLocation(`/search?type=property&city=${encodeURIComponent(propLocation)}&propType=${propType}&maxPrice=${maxPrice}`);
    }
  };

  // ── Floating glass search widget style tokens (international marketplace UI) ──
  const searchLabelClass = 'text-xs font-bold tracking-wide text-slate-200';
  const searchFieldClass =
    'w-full min-h-12 rounded-xl border border-white/15 bg-[#0B0F19]/85 py-3 pr-11 pl-4 text-sm font-semibold text-white outline-none antialiased transition-all duration-200 [color-scheme:dark] selection:bg-blue-500/40 hover:border-white/25 hover:bg-[#0B0F19] placeholder:text-slate-400 focus:border-blue-400/70 focus:bg-[#0B0F19] focus:ring-2 focus:ring-blue-500/80 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-90';
  const searchIconClass =
    'pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-300 transition-colors duration-200 group-hover:text-blue-300 group-focus-within:text-blue-400';
  const highlightTextClass =
    'bg-gradient-to-r from-blue-400 via-sky-300 to-blue-500 bg-clip-text text-transparent';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col" dir={direction}>
      
      {/* ── Hero: Deep Slate Navy with Electric Blue aurora ── */}
      <section className="relative pt-14 pb-20 md:pt-24 md:pb-28 px-4 overflow-hidden bg-[#0B0F19] text-white">
        {/* Aurora glows + dot grid */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-32 left-1/4 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl" />
          <div className="absolute top-10 right-1/4 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(#3B82F6_1px,transparent_1px)] [background-size:28px_28px]"></div>
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent"></div>
        </div>
        
        <div className="container mx-auto max-w-6xl text-center space-y-6 md:space-y-10 relative z-10">
          <div className="inline-flex items-center gap-2 border border-blue-400/20 bg-blue-500/10 px-5 py-2.5 rounded-full text-blue-200 text-sm font-bold tracking-wide fade-in shadow-lg shadow-blue-950/30">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>{t('heroBadge')}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight leading-[1.25] md:leading-[1.15]">
            {t('heroTitlePrefix')} <span className={highlightTextClass}>{t('heroTitleCars')}</span> {t('heroTitleAnd')} <span className={highlightTextClass}>{t('heroTitleProperties')}</span> <span className="text-amber-400">{t('heroTitleSuffix')}</span>
          </h1>

          <p className="text-slate-300/95 text-xs sm:text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            {t('heroDescription')}
          </p>
          
          <div className="flex justify-center gap-4 mt-2">
            <Button 
              onClick={() => window.open('/slides_project/cover_slide.html', '_blank')}
              className="bg-white/[0.07] hover:bg-white/[0.14] text-white border border-white/15 px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 backdrop-blur transition-colors duration-200"
            >
              <Award className="w-4 h-4" />
              <span>{t('heroReviewButton')}</span>
            </Button>
          </div>

          {/* ── Floating glassmorphism search card ── */}
          <div className="max-w-4xl mx-auto mt-4 md:mt-8 bg-gradient-to-b from-white/[0.09] to-white/[0.03] backdrop-blur-xl border border-white/10 ring-1 ring-inset ring-white/5 p-4 md:p-7 rounded-2xl shadow-2xl shadow-blue-500/10 text-right">
            {/* Segmented control tabs (Cars vs Properties) */}
            <div className="mb-4 md:mb-6 rounded-xl border border-white/10 bg-[#0F172A]/60 p-1" role="tablist" aria-label={t('searchTabCars')}>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'cars'}
                  onClick={() => setActiveTab('cars')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 sm:px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 ${
                    activeTab === 'cars'
                      ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Car className="w-5 h-5" />
                  <span>{t('searchTabCars')}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'properties'}
                  onClick={() => setActiveTab('properties')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 sm:px-4 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 ${
                    activeTab === 'properties'
                      ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Building2 className="w-5 h-5" />
                  <span>{t('searchTabProperties')}</span>
                </button>
              </div>
            </div>

            {/* Search Form */}
            <form onSubmit={handleSearchSubmit} className="space-y-3 md:space-y-4">
              {activeTab === 'cars' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                  <div className="space-y-1.5">
                    <label className={searchLabelClass}>{t('searchCityOrAgency')}</label>
                    <div className="group relative">
                      <MapPin className={searchIconClass} />
                      <select
                        value={carCity}
                        onChange={(e) => setCarCity(e.target.value)}
                        className={searchFieldClass}
                      >
                        <option value="الدار البيضاء" className="bg-[#0F172A] text-white">{t('cityCasablanca')}</option>
                        <option value="مراكش" className="bg-[#0F172A] text-white">{t('cityMarrakech')}</option>
                        <option value="أغادير" className="bg-[#0F172A] text-white">{t('cityAgadir')}</option>
                        <option value="طنجة" className="bg-[#0F172A] text-white">{t('cityTangier')}</option>
                        <option value="الرباط" className="bg-[#0F172A] text-white">{t('cityRabat')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={searchLabelClass}>{t('searchPickupDate')}</label>
                    <div className="group relative">
                      <Calendar className={searchIconClass} />
                      <input
                        type="date"
                        value={pickupDate}
                        onChange={(e) => setPickupDate(e.target.value)}
                        className={searchFieldClass}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={searchLabelClass}>{t('searchDropoffDate')}</label>
                    <div className="group relative">
                      <Calendar className={searchIconClass} />
                      <input
                        type="date"
                        value={dropoffDate}
                        onChange={(e) => setDropoffDate(e.target.value)}
                        className={searchFieldClass}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                  <div className="space-y-1.5">
                    <label className={searchLabelClass}>{t('searchPropertyLocation')}</label>
                    <div className="group relative">
                      <MapPin className={searchIconClass} />
                      <select
                        value={propLocation}
                        onChange={(e) => setPropLocation(e.target.value)}
                        className={searchFieldClass}
                      >
                        <option value="مراكش" className="bg-[#0F172A] text-white">{t('marrakechDistricts')}</option>
                        <option value="الدار البيضاء" className="bg-[#0F172A] text-white">{t('casablancaDistricts')}</option>
                        <option value="طنجة" className="bg-[#0F172A] text-white">{t('tangierDistricts')}</option>
                        <option value="الرباط" className="bg-[#0F172A] text-white">{t('rabatDistricts')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={searchLabelClass}>{t('searchPropertyType')}</label>
                    <div className="group relative">
                      <Building2 className={searchIconClass} />
                      <select
                        value={propType}
                        onChange={(e) => setPropType(e.target.value)}
                        className={searchFieldClass}
                      >
                        <option value="apartment" className="bg-[#0F172A] text-white">{t('propTypeApartment')}</option>
                        <option value="villa" className="bg-[#0F172A] text-white">{t('propTypeVilla')}</option>
                        <option value="studio" className="bg-[#0F172A] text-white">{t('propTypeStudio')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className={searchLabelClass}>{t('searchMaxPrice')}</label>
                    <div className="group relative">
                      <DollarSign className={searchIconClass} />
                      <select
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                        className={searchFieldClass}
                      >
                        <option value="1000" className="bg-[#0F172A] text-white">{t('maxPriceUnder1000')}</option>
                        <option value="2500" className="bg-[#0F172A] text-white">{t('maxPriceUnder2500')}</option>
                        <option value="5000" className="bg-[#0F172A] text-white">{t('maxPriceUnder5000')}</option>
                        <option value="10000" className="bg-[#0F172A] text-white">{t('maxPriceOver5000')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2 md:pt-3">
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-l from-blue-600 via-blue-600 to-indigo-600 hover:from-blue-500 hover:via-blue-500 hover:to-indigo-500 text-white font-extrabold tracking-wide py-3.5 md:py-4 rounded-xl md:rounded-2xl text-sm md:text-base border border-blue-400/30 shadow-xl shadow-blue-600/30 hover:shadow-2xl hover:shadow-blue-500/60 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer transition-all duration-300"
                >
                  <Search className="w-5 h-5" />
                  <span>{t('searchSubmitAdvanced')}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Car Brands Marquee Section (OneClickDrive Morocco Style) */}
      <section className="py-7 md:py-10 bg-card/40 border-y border-border overflow-hidden">
        <div className="container mx-auto max-w-6xl px-4 text-center mb-4 md:mb-6">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('popularCarBrandsTitle')}</p>
        </div>
        <div className="flex overflow-x-auto no-scrollbar gap-3 md:gap-6 px-4 py-2 justify-start md:justify-center items-stretch flex-nowrap md:flex-wrap max-w-6xl mx-auto snap-x">
          {[
            { name: "Mercedes-Benz", icon: "⭐", count: 45 },
            { name: "Range Rover", icon: "🚙", count: 30 },
            { name: "BMW", icon: "🏎️", count: 40 },
            { name: "Audi", icon: "🚘", count: 25 },
            { name: "Dacia", icon: "🚗", count: 80 },
            { name: "Renault", icon: "🚙", count: 60 },
            { name: "Hyundai", icon: "🚗", count: 50 },
            { name: "Volkswagen", icon: "🚘", count: 35 }
          ].map((brand, idx) => (
            <Link key={idx} href={`/search?type=car&brand=${brand.name}`}>
              <div className="bg-card hover:bg-[#2563EB] hover:text-white text-foreground border border-border hover:border-[#2563EB] px-4 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl shadow-sm transition-all duration-300 flex items-center gap-2.5 cursor-pointer group min-w-[150px] md:min-w-[160px] shrink-0 snap-start justify-center">
                <span className="text-2xl group-hover:scale-110 transition-transform">{brand.icon}</span>
                <div className="text-right">
                  <h4 className="font-black text-sm">{brand.name}</h4>
                  <span className="text-[10px] text-slate-400 group-hover:text-white">{t('brandCarCount')}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Real Estate Types Marquee Section */}
      <section className="py-8 bg-card/40 border-b border-border overflow-hidden">
        <div className="container mx-auto max-w-6xl px-4 text-center mb-4 md:mb-6">
          <p className="text-xs font-bold text-[#0B0F19] uppercase tracking-widest">{t('propertyTypesTitle')}</p>
        </div>
        <div className="flex overflow-x-auto no-scrollbar gap-3 md:gap-6 px-4 py-2 justify-start md:justify-center items-stretch flex-nowrap md:flex-wrap max-w-6xl mx-auto snap-x">
          {[
            { nameKey: "propLuxuryVillas", icon: "🏡", count: 25 },
            { nameKey: "propModernApartments", icon: "🏢", count: 90 },
            { nameKey: "propCornichePenthouses", icon: "🏙️", count: 15 },
            { nameKey: "propBusinessStudios", icon: "🏨", count: 40 },
            { nameKey: "propSecureResidences", icon: "🏘️", count: 30 }
          ].map((type, idx) => (
            <Link key={idx} href={`/search?type=property&category=${type.nameKey}`}>
              <div className="bg-muted hover:bg-[#2563EB] hover:text-white text-foreground border border-border hover:border-[#2563EB] px-4 md:px-6 py-3 md:py-3.5 rounded-xl md:rounded-2xl shadow-sm transition-all duration-300 flex items-center gap-2.5 cursor-pointer group min-w-[160px] md:min-w-[170px] shrink-0 snap-start justify-center">
                <span className="text-2xl group-hover:scale-110 transition-transform">{type.icon}</span>
                <div className="text-right">
                  <h4 className="font-black text-sm">{t(type.nameKey)}</h4>
                  <span className="text-[10px] text-muted-foreground group-hover:text-white">{t('brandPropertyCount')}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Bento Grid Section (Separating Cars and Properties cleanly) */}
      <section className="py-10 md:py-16 px-4 container mx-auto max-w-6xl">
        <div className="text-center space-y-3 mb-8 md:mb-12">
          <span className="text-[#2563EB] font-bold text-xs uppercase tracking-widest bg-[#2563EB]/10 px-3 py-1 rounded-full border border-[#2563EB]/30">
            {t('bentoBadge')}
          </span>
          <h2 className="text-2xl md:text-3xl font-black text-[#0B0F19]">{t('bentoTitle')}</h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            {t('bentoSubtitle')}
          </p>
        </div>

        {/* Bento Grid layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Cars Bento Box (Large 2 cols on md) */}
          <div className="md:col-span-2 bg-gradient-to-br from-[#0B0F19] to-slate-900 text-white p-5 md:p-8 rounded-2xl md:rounded-3xl shadow-xl relative overflow-hidden flex flex-col justify-between group">
            <div className="absolute -left-10 -bottom-10 w-64 h-64 bg-[#2563EB]/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="relative z-10 space-y-4 max-w-md">
              <div className="w-12 h-12 bg-[#2563EB] rounded-2xl flex items-center justify-center text-white shadow-lg">
                <Car className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black">{t('bentoFleetTitle')}</h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                {t('bentoFleetDescription')}
              </p>
              <div>
                <Link href="/search?type=car">
                  <Button className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-6 py-3 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-[#2563EB]/40 cursor-pointer">
                    <span>{t('browseCarsAvailable')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="mt-8 relative z-10">
              <OptimizedImage 
                src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=800" 
                alt="Cars Fleet" 
                className="rounded-xl md:rounded-2xl shadow-2xl object-cover h-36 sm:h-48 w-full group-hover:scale-105 transition-transform duration-500 border border-white/10"
              />
            </div>
          </div>

          {/* Card 2: Real Estate Bento Box */}
          <div className="bg-card border border-border p-5 md:p-8 rounded-2xl md:rounded-3xl shadow-xl flex flex-col justify-between group">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-[#0B0F19] rounded-2xl flex items-center justify-center text-white shadow-lg">
                <Building2 className="w-6 h-6 text-[#2563EB]" />
              </div>
              <h3 className="text-xl font-black text-[#0B0F19]">{t('bentoRealEstateTitle')}</h3>
              <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
                {t('bentoRealEstateDescription')}
              </p>
              <div>
                <Link href="/search?type=property">
                  <Button className="bg-[#0B0F19] hover:bg-[#062940] text-white font-bold px-6 py-3 rounded-xl text-xs flex items-center gap-2 shadow-md cursor-pointer">
                    <span>{t('browsePropertiesAvailable')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="mt-6">
              <OptimizedImage
                src="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=70&w=800"
                srcSet="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=65&w=480 480w, https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=70&w=800 800w"
                sizes="(max-width: 768px) 100vw, 50vw"
                alt="Properties"
                loading="lazy"
                decoding="async"
                width={800}
                height={320}
                className="rounded-xl md:rounded-2xl shadow-lg object-cover h-32 sm:h-40 w-full group-hover:scale-105 transition-transform duration-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Featured Listing Cards Section */}
      <section className="py-10 md:py-16 px-4 container mx-auto max-w-6xl">
        <PageHeader
          eyebrow={t('featuredListingsBadge')}
          title={t('featuredListingsTitle')}
          action={{ label: t('viewAllListings'), href: '/search' }}
        />

        {/* Listing Cards Grid */}
        <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {activeListings.slice(0, 6).map((item, index) => (
            <ListingCard
              key={item.id}
              id={item.id}
              title={item.title}
              city={item.city}
              pricePerDay={item.pricePerUnit}
              images={item.image ? [item.image] : []}
              type={item.type === 'property' ? 'property' : 'car'}
              specs={{
                transmission: item.specs?.transmission,
                fuel: item.specs?.fuel,
                seats: item.specs?.seats ? Number(item.specs.seats) : undefined,
                rooms: (item.specs as any)?.rooms ? Number((item.specs as any).rooms) : undefined,
              }}
              className={`stagger-${Math.min(index + 1, 8)} animate-fade-up`}
            />
          ))}
        </div>
      </section>

      {/* WordPress-Style Featured Blog Section */}
      <section className="py-10 md:py-16 bg-muted/40 mt-6 md:mt-12 border-y border-border">
        <div className="container mx-auto max-w-6xl px-4 space-y-8">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
            <div>
              <span className="text-[#2563EB] font-bold text-xs uppercase tracking-widest bg-[#2563EB]/10 px-3 py-1 rounded-full">{t('blogBadge')}</span>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-[#0B0F19] mt-2">{t('blogTitle')}</h2>
            </div>
            <Link href="/blog">
              <Button variant="outline" className="border-[#0B0F19] text-[#0B0F19] hover:bg-[#0B0F19] hover:text-white rounded-xl text-xs font-bold gap-2">
                <span>{t('browseAllArticles')}</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card rounded-2xl md:rounded-3xl overflow-hidden shadow-sm border border-border hover:-translate-y-2 hover:shadow-xl hover:border-[#2563EB]/40 transition-all duration-300 flex flex-col group">
              <div className="h-40 sm:h-48 overflow-hidden">
                <OptimizedImage src="https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800" alt="Car rental" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
              <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between space-y-3">
                <span className="text-xs font-bold text-[#2563EB]">{t('blogTravelGuideTag')}</span>
                <h3 className="font-black text-[#0B0F19] text-base group-hover:text-[#2563EB] transition-colors">{t('blogCard1Title')}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2">{t('blogCard1Description')}</p>
                <Link href="/blog">
                  <span className="text-xs font-bold text-[#0B0F19] flex items-center gap-1 pt-2 hover:underline">{t('readMore')} <ArrowRight className="w-3 h-3" /></span>
                </Link>
              </div>
            </div>

            <div className="bg-card rounded-2xl md:rounded-3xl overflow-hidden shadow-sm border border-border hover:-translate-y-2 hover:shadow-xl hover:border-[#2563EB]/40 transition-all duration-300 flex flex-col group">
              <div className="h-40 sm:h-48 overflow-hidden">
                <OptimizedImage src="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800" alt="Real Estate" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
              <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between space-y-3">
                <span className="text-xs font-bold text-[#2563EB]">{t('blogPropInvestmentTag')}</span>
                <h3 className="font-black text-[#0B0F19] text-base group-hover:text-[#2563EB] transition-colors">{t('blogCard2Title')}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2">{t('blogCard2Description')}</p>
                <Link href="/blog">
                  <span className="text-xs font-bold text-[#0B0F19] flex items-center gap-1 pt-2 hover:underline">{t('readMore')} <ArrowRight className="w-3 h-3" /></span>
                </Link>
              </div>
            </div>

            <div className="bg-card rounded-2xl md:rounded-3xl overflow-hidden shadow-sm border border-border hover:-translate-y-2 hover:shadow-xl hover:border-[#2563EB]/40 transition-all duration-300 flex flex-col group">
              <div className="h-40 sm:h-48 overflow-hidden">
                <OptimizedImage src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=800" alt="Driving" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
              <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between space-y-3">
                <span className="text-xs font-bold text-[#2563EB]">{t('blogDrivingTipsTag')}</span>
                <h3 className="font-black text-[#0B0F19] text-base group-hover:text-[#2563EB] transition-colors">{t('blogCard3Title')}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2">{t('blogCard3Description')}</p>
                <Link href="/blog">
                  <span className="text-xs font-bold text-[#0B0F19] flex items-center gap-1 pt-2 hover:underline">{t('readMore')} <ArrowRight className="w-3 h-3" /></span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <FAQSection />

      {/* Trust & Features Banner */}
      <section className="py-10 md:py-16 bg-[#0B0F19] text-white mt-0">
        <div className="container mx-auto max-w-6xl px-4 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 text-center">
          <div className="space-y-3">
            <div className="w-14 h-14 bg-[#2563EB] text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h4 className="font-bold text-base md:text-lg">{t('trustTitle1')}</h4>
            <p className="text-xs text-slate-300">{t('trustDesc1')}</p>
          </div>
          <div className="space-y-3">
            <div className="w-14 h-14 bg-[#2563EB] text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg">
              <Award className="w-7 h-7" />
            </div>
            <h4 className="font-bold text-base md:text-lg">{t('trustTitle2')}</h4>
            <p className="text-xs text-slate-300">{t('trustDesc2')}</p>
          </div>
          <div className="space-y-3">
            <div className="w-14 h-14 bg-[#2563EB] text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg">
              <Clock className="w-7 h-7" />
            </div>
            <h4 className="font-bold text-base md:text-lg">{t('trustTitle3')}</h4>
            <p className="text-xs text-slate-300">{t('trustDesc3')}</p>
          </div>
        </div>
      </section>

    </div>
  );
}
