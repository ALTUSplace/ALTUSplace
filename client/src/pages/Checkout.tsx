import { useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { calculateRentalDays, calculateRentalSubtotal } from '@/lib/pricing';
import PaymentCheckoutModal from '@/components/PaymentCheckoutModal';

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);

  const rawListingId = searchParams.get('listingId') || '';
  const parsedListingId = Number(rawListingId);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cmi_card' | 'cash'>('cmi_card');

  const { data: listing, isLoading, error } = trpc.listings.getById.useQuery(
    { id: parsedListingId },
    { enabled: !isNaN(parsedListingId) && parsedListingId > 0 }
  );

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = () => {
    toast.success('تم تأكيد الحجز بنجاح!');
    setLocation('/my-bookings');
  };

  if (isLoading) {
    return <LoadingAnimation />;
  }

  if (error || !listing || isNaN(parsedListingId) || parsedListingId <= 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <p className="text-lg text-slate-600 mb-4">تعذر تحميل العروض حالياً. يرجى المحاولة مرة أخرى بعد قليل.</p>
        <Button onClick={() => setLocation('/')}>الرجوع</Button>
      </div>
    );
  }

  const days = calculateRentalDays(
    searchParams.get('startDate') || new Date().toISOString(),
    searchParams.get('endDate') || new Date().toISOString()
  );
  const subtotal = calculateRentalSubtotal(listing.pricePerDay || 100, days);

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-5 sm:space-y-7 p-4">
        <form onSubmit={handleCheckout} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">تفاصيل الحجز</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="font-semibold">{listing.title}</p>
                <p className="text-sm text-slate-500">المدة: {days} أيام</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">طريقة الدفع</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div 
                  onClick={() => setPaymentMethod('cmi_card')}
                  className={`p-4 rounded-xl border-2 cursor-pointer flex items-center gap-3 transition-all ${
                    paymentMethod === 'cmi_card' ? 'border-amber-500 bg-amber-50 shadow-sm' : 'border-slate-200'
                  }`}
                >
                  <CreditCard className="w-6 h-6 text-amber-600" />
                  <div>
                    <p className="font-semibold">بطاقة بانكية (CMI)</p>
                    <p className="text-xs text-slate-500">دفع آمن ومباشر عبر البطاقة</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-lg">ملخص الطلب</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span>المجموع</span>
                  <span className="font-semibold">{subtotal} درهم</span>
                </div>
                <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                  تأكيد الدفع
                </Button>
              </CardContent>
            </Card>
          </div>
        </form>
      </div>

      <PaymentCheckoutModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={handlePaymentSuccess}
        amount={subtotal}
        currency="درهم"
      />
    </>
  );
}