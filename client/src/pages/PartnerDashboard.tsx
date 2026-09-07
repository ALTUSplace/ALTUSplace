import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Car, Building2, Plus, DollarSign, CheckCircle2, XCircle, Clock, Upload, Trash2, Edit, TrendingUp, Calendar, Wallet, Award, ArrowUpRight, Download, Send } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from 'recharts';
import { AdvancedMediaUpload } from '@/components/AdvancedMediaUpload';
import { OptimizedImage } from '@/components/OptimizedImage';

const monthlyPartnerData = [
  { name: 'يناير', الأرباح: 8400, الحجوزات: 6 },
  { name: 'فبراير', الأرباح: 12200, الحجوزات: 9 },
  { name: 'مارس', الأرباح: 15600, الحجوزات: 14 },
  { name: 'أبريل', الأرباح: 19800, الحجوزات: 18 },
  { name: 'ماي', الأرباح: 24500, الحجوزات: 23 },
  { name: 'يونيو', الأرباح: 31200, الحجوزات: 28 },
];

export default function PartnerDashboard() {
  const utils = trpc.useUtils();
  const { data: listings = [], isLoading: listingsLoading } = trpc.listings.list.useQuery();
  const { data: bookings = [], isLoading: bookingsLoading } = trpc.bookings.list.useQuery();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'car' | 'real_estate'>('car');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState('الدار البيضاء');
  const [imageUrl, setImageUrl] = useState('');
  const [imageVerificationProof, setImageVerificationProof] = useState('');
  const [description, setDescription] = useState('');

  // Wallet and Payout state
  const [balance, setBalance] = useState(48250);
  const [payoutAmount, setPayoutAmount] = useState('');

  const createListingMutation = trpc.listings.create.useMutation({
    onSuccess: () => {
      toast.success('تمت إضافة الإعلان بنجاح في أسطول الشريك!');
      utils.listings.list.invalidate();
      setIsAddOpen(false);
      setTitle('');
      setPrice('');
      setImageUrl('');
      setImageVerificationProof('');
      setDescription('');
    },
    onError: (err) => {
      toast.error('خطأ أثناء إضافة الإعلان: ' + err.message);
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !price) {
      toast.error('يرجى تعبئة الحقول الإجبارية');
      return;
    }
    if (!imageUrl || !imageVerificationProof) {
      toast.error('يرجى رفع صورة أصلية واجتياز الفحص قبل نشر الإعلان');
      return;
    }
    createListingMutation.mutate({
      title,
      category,
      pricePerDay: Number(price),
      city,
      imageUrl,
      imageVerificationProof,
      description: description || 'إعلان معتمد من الشريك الموثوق'
    });
  };

  const handleRequestPayout = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(payoutAmount);
    if (!amt || amt <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح للسحب');
      return;
    }
    if (amt > balance) {
      toast.error('المبلغ المطلوب يتجاوز رصيد المحفظة المتاح');
      return;
    }
    setBalance(balance - amt);
    setPayoutAmount('');
    toast.success(`تم تقديم طلب سحب مبلغ ${amt} د.م بنجاح وسيتم تحويله لحسابك البنكي خلال 24 ساعة!`);
  };

  const generateGoldCertificate = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFillColor(10, 25, 47);
    doc.rect(0, 0, 297, 210, 'F');
    doc.setTextColor(212, 175, 55);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.text("B2-Rent Premium Partner Certificate", 148, 40, { align: 'center' });
    doc.setFontSize(16);
    doc.text("This is to certify that", 148, 65, { align: 'center' });
    doc.setFontSize(24);
    doc.text("وكالة الأناقة للسيارات والعقارات المتميزة", 148, 85, { align: 'center' });
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("Has achieved Gold Partner Status for exceptional performance, exceeding 50+ bookings monthly.", 148, 110, { align: 'center' });
    doc.text("Issued by B2-Rent Morocco Brokerage Platform", 148, 140, { align: 'center' });
    doc.save("b2rent-gold-partner-certificate.pdf");
    toast.success('تم تنزيل شهادة الشريك الذهبي الرسمية بصيغة PDF بنجاح!');
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10 font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">لوحة تحكم الشريك</h1>
              <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 gap-1 font-bold">
                <Award className="w-4 h-4" /> شريك ذهبي (Gold Tier)
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              إدارة الأسطول، العقارات، المحفظة المالية، وسحوبات الأرباح الفورية.
            </p>
          </div>
          <Button onClick={() => setIsAddOpen(!isAddOpen)} className="gap-2 bg-primary text-primary-foreground font-semibold">
            <Plus className="w-5 h-5" /> إضافة عقار أو سيارة جديدة
          </Button>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card p-1 rounded-xl border border-border grid grid-cols-2 md:grid-cols-5 max-w-4xl">
            <TabsTrigger value="overview" className="rounded-lg gap-2">
              <TrendingUp className="w-4 h-4" /> نظرة عامة والأرباح
            </TabsTrigger>
            <TabsTrigger value="wallet" className="rounded-lg gap-2">
              <Wallet className="w-4 h-4" /> المحفظة والسحوبات
            </TabsTrigger>
            <TabsTrigger value="listings" className="rounded-lg gap-2">
              <Car className="w-4 h-4" /> إدارتي للإعلانات
            </TabsTrigger>
            <TabsTrigger value="requests" className="rounded-lg gap-2">
              <Calendar className="w-4 h-4" /> طلبات الحجز
            </TabsTrigger>
            <TabsTrigger value="rewards" className="rounded-lg gap-2">
              <Award className="w-4 h-4" /> المكافآت والشهادات
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6 border-border shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" /> تطور الأرباح الشهرية (د.م)
                  </h3>
                  <span className="text-xs text-muted-foreground bg-primary/10 px-2.5 py-1 rounded-full font-semibold">عمولة مخفضة 6% للشريك الذهبي</span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyPartnerData}>
                      <defs>
                        <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#d4af37" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#d4af37" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="name" stroke="#888888" fontSize={12} />
                      <YAxis stroke="#888888" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }} />
                      <Area type="monotone" dataKey="الأرباح" stroke="#d4af37" strokeWidth={3} fillOpacity={1} fill="url(#colorEarnings)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-6 border-border shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" /> عدد الحجوزات الشهرية المؤكدة
                  </h3>
                  <span className="text-xs text-muted-foreground bg-emerald-500/10 text-emerald-600 px-2.5 py-1 rounded-full font-semibold">نمو قياسي مستمر</span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyPartnerData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="name" stroke="#888888" fontSize={12} />
                      <YAxis stroke="#888888" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }} />
                      <Bar dataKey="الحجوزات" fill="#d4af37" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Wallet & Payouts Tab */}
          <TabsContent value="wallet" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                <p className="text-sm font-semibold text-muted-foreground">رصيد المحفظة المتاح للسحب</p>
                <h3 className="text-3xl font-extrabold text-primary mt-2">{balance.toLocaleString()} د.م</h3>
                <p className="text-xs text-muted-foreground mt-1">يتم تحديث الرصيد تلقائياً فور اكتمال الحجوزات</p>
              </Card>
              <Card className="p-6">
                <p className="text-sm font-semibold text-muted-foreground">إجمالي الأرباح المحققة هذا الشهر</p>
                <h3 className="text-3xl font-extrabold mt-2">31,200 د.م</h3>
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5" /> +28% مقارنة بالشهر السابق
                </p>
              </Card>
              <Card className="p-6">
                <p className="text-sm font-semibold text-muted-foreground">نسبة عمولة المنصة الحالية</p>
                <h3 className="text-3xl font-extrabold text-amber-500 mt-2">6% فقط</h3>
                <p className="text-xs text-muted-foreground mt-1">ميزة الشريك الذهبي المميز</p>
              </Card>
            </div>

            <Card className="p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary" /> طلب سحب الأرباح إلى الحساب البنكي
              </h3>
              <form onSubmit={handleRequestPayout} className="max-w-md space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">المبلغ المراد سحبه (د.م)</label>
                  <input 
                    type="number" 
                    value={payoutAmount} 
                    onChange={(e) => setPayoutAmount(e.target.value)} 
                    placeholder="مثال: 10000" 
                    className="w-full p-3 rounded-xl bg-background border border-border text-sm" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">طريقة السحب واستلام الأموال</label>
                  <select className="w-full p-3 rounded-xl bg-background border border-border text-sm">
                    <option value="bank">تحويل بنكي مباشر (RIB)</option>
                    <option value="wafacash">وفاكاش (WafaCash - سحب نقدي فوري)</option>
                    <option value="cashplus">كاش بلوس (Cash Plus - وكالات مغربية)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">رقم الحساب أو رقم الهاتف المعتمد</label>
                  <input 
                    type="text" 
                    defaultValue="MA64 0111 2222 3333 4444 5555 66" 
                    className="w-full p-3 rounded-xl bg-background border border-border text-sm" 
                  />
                </div>
                <Button type="submit" className="w-full font-bold bg-amber-500 hover:bg-amber-600 text-slate-950">
                  تأكيد وإرسال طلب السحب الفوري
                </Button>
              </form>
            </Card>
          </TabsContent>

          {/* Listings Tab */}
          <TabsContent value="listings" className="space-y-6">
            {isAddOpen && (
              <Card className="p-6 border-primary/30 shadow-lg">
                <h3 className="text-xl font-bold mb-4">إضافة سيارة أو عقار جديد للأسطول</h3>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">عنوان الإعلان</label>
                      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: مرسيدس S-Class أو شقة كازا" className="w-full p-3 rounded-xl bg-background border border-border text-sm" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">التصنيف</label>
                      <select value={category} onChange={(e) => setCategory(e.target.value as any)} className="w-full p-3 rounded-xl bg-background border border-border text-sm">
                        <option value="car">سيارة فاخرة</option>
                        <option value="real_estate">عقار / شقة / فيلا</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">السعر اليومي (د.م)</label>
                      <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1200" className="w-full p-3 rounded-xl bg-background border border-border text-sm" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">المدينة</label>
                      <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full p-3 rounded-xl bg-background border border-border text-sm">
                        <option value="الدار البيضاء">الدار البيضاء</option>
                        <option value="مراكش">مراكش</option>
                        <option value="الرباط">الرباط</option>
                        <option value="طنجة">طنجة</option>
                        <option value="أغادير">أغادير</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">وصف الإعلان</label>
                    <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="تفاصيل ومميزات الإعلان..." className="w-full p-3 rounded-xl bg-background border border-border text-sm"></textarea>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">رفع صور الأسطول (مع معاينة وعلامة مائية تلقائية)</label>
                    <AdvancedMediaUpload onImagesUploaded={(images) => { const first = images[0]; setImageUrl(first?.url || ''); setImageVerificationProof(first?.verificationProof || ''); }} />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button type="submit" className="font-bold">حفظ ونشر الإعلان</Button>
                    <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>إلغاء</Button>
                  </div>
                </form>
              </Card>
            )}

            <h2 className="text-xl font-semibold">إعلاناتي الحالية في المنصة</h2>
            {listingsLoading ? (
              <div className="text-center py-12 text-muted-foreground">جاري تحميل الإعلانات...</div>
            ) : listings.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">لا توجد إعلانات مسجلة بعد.</p>
                <Button className="mt-4" onClick={() => setIsAddOpen(true)}>أضف إعلانك الأول</Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map((item: any) => (
                  <Card key={item.id} className="overflow-hidden border-border hover:shadow-md transition-shadow">
                    <div className="relative h-48 bg-muted">
                      <OptimizedImage src={item.imageUrl} alt={item.title} width={900} height={520} widthHint={900} sizes="(max-width: 768px) 100vw, 50vw" className="w-full h-full object-cover" />
                      <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground font-bold">
                        {item.category === 'car' ? 'سيارة' : 'عقار'}
                      </Badge>
                    </div>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg line-clamp-1">{item.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">{item.city} | {item.pricePerDay} د.م / يوم</p>
                    </CardHeader>
                    <CardContent className="flex justify-between items-center pt-2 border-t border-border">
                      <span className="text-xs text-emerald-600 font-bold bg-emerald-500/10 px-2 py-1 rounded">متاح للحجز</span>
                      <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => toast.info('تم تحديث حالة التوفر بنجاح')}>
                        تغيير الحالة
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">طلبات الحجز الواردة من العملاء (مع إشعارات فورية)</h2>
              <Badge className="bg-primary/10 text-primary animate-pulse">تنبيهات WhatsApp نشطة</Badge>
            </div>
            {bookingsLoading ? (
              <div className="text-center py-12 text-muted-foreground">جاري تحميل الطلبات...</div>
            ) : bookings.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">لا توجد طلبات حجز واردة حالياً.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {bookings.map((booking: any) => (
                  <Card key={booking.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-border">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-bold text-lg">طلب حجز #{booking.id}</h4>
                        <Badge className={booking.status === 'Confirmed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}>
                          {booking.status === 'Confirmed' ? 'مؤكد' : 'قيد الانتظار'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">الفترة: من {new Date(booking.startDate).toLocaleDateString('ar-MA')} إلى {new Date(booking.endDate).toLocaleDateString('ar-MA')}</p>
                      <div className="text-sm space-y-0.5">
                        <p className="text-muted-foreground">المبلغ الإجمالي للزبون: <span className="font-bold text-foreground">{booking.totalPrice} د.م</span></p>
                        <p className="text-primary font-bold">صافي أرباحك (بعد عمولة الشريك الذهبي 6%): {Math.round(booking.totalPrice * 0.94)} د.م</p>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 flex-1 md:flex-none" onClick={() => toast.success('تم قبول طلب الحجز وإرسال إشعار WhatsApp فور للعميل')}>
                        <CheckCircle2 className="w-4 h-4" /> قبول وإرسال إشعار
                      </Button>
                      <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50 flex-1 md:flex-none" onClick={() => toast.error('تم رفض طلب الحجز')}>
                        <XCircle className="w-4 h-4" /> رفض
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Rewards & Certificates Tab */}
          <TabsContent value="rewards" className="space-y-6">
            <Card className="p-8 bg-gradient-to-r from-amber-500/10 via-primary/5 to-transparent border-amber-500/30">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-8 h-8 text-amber-500" />
                    <h3 className="text-2xl font-bold">الشريك الذهبي (Gold Partner Tier)</h3>
                  </div>
                  <p className="text-muted-foreground max-w-2xl">
                    لقد تخطيت حاجز 50 حجزاً ناجحاً هذا الشهر! تتمتع الآن بأقل عمولة منصة في السوق (6%)، أولوية قصوى في نتائج البحث بالخريطة، ودعم تسويقي ومحاسبي مخصص.
                  </p>
                </div>
                <Button onClick={generateGoldCertificate} className="gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-6 py-6 text-base">
                  <Download className="w-5 h-5" /> تحميل شهادة التقدير الرسمية (PDF)
                </Button>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 border-amber-500/30 bg-card">
                <h4 className="font-bold text-lg mb-2 text-amber-500">الشريك البرونزي</h4>
                <p className="text-sm text-muted-foreground mb-4">البداية الطبيعية لكل شريك جديد في المنصة.</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• عمولة المنصة: 10%</p>
                  <p>• دعم فني أساسي</p>
                </div>
              </Card>
              <Card className="p-6 border-primary/30 bg-card">
                <h4 className="font-bold text-lg mb-2 text-primary">الشريك الفضي</h4>
                <p className="text-sm text-muted-foreground mb-4">عند إتمام أكثر من 20 حجزاً شهرياً.</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• عمولة المنصة: 8%</p>
                  <p>• تمييز الإعلانات بشارة فضية</p>
                </div>
              </Card>
              <Card className="p-6 border-amber-400 bg-amber-500/5 shadow-md">
                <h4 className="font-bold text-lg mb-2 text-amber-600 flex items-center justify-between">
                  <span>الشريك الذهبي</span>
                  <Badge className="bg-amber-500 text-slate-950 font-bold">المستوى الحالي</Badge>
                </h4>
                <p className="text-sm text-muted-foreground mb-4">أكثر من 50 حجزاً شهرياً (أنت هنا!).</p>
                <div className="text-xs text-foreground space-y-1 font-medium">
                  <p>• عمولة المنصة المخفضة: 6%</p>
                  <p>• شهادة تقدير شهرية آلية</p>
                  <p>• إشعارات فورية عبر WhatsApp و Email</p>
                </div>
              </Card>
            </div>
          </TabsContent>

        </Tabs>

      </div>
    </div>
  );
}
