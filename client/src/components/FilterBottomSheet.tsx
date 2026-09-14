import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SlidersHorizontal, MapPin, Car, Building2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { MOROCCAN_CITIES } from '@/data/moroccoCities';

export default function FilterBottomSheet({ onApplyFilters }: { onApplyFilters?: (filters: any) => void }) {
  const [selectedCity, setSelectedCity] = useState('الكل');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [maxPrice, setMaxPrice] = useState(2000);
  const [isOpen, setIsOpen] = useState(false);

  const cities: string[] = ['الكل', ...MOROCCAN_CITIES];
  const categories = ['الكل', 'سيارات فاخرة', 'سيارات اقتصادية', 'شقق مفروشة', 'فلل'];

  const handleApply = () => {
    if (onApplyFilters) {
      onApplyFilters({ city: selectedCity, category: selectedCategory, maxPrice });
    }
    setIsOpen(false);
    toast.success('تم تطبيق فلاتر البحث بنجاح!');
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 font-semibold shadow-sm rounded-xl py-6 px-4">
          <SlidersHorizontal className="w-4 h-4 text-primary" /> تصفية متقدمة
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto px-6 py-6" dir="rtl">
        <SheetHeader className="text-right pb-4 border-b border-border">
          <SheetTitle className="text-xl font-bold flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-primary" /> خيارات التصفية والبحث
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Cities */}
          <div className="space-y-3">
            <label className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <MapPin className="w-4 h-4 text-primary" /> المدينة أو المنطقة
            </label>
            <div className="flex flex-wrap gap-2">
              {cities.map((city) => (
                <button
                  key={city}
                  onClick={() => setSelectedCity(city)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    selectedCity === city
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-3">
            <label className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Car className="w-4 h-4 text-primary" /> الفئة المطلوبة
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    selectedCategory === cat
                      ? 'bg-primary text-primary-foreground shadow-md'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm font-semibold">
              <span>الحد الأقصى للسعر اليومي:</span>
              <span className="text-primary font-bold">{maxPrice} د.م / يوم</span>
            </div>
            <input
              type="range"
              min="200"
              max="5000"
              step="100"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-full accent-primary cursor-pointer"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <Button className="w-full py-6 font-bold text-base shadow-md gap-2" onClick={handleApply}>
              <Check className="w-4 h-4" /> تطبيق الفلاتر
            </Button>
            <Button
              variant="outline"
              className="py-6 font-semibold"
              onClick={() => {
                setSelectedCity('الكل');
                setSelectedCategory('الكل');
                setMaxPrice(2000);
              }}
            >
              إعادة ضبط
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
