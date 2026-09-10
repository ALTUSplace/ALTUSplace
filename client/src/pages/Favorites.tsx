import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { LISTINGS, ListingItem } from '@/data/altusplace';
import { Button } from '@/components/ui/button';
import { Heart, MapPin, Trash2, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { OptimizedImage } from '@/components/OptimizedImage';
import { readBrandPreference, writeBrandPreference } from '@/config/brand';
import { useLanguage } from "@/contexts/LanguageContext";

export default function Favorites() {
  const { direction } = useLanguage();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'car' | 'property'>('all');
  const [sortBy, setSortBy] = useState<'price-asc' | 'price-desc'>('price-asc');

  useEffect(() => {
    // جلب المفضلة من LocalStorage أو استخدام عينة افتراضية
    const stored = readBrandPreference("favorites");
    if (stored) {
      try {
        setFavorites(JSON.parse(stored));
      } catch (e) {
        setFavorites(['list-1', 'list-2']);
      }
    } else {
      setFavorites(['list-1', 'list-2']);
    }
  }, []);

  const handleRemoveFavorite = (id: string) => {
    const updated = favorites.filter(favId => favId !== id);
    setFavorites(updated);
    writeBrandPreference("favorites", JSON.stringify(updated));
    toast.success('تمت إزالة العنصر من المفضلة');
  };

  const favoriteItems = LISTINGS.filter(item => favorites.includes(item.id)).filter(item => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'price-asc') return a.pricePerUnit - b.pricePerUnit;
    if (sortBy === 'price-desc') return b.pricePerUnit - a.pricePerUnit;
    return 0;
  });

  return (
    <div className="min-h-screen bg-background text-foreground py-12" dir={direction}>
      <div className="container mx-auto px-4 space-y-8">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="inline-flex items-center gap-2 text-amber-500 text-xs font-bold uppercase tracking-widest mb-1">
              <Heart className="w-4 h-4 fill-amber-500" /> قائمة المحفوظات المفضلة
            </div>
            <h1 className="text-3xl font-black text-white">السيارات والعقارات المحفوظة</h1>
          </div>

          {/* فلاتر الفرز والتصنيف للمفضلة */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl text-xs">
              <span className="text-slate-400 px-2">النوع:</span>
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${filterType === 'all' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'}`}
              >
                الكل
              </button>
              <button
                onClick={() => setFilterType('car')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${filterType === 'car' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'}`}
              >
                السيارات
              </button>
              <button
                onClick={() => setFilterType('property')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${filterType === 'property' ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'}`}
              >
                العقارات
              </button>
            </div>

            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl text-xs">
              <SlidersHorizontal className="w-4 h-4 text-amber-400 mr-2" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="price-asc">السعر: من الأرخص للأغلى</option>
                <option value="price-desc">السعر: من الأغلى للأرخص</option>
              </select>
            </div>
          </div>
        </div>

        {favoriteItems.length === 0 ? (
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-16 text-center space-y-4 max-w-xl mx-auto shadow-xl">
            <Heart className="w-16 h-16 text-slate-600 mx-auto" />
            <h3 className="text-xl font-bold text-white">قائمة المفضلة فارغة حالياً</h3>
            <p className="text-xs text-slate-400">تصفح أسطول السيارات والعقارات وأضف ما يعجبك إلى قائمتك الخاصة لتسهيل الرجوع إليها لاحقاً.</p>
            <Link href="/search">
              <Button className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-6 py-3 rounded-xl text-xs">
                تصفح العروض المتاحة
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favoriteItems.map(item => (
              <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-xl hover:border-amber-500/50 transition-all flex flex-col group">
                <div className="relative h-52 overflow-hidden bg-slate-900">
                  <OptimizedImage src={item.image} alt={item.title} width={640} height={360} widthHint={640} sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md text-amber-400 px-3 py-1 rounded-full text-xs font-bold border border-slate-800">
                    {item.category}
                  </div>
                  <button
                    onClick={() => handleRemoveFavorite(item.id)}
                    className="absolute top-3 left-3 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white p-2 rounded-xl border border-red-500/30 transition-all"
                    title="إزالة من المفضلة"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-3 left-3 bg-slate-950/90 backdrop-blur-md text-white px-3 py-1 rounded-xl text-xs font-extrabold border border-slate-800">
                    {item.pricePerUnit} {item.unitLabel}
                  </div>
                </div>

                <div className="p-6 space-y-4 flex-grow flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-amber-500" /> {item.city}</span>
                      <span className="text-amber-400 font-bold">{item.providerName}</span>
                    </div>
                    <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">{item.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{item.description}</p>
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                    <div className="text-xs text-slate-500">التقييمات تظهر بعد مراجعة موثقة</div>
                    <Link href={`/car/${item.id}`}>
                      <Button className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all shadow">
                        عرض التفاصيل
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
