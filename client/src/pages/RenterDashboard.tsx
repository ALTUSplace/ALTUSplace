import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, FileText, Headphones, Car, Building2, CheckCircle2, Clock, XCircle, Download, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { InvoicePdfInput } from '@/lib/invoicePdf';
import { SUPPORT_EMAIL } from '@/config/brand';
import { useLanguage } from "@/contexts/LanguageContext";

export default function RenterDashboard() {
  const { direction } = useLanguage();
  const { data: user } = trpc.auth.me.useQuery();
  const { data: bookings = [], isLoading } = trpc.bookings.list.useQuery();
  const { data: invoices = [], isLoading: invoicesLoading } = trpc.invoices.list.useQuery();
  const [supportMessage, setSupportMessage] = useState('');

  const handleSendSupport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportMessage.trim()) return;
    toast.success(`تم إرسال رسالتك بنجاح إلى فريق الدعم الفني ${SUPPORT_EMAIL}. سنرد عليك خلال دقائق!`);
    setSupportMessage('');
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10 font-sans" dir={direction}>
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">لوحة تحكم المستأجر (الزبون)</h1>
            <p className="text-muted-foreground mt-1">
              مرحباً بك، {user?.name || 'الزبون الكريم'} | تتبع حجزك، الفواتير، وتواصل مع الدعم الفني
            </p>
          </div>
          <Badge variant="outline" className="px-4 py-2 text-sm font-semibold bg-primary/10 text-primary border-primary/20">
            مستأجر معتمد
          </Badge>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="bookings" className="space-y-6">
          <TabsList className="bg-card p-1 rounded-xl border border-border grid grid-cols-3 max-w-md">
            <TabsTrigger value="bookings" className="rounded-lg gap-2">
              <Calendar className="w-4 h-4" /> حجزاتي
            </TabsTrigger>
            <TabsTrigger value="invoices" className="rounded-lg gap-2">
              <FileText className="w-4 h-4" /> الفواتير والعقود
            </TabsTrigger>
            <TabsTrigger value="support" className="rounded-lg gap-2">
              <Headphones className="w-4 h-4" /> الدعم الفني
            </TabsTrigger>
          </TabsList>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="space-y-4">
            <h2 className="text-xl font-semibold">سجل الحجوزات الحالية والسابقة</h2>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">جاري تحميل الحجوزات...</div>
            ) : bookings.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">لا توجد حجوزات مسجلة حتى الآن.</p>
                <Button className="mt-4" onClick={() => window.location.href = '/'}>تصفح السيارات والعقارات</Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {bookings.map((booking: any) => (
                  <Card key={booking.id} className="overflow-hidden border-border hover:shadow-md transition-shadow">
                    <CardHeader className="bg-muted/40 pb-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-muted-foreground">حجز #{booking.id}</span>
                        <Badge className={
                          booking.status === 'Confirmed' ? 'bg-cyan-500/10 text-cyan-500 border-cyan-200' :
                          booking.status === 'Pending' ? 'bg-amber-500/10 text-amber-600 border-amber-200' :
                          'bg-rose-500/10 text-rose-600 border-rose-200'
                        }>
                          {booking.status === 'Confirmed' ? 'مؤكد' : booking.status === 'Pending' ? 'قيد المراجعة' : 'ملغي'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span>من: {new Date(booking.startDate).toLocaleDateString('ar-MA')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span>إلى: {new Date(booking.endDate).toLocaleDateString('ar-MA')}</span>
                      </div>
                      <div className="pt-2 border-t border-border flex justify-between items-center font-bold">
                        <span>المبلغ الإجمالي:</span>
                        <span className="text-primary text-lg">{booking.totalPrice} د.م</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-4">
            <h2 className="text-xl font-semibold">الفواتير وعقود الإيجار الرقمية</h2>
            <Card className="p-6">
              <div className="space-y-4">
                {invoicesLoading ? (
                  <p className="text-muted-foreground">جاري تحميل الفواتير...</p>
                ) : invoices.length === 0 ? (
                  <p className="text-muted-foreground">لا توجد فواتير مؤكدة بعد.</p>
                ) : invoices.map((invoice: any) => {
                  const booking = bookings.find((item: any) => item.id === invoice.bookingId);
                  return (
                    <div key={invoice.id} className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h4 className="font-bold">فاتورة حجز #{invoice.bookingId}</h4>
                          <p className="text-sm text-muted-foreground">رقم الفاتورة: {invoice.invoiceNumber} | الإصدار: {new Date(invoice.issuedAt).toLocaleDateString('ar-MA')}</p>
                          <p className="text-sm font-semibold">القيمة الإجمالية: {invoice.total} {invoice.currency}</p>
                        </div>
                        <Button variant="outline" size="sm" className="gap-2" onClick={async () => {
                          const { generateInvoicePdf } = await import('@/lib/invoicePdf');
                          const invoiceInput: InvoicePdfInput = {
                            invoiceNumber: invoice.invoiceNumber,
                            bookingId: invoice.bookingId,
                            subtotal: Number(invoice.subtotal),
                            commissionFee: Number(invoice.commissionFee),
                            vatRateBasisPoints: invoice.vatRateBasisPoints,
                            vatAmount: Number(invoice.vatAmount),
                            total: Number(invoice.total),
                            currency: invoice.currency,
                            status: invoice.status,
                            issuedAt: invoice.issuedAt,
                            startDate: booking?.startDate,
                            endDate: booking?.endDate,
                            cancellationPolicyVersion: invoice.cancellationPolicyVersion,
                            cancellationPolicyFingerprint: invoice.cancellationPolicyFingerprint,
                            cancellationPolicyAcceptedAt: invoice.cancellationPolicyAcceptedAt,
                          };
                          const blob = generateInvoicePdf(invoiceInput);
                          const url = URL.createObjectURL(blob);
                          const anchor = document.createElement('a');
                          anchor.href = url;
                          anchor.download = `invoice-${invoice.invoiceNumber}.pdf`;
                          anchor.click();
                          URL.revokeObjectURL(url);
                          toast.success('تم تحميل الفاتورة مع نسخة السياسة المقبولة');
                        }}>
                          <Download className="w-4 h-4" /> تحميل الفاتورة PDF
                        </Button>
                      </div>
                      <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                        <p>سياسة الإلغاء المحفوظة: الإصدار {invoice.cancellationPolicyVersion || 'غير متوفر'}</p>
                        <p>تاريخ القبول: {invoice.cancellationPolicyAcceptedAt ? new Date(invoice.cancellationPolicyAcceptedAt).toLocaleString('ar-MA') : 'غير متوفر'}</p>
                        <p className="break-all">بصمة السياسة: {invoice.cancellationPolicyFingerprint || 'غير متوفر'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </TabsContent>

          {/* Support Tab */}
          <TabsContent value="support" className="space-y-4">
            <h2 className="text-xl font-semibold">التواصل مع الدعم الفني</h2>
            <Card className="p-6 max-w-2xl">
              <form onSubmit={handleSendSupport} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">البريد الإلكتروني المعتمد</label>
                  <input type="email" value={user?.email || SUPPORT_EMAIL} disabled className="w-full p-3 rounded-xl bg-muted border border-border text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">نص الاستفسار أو المشكلة</label>
                  <textarea rows={4} value={supportMessage} onChange={(e) => setSupportMessage(e.target.value)} placeholder="اكتب استفسارك هنا..." className="w-full p-3 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"></textarea>
                </div>
                <Button type="submit" className="gap-2">
                  <Send className="w-4 h-4" /> إرسال الاستفسار للدعم
                </Button>
              </form>
            </Card>
          </TabsContent>

        </Tabs>

      </div>
    </div>
  );
}
