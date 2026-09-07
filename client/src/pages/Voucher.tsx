import { useParams, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, MapPin, MessageCircle, Phone, CalendarDays, Copy, Download, ArrowLeft, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { OptimizedImage } from '@/components/OptimizedImage';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

export default function VoucherPage() {
  const { code = '' } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const voucherQuery = trpc.vouchers.getByCode.useQuery({ code }, { enabled: code.length >= 8, retry: false });
  const data = voucherQuery.data;

  if (voucherQuery.isLoading) return <div className="min-h-[60vh] grid place-items-center text-slate-500">جاري تحميل تذكرة الوصول الذكي...</div>;
  if (voucherQuery.isError || !data) return <div className="min-h-[60vh] grid place-items-center p-6 text-center"><div><Ticket className="mx-auto mb-3 h-10 w-10 text-amber-600" /><h1 className="text-2xl font-bold text-slate-900">التذكرة غير متاحة</h1><p className="mt-2 text-slate-500">تأكد من تسجيل الدخول وأن الرابط يخص حجزك.</p><Button className="mt-5" onClick={() => setLocation('/my-bookings')}>العودة إلى حجوزاتي</Button></div></div>;

  const start = new Date(data.startDate).toLocaleDateString('fr-MA');
  const end = new Date(data.endDate).toLocaleDateString('fr-MA');
  const phone = data.ownerWhatsApp?.replace(/[^0-9+]/g, '') || '';
  const whatsappUrl = buildWhatsAppUrl(data.ownerWhatsApp, `مرحباً، أتوصل بخصوص الحجز ${data.voucher.code} — ${data.listingTitle}.`);
  const copyCode = async () => { await navigator.clipboard?.writeText(data.voucher.code); toast.success('تم نسخ كود الحجز.'); };
  const downloadQr = () => { const link = document.createElement('a'); link.href = data.qrCodeDataUrl; link.download = `${data.voucher.code}-QR.png`; link.click(); };

  return <section className="min-h-[70vh] bg-slate-50 px-4 py-8 sm:px-6">
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">ALTUSplace Morocco</p><h1 className="mt-1 text-3xl font-black text-[#0B0F15]">الوصول الذكي · Smart Access</h1></div><Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="mr-1 h-4 w-4" /> تذكرة صالحة</Badge></div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-[#0B0F15]"><Ticket className="h-5 w-5 text-amber-600" /> تفاصيل الحجز</CardTitle></CardHeader><CardContent className="space-y-5">
          {data.listingImageUrl && <OptimizedImage src={data.listingImageUrl} alt={data.listingTitle} width={900} height={300} widthHint={900} sizes="(max-width: 1024px) 100vw, 60vw" className="h-48 w-full rounded-xl object-cover" />}
          <div><p className="text-sm text-slate-500">السيارة أو العقار</p><h2 className="text-2xl font-bold text-slate-900">{data.listingTitle}</h2><p className="mt-1 flex items-center gap-1 text-slate-600"><MapPin className="h-4 w-4 text-amber-600" />{data.listingCity} · {data.listingCategory === 'car' ? 'سيارة' : 'عقار'}</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">بداية الحجز</p><p className="mt-1 flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4 text-amber-600" />{start}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">نهاية الحجز</p><p className="mt-1 flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4 text-amber-600" />{end}</p></div></div>
          <div className="border-t pt-4"><p className="text-sm text-slate-500">الشريك المؤجر</p><p className="font-bold text-slate-900">{data.ownerName || 'الشريك'}</p><div className="mt-3 flex flex-wrap gap-2"><a href={data.mapsUrl} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><MapPin className="mr-1 h-4 w-4" /> Google Maps</Button></a>{phone && <a href={`tel:${phone}`}><Button variant="outline" size="sm"><Phone className="mr-1 h-4 w-4" /> اتصال مباشر</Button></a>}{whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer"><Button size="sm" className="bg-[#25D366] text-white hover:bg-[#1ebe5d]"><MessageCircle className="mr-1 h-4 w-4" /> WhatsApp</Button></a>}</div><p className="mt-3 text-xs text-slate-500">ملاحظة: رابط الخرائط الافتراضي مبني على اسم الإعلان والمدينة، ويمكن للشريك لاحقاً إضافة موقع دقيق.</p></div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardHeader><CardTitle className="text-center text-[#0B0F15]">رمز الدخول الرقمي</CardTitle></CardHeader><CardContent className="flex flex-col items-center text-center"><div className="rounded-2xl border bg-white p-4"><img src={data.qrCodeDataUrl} alt="QR Code لتذكرة الحجز" width={260} height={260} className="h-[260px] w-[260px]" /></div><p className="mt-5 text-sm text-slate-500">أبرز هذا الرمز عند استلام السيارة أو الوصول إلى العقار.</p><button onClick={copyCode} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 font-mono font-bold text-amber-800"><Copy className="h-4 w-4" />{data.voucher.code}</button><div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="outline" size="sm" onClick={downloadQr}><Download className="mr-1 h-4 w-4" /> تنزيل QR</Button><Button variant="ghost" size="sm" onClick={() => setLocation('/my-bookings')}><ArrowLeft className="mr-1 h-4 w-4" /> حجوزاتي</Button></div><div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-right text-xs leading-5 text-amber-950"><p className="font-bold">إخلاء المسؤولية</p><p className="mt-1">ALTUSplace منصة إعلانية ووسيط تقني فقط، ولا تتحمل مسؤولية الحالة الميكانيكية للسيارة أو حالة العقار ونظافته. يتحمل الشريك مسؤولية الأصل المعروض، ويجب على الزبون معاينته وإبلاغ الشريك بأي تحفظ عند التسليم، في حدود ما يسمح به القانون المغربي.</p></div><p className="mt-4 text-xs text-slate-400">هذه التذكرة لا تستبدل العقد أو إثبات الهوية. لا تشارك رابطها مع غير أطراف الحجز.</p></CardContent></Card>
      </div>
    </div>
  </section>;
}
