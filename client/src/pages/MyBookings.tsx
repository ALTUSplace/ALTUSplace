import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { BookmarkCheck, Calendar, FileText, CheckCircle, Clock, Phone, Download, Receipt, MessageCircle } from 'lucide-react';
import type { InvoicePdfInput } from '@/lib/invoicePdf';
import { OptimizedImage } from '@/components/OptimizedImage';
import { useLanguage } from "@/contexts/LanguageContext";

const formatDate = (value: string | Date) => new Date(value).toLocaleDateString('fr-MA');
const formatMoney = (value: number) => new Intl.NumberFormat('fr-MA').format(value);

export default function MyBookings() {
  const { direction } = useLanguage();
  const [, setLocation] = useLocation();
  const { data: dbBookings = [], isLoading: bookingsLoading } = trpc.bookings.list.useQuery();
  const { data: listings = [] } = trpc.listings.list.useQuery();
  const { data: invoices = [], isLoading: invoicesLoading, isError: invoicesError } = trpc.invoices.list.useQuery();
  const [contractBookingId, setContractBookingId] = useState<number | null>(null);
  const contractQuery = trpc.commercialLeaseContracts.getByBooking.useQuery(
    { bookingId: contractBookingId ?? 0 },
    { enabled: contractBookingId !== null },
  );
  const listingById = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings]);
  const invoiceByBooking = useMemo(() => new Map(invoices.map((invoice) => [invoice.bookingId, invoice])), [invoices]);

  const downloadInvoice = async (invoice: InvoicePdfInput) => {
    const { generateInvoicePdf } = await import('@/lib/invoicePdf');
    const blob = generateInvoicePdf(invoice);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoice.invoiceNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('تم تنزيل الفاتورة الإلكترونية بصيغة PDF.');
  };

  useEffect(() => {
    if (contractQuery.data?.pdfUrl) {
      window.open(contractQuery.data.pdfUrl, '_blank', 'noopener,noreferrer');
      setContractBookingId(null);
    } else if (contractQuery.isError) {
      toast.error('تعذر الوصول إلى عقد هذا الحجز.');
      setContractBookingId(null);
    }
  }, [contractQuery.data, contractQuery.isError]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-12" dir={direction}>
      <div className="container mx-auto px-4 max-w-4xl space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950 border border-slate-800 p-8 rounded-3xl shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-400">
              <BookmarkCheck className="w-7 h-7" />
            </div>
            <div>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">سجل المستأجر</span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white">حجوزاتي السابقة والحالية</h1>
            </div>
          </div>
          <Button onClick={() => setLocation('/search')} className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-6 py-3 rounded-xl">
            حجز جديد
          </Button>
        </div>

        {bookingsLoading ? (
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-10 text-center text-slate-400">جاري تحميل الحجوزات...</div>
        ) : dbBookings.length === 0 ? (
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-10 text-center text-slate-400">لا توجد حجوزات مرتبطة بحسابك حالياً.</div>
        ) : (
          <div className="space-y-6">
            {dbBookings.map((booking) => {
              const listing = listingById.get(booking.listingId);
              const isContractLoading = contractBookingId === booking.id && contractQuery.isFetching;
              return (
                <div key={booking.id} className="bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center gap-6">
                  <div className="w-full md:w-48 h-32 rounded-2xl overflow-hidden border border-slate-800 shrink-0 bg-slate-900">
                    {listing?.imageUrl && <OptimizedImage src={listing.imageUrl} alt={listing.title} width={640} height={320} widthHint={640} sizes="(max-width: 768px) 100vw, 192px" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 space-y-3 text-right w-full">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-amber-400">#{booking.id}</span>
                      {booking.status === 'Confirmed' ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold"><CheckCircle className="w-3.5 h-3.5" /> مؤكد</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 text-amber-400 px-3 py-1 rounded-full text-xs font-semibold"><Clock className="w-3.5 h-3.5" /> {booking.status}</span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-white">{listing?.title || `الإعلان رقم ${booking.listingId}`}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-300 pt-2 border-t border-slate-800">
                      <div className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-amber-400" /> {formatDate(booking.startDate)} — {formatDate(booking.endDate)}</div>
                      <div>المدينة: <span className="font-semibold text-white">{listing?.city || 'المغرب'}</span></div>
                      <div>المجموع: <span className="font-semibold text-amber-400">{formatMoney(booking.totalPrice)} MAD</span></div>
                    </div>
                  </div>
                  <div className="w-full md:w-auto flex md:flex-col gap-2 shrink-0">
                    {booking.status === 'Confirmed' && (
                      <Button
                        disabled={isContractLoading}
                        onClick={() => setContractBookingId(booking.id)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-xl text-xs font-bold"
                      >
                        {isContractLoading ? <span>جاري التحضير...</span> : <><Download className="w-4 h-4" /> عقد الكراء</>}
                      </Button>
                    )}
                    {invoiceByBooking.get(booking.id) && (
                      <Button
                        type="button"
                        onClick={() => downloadInvoice(invoiceByBooking.get(booking.id)!)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold"
                      >
                        <Receipt className="w-4 h-4" /> الفاتورة PDF
                      </Button>
                    )}
                    <Link href={`/messages/${booking.id}`} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[#0B0F19] hover:bg-[#0B0F19]/90 text-white px-4 py-2.5 rounded-xl text-xs font-semibold">
                      <MessageCircle className="w-4 h-4" /> مراسلة الطرف الآخر
                    </Link>
                    <a href="/support-tickets" className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold">
                      <Phone className="w-4 h-4" /> الدعم
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {invoicesLoading && <p className="text-center text-[11px] text-slate-500">جاري تحميل الفواتير...</p>}
        {invoicesError && <p className="text-center text-[11px] text-amber-400">تعذر تحميل الفواتير؛ يمكنك إعادة المحاولة من صفحة الملف الشخصي.</p>}
        <p className="text-center text-[11px] text-slate-500">الفواتير مستخرجة من قاعدة البيانات، وعقود الكراء نماذج تقنية يجب مراجعتها من طرف مهني قانوني مغربي قبل التوقيع.</p>
      </div>
    </div>
  );
}
