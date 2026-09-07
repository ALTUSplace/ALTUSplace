import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ShieldCheck, FileText, Download, CheckCircle, PenTool, Printer } from 'lucide-react';
import { toast } from 'sonner';

interface ContractProps {
  bookingId?: string;
  customerName: string;
  vendorName: string;
  itemName: string;
  itemType: 'car' | 'property';
  startDate: string;
  endDate: string;
  totalPrice: number;
  commission: number;
}

export const DigitalContractModal: React.FC<ContractProps> = ({
  bookingId = 'ALT-' + Math.floor(100000 + Math.random() * 900000),
  customerName,
  vendorName,
  itemName,
  itemType,
  startDate,
  endDate,
  totalPrice,
  commission
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [signatureName, setSignatureName] = useState('');

  const handleSign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signatureName.trim()) {
      toast.error('الرجاء إدخال الاسم الكامل للتوقيع الإلكتروني');
      return;
    }
    setIsSigned(true);
    toast.success('تم توقيع العقد الرقمي بنجاح وتوثيقه عبر الوسيط المعتمد B2-Rent');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 bg-amber-500/10 border-amber-500/30 text-amber-600 hover:bg-amber-500/20">
          <FileText className="w-4 h-4" />
          عقد الوساطة الرقمي (PDF)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 text-slate-100 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-amber-400">
            <ShieldCheck className="w-6 h-6 text-amber-500" />
            عقد وساطة رقمي معتمد - منصة B2-Rent
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4 print:bg-white print:text-black">
          {/* Header */}
          <div className="flex justify-between items-start border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-100 print:text-black">عقد إيجار ووساطة إلكترونية</h3>
              <p className="text-sm text-slate-400 print:text-slate-600">رقم العقد: {bookingId}</p>
              <p className="text-xs text-amber-500/80">تاريخ الإصدار: {new Date().toLocaleDateString('ar-MA')}</p>
            </div>
            <div className="text-left">
              <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs font-semibold rounded-full border border-amber-500/30">
                مصدق من الوسيط B2-Rent
              </span>
            </div>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 print:bg-slate-100">
            <div>
              <h4 className="font-semibold text-amber-400 text-sm mb-1">الطرف الأول (المؤجر / الوكالة):</h4>
              <p className="text-slate-300 print:text-slate-800 text-sm">{vendorName}</p>
              <p className="text-xs text-slate-400">المملكة المغربية</p>
            </div>
            <div>
              <h4 className="font-semibold text-amber-400 text-sm mb-1">الطرف الثاني (المستأجر / الزبون):</h4>
              <p className="text-slate-300 print:text-slate-800 text-sm">{customerName}</p>
              <p className="text-xs text-slate-400">مسجل بمنصة B2-Rent</p>
            </div>
          </div>

          {/* Item details */}
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-200 text-sm">تفاصيل موضوع العقد:</h4>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-sm space-y-2 print:bg-slate-100">
              <div className="flex justify-between">
                <span className="text-slate-400">نوع الخدمة:</span>
                <span className="font-medium text-slate-200">{itemType === 'car' ? 'تأجير سيارة' : 'إيجار عقار'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">العنوان / الموديل:</span>
                <span className="font-medium text-slate-200">{itemName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">فترة الإيجار:</span>
                <span className="font-medium text-slate-200">من {startDate} إلى {endDate}</span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-2">
                <span className="text-slate-400">المبلغ الإجمالي:</span>
                <span className="font-bold text-amber-400">{totalPrice.toLocaleString()} درهم مغربي</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>عمولة المنصة (10%):</span>
                <span>{commission.toLocaleString()} درهم (مضمنة)</span>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="text-xs text-slate-400 space-y-1.5 leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800 print:bg-slate-100">
            <p className="font-semibold text-slate-300">الشروط والأحكام القانونية للوساطة:</p>
            <p>1. تقر منصة B2-Rent بأنها وسيط إلكتروني بين الطرفين، وتضمن إتمام المعاملة وحجز العربون وفق نظام الضمان (Escrow).</p>
            <p>2. يتحمل الطرف الأول (المؤجر) كامل المسؤولية عن سلامة وحالة الموضوع المؤجر وجاهزيته للاستخدام.</p>
            <p>3. يلتزم الطرف الثاني (المستأجر) بإعادة الموضوع المؤجر في التاريخ المحدد وبنفس الحالة التي استلمه بها.</p>
          </div>

          {/* Signature Section */}
          <div className="border-t border-slate-800 pt-4">
            {isSigned ? (
              <div className="bg-cyan-500/10 border border-cyan-500/30 p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-cyan-400" />
                  <div>
                    <p className="text-sm font-bold text-emerald-400">تم التوقيع الرقمي بنجاح</p>
                    <p className="text-xs text-slate-300">الموقع: {signatureName} | التوقيت: {new Date().toLocaleString('ar-MA')}</p>
                  </div>
                </div>
                <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2 bg-slate-800 text-slate-200 border-slate-700">
                  <Printer className="w-4 h-4" />
                  طباعة / تحميل PDF
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSign} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <PenTool className="w-4 h-4" />
                  التوقيع الرقمي الإلكتروني (Mock Digital Signature)
                </h4>
                <p className="text-xs text-slate-400">الرجاء كتابة اسمك الثلاثي لتأكيد الاعتماد القانوني لهذا العقد:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="الاسم الكامل (مثال: محمد العلوي)"
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white">
                    توقيع العقد اعتماداً
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
