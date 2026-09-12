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
  const [carCity, setCarCity] = useState('casablanca');
  const [pickupDate, setPickupDate] = useState('');
  const [dropoffDate, setDropoffDate] = useState('');

  // Search states for Properties
  const [propLocation, setPropLocation] = useState('marrakech');
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

  // â”€â”€ Premium light hero style tokens (international marketplace UI) â”€â”€
  const fieldBase =
    'group relative flex flex-1 items-center gap-3 rounded-xl px-4 py-3 text-right transition-all duration-200 cursor-pointer hover:bg-slate-50 focus-within:bg-slate-50 focus-within:ring-2 focus-within:ring-inset focus-within:ring-amber-400/40';
  const fieldDivider = 'border-t sm:border-t-0 sm:border-s sm:border-slate-100';
  const fieldIconClass =
    'shrink-0 h-5 w-5 text-slate-400 transition-colors duration-200 group-hover:text-slate-500 group-focus-within:text-amber-500';
  const fieldCaptionClass =
    'text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-slate-400 transition-colors duration-200 group-focus-within:text-slate-500';
  const fieldControlClass =
    'w-full min-w-0 bg-transparent outline-none text-sm font-bold text-slate-800 placeholder:text-slate-300 cursor-pointer [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col" dir={direction}>
      
      {/* â”€â”€ Hero: Light premium Airbnb/Turo-style marketplace hero â”€â”€ */}
      <section className="relative pt-14 pb-16 md:pt-20 md:pb-24 px-4 overflow-hidden bg-gradient-to-b from-[#F4F6FB] via-white to-white text-slate-900">
        {/* Soft mesh gradient background */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-44 right-[10%] h-[420px] w-[420px] rounded-full bg-amber-200/40 blur-[120px]" />
          <div className="absolute top-6 left-[2%] h-96 w-96 rounded-full bg-sky-200/50 blur-[110px]" />
          <div className="absolute -bottom-32 left-1/3 h-80 w-80 rounded-full bg-rose-200/30 blur-[110px]" />
          <div className="absolute inset-x-0 top-0 h-px bg-slate-900/5" />
        </div>

        <div className="container mx-auto max-w-5xl text-center space-y-6 md:space-y-8 relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur px-5 py-2.5 rounded-full text-slate-700 text-sm font-bold tracking-wide shadow-sm ring-1 ring-slate-900/5 fade-in">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span>{t('heroBadge')}</span>
          </div>

          {/* Premium heading */}
          <h1 className="mx-auto max-w-3xl font-display text-[clamp(2rem,6vw,4.25rem)] font-black tracking-tight leading-[1.2]">
            {t('heroTitlePrefix')} <span className="text-amber-500">{t('heroTitleCars')}</span> {t('heroTitleAnd')} <span className="text-sky-600">{t('heroTitleProperties')}</span> <span className="text-slate-400">{t('heroTitleSuffix')}</span>
          </h1>

          {/* Subtitle */}
          <p className="text-slate-500 text-xs sm:text-sm md:text-base max-w-2xl mx-auto leading-relaxed font-medium">
            {t('heroDescription')}
          </p>

          {/* Featured review CTA */}
          <div className="flex justify-center">
            <Button
              onClick={() => window.open('/slides_project/cover_slide.html', '_blank')}
              className="bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200 px-6 py-2 rounded-full text-sm font-bold flex items-center gap-2 backdrop-blur shadow-sm hover:shadow-md transition-all duration-200"
            >
              <Award className="w-4 h-4 text-amber-500" />
              <span>{t('heroReviewButton')}</span>
            </Button>
          </div>

          {/* â”€â”€ Segmented pill tab switcher with sliding indicator â”€â”€ */}
          <div className="mx-auto w-fit mt-1">
            <div
              className="relative inline-flex rounded-full bg-slate-100/90 p-1.5 ring-1 ring-inset ring-slate-900/5"
              role="tablist"
              aria-label={t('searchTabCars')}
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-1.5 w-[calc(50%-6px)] rounded-full bg-white shadow-md ring-1 ring-slate-900/5 transition-all duration-300 ease-out"
                style={
                  activeTab === 'cars'
                    ? { insetInlineStart: '6px', insetInlineEnd: 'auto' }
                    : { insetInlineStart: 'auto', insetInlineEnd: '6px' }
                }
              />
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'cars'}
                onClick={() => setActiveTab('cars')}
                className={`relative z-10 inline-flex items-center justify-center gap-2 rounded-full px-6 sm:px-8 py-2.5 text-xs sm:text-sm font-bold transition-colors duration-200 ${
                  activeTab === 'cars' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Car className="w-5 h-5" strokeWidth={2} />
                <span>{t('searchTabCars')}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'properties'}
                onClick={() => setActiveTab('properties')}
                className={`relative z-10 inline-flex items-center justify-center gap-2 rounded-full px-6 sm:px-8 py-2.5 text-xs sm:text-sm font-bold transition-colors duration-200 ${
                  activeTab === 'properties' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Building2 className="w-5 h-5" strokeWidth={2} />
                <span>{t('searchTabProperties')}</span>
              </button>
            </div>
          </div>

          {/* â”€â”€ Floating seamless search pill bar â”€â”€ */}
          <div className="mx-auto max-w-3xl rounded-2xl bg-white/95 backdrop-blur-xl p-2 ring-1 ring-slate-900/5 shadow-[0_28px_70px_-28px_rgba(2,6,23,0.35)]">
            <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row sm:items-stretch rounded-xl text-right">
              {activeTab === 'cars' ? (
                <>
                  <label className={fieldBase}>
                    <MapPin className={fieldIconClass} strokeWidth={1.5} />
                    <span className="flex min-w-0 flex-1 flex-col items-start text-right">
                      <span className={fieldCaptionClass}>{t('searchCityOdgency')}</span>
                      <select
                        value={carCity}
                        onChange={(e) => setCarCity(e.target.value)}
                        className={fieldControlClass}
                      >
                        <option value="casablanca">{t('cityCasablanca')}</option>
                        <option value="marrakech">{t('cityMarrakech')}</option>
                        <option value="agadir">{t('cityAgadir')}</option>
                        <option value="tangier">{t('cityTangier')}</option>
                        <option value="rabat">{t('cityRabat')}</option>
                      </select>
                    </span>
                  </label>

                  <label className={`${fieldBase} ${fieldDivider}`}>
                    <Calendar className={fieldIconClass} strokeWidth={1.5} />
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
                    <Calendar className={fieldIconClass} strokeWidth={1.5} />
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
                </>
              ) : (
                <>
                  <label className={fieldBase}>
                    <MapPin className={fieldIconClass} strokeWidth={1.5} />
                    <span className="flex min-w-0 flex-1 flex-col items-start text-right">
                      <span className={fieldCaptionClass}>{t('searchPropertyLocation')}</span>
                      <select
                        value={propLocation}
                        onChange={(e) => setPropLocation(e.target.value)}
                        className={fieldControlClass}
                      >
                        <option value="marrakech">{t('marrakechDistricts')}</option>
                        <option value="casablanca">{t('casablancaDistricts')}</option>
                        <option value="tangier">{t('tangierDistricts')}</option>
                        <option value="rabat">{t('rabatDistricts')}</option>
                      </select>
                    </span>
                  </label>

                  <label className={`${fieldBase} ${fieldDivider}`}>
                    <Building2 className={fieldIconClass} strokeWidth={1.5} />
                    <span className="flex min-w-0 flex-1 flex-col items-start text-right">
                      <span className={fieldCaptionClass}>{t('searchPropertyType')}</span>
                      <select
                        value={propType}
                        onChange={(e) => setPropType(e.target.value)}
                        className={fieldControlClass}
                      >
                        <option value="apartment">{t('propTypeApartment')}</option>
                        <option value="villa">{t('propTypeVilla')}</option>
                        <option value="studio">{t('propTypeStudio')}</option>
                      </select>
                    </span>
                  </label>

                  <label className={`${fieldBase} ${fieldDivider}`}>
                    <DollarSign className={fieldIconClass} strokeWidth={1.5} />
                    <span className="flex min-w-0 flex-1 flex-col items-start text-right">
                      <span className={fieldCaptionClass}>{t('searchMaxPrice')}</span>
                      <select
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                        className={fieldControlClass}
                      >
                        <option value="1000">{t('maxPriceUnder1000')}</option>
                        <option value="2500">{t('maxPriceUnder2500')}</option>
                        <option value="5000">{t('maxPriceUnder5000')}</option>
                        <option value="10000">{t('maxPriceOver5000')}</option>
                      </select>
                    </span>
                  </label>
                </>
              )}

              {/* Circular search button */}
              <div className="flex items-center justify-center px-3 py-2 sm:py-0">
                <button
                  type="submit"
                  aria-label={t('searchSubmitAdvanced')}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30 transition-all duration-200 hover:scale-105 hover:from-amber-500 hover:to-orange-600 active:scale-95 active:shadow-md"
                >
                  <Search className="h-5 w-5" strokeWidth={2.5} />
                </button>
              </div>
            </form>
          </div>
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
        <div className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
