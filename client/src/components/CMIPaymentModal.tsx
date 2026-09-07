import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldCheck, CreditCard, Lock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface CMIPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (transactionId: string) => void;
  amount: number;
}

export function CMIPaymentModal({ isOpen, onClose, onSuccess, amount }: CMIPaymentModalProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber || !cardHolder || !expiry || !cvv) {
      toast.error('الرجاء إدخال كافة بيانات البطاقة البنكية المطلوبة.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const txnId = 'CMI-MA-' + Math.floor(100000 + Math.random() * 900000);
      toast.success(`تمت عملية الدفع بنجاح عبر CMI! رقم المعاملة: ${txnId}`);
      onSuccess(txnId);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-8 max-w-md w-full space-y-6 shadow-2xl text-slate-100">
        
        {/* CMI Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="bg-amber-500/20 p-2 rounded-xl border border-amber-500/30 text-amber-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">مركز البنك المغربي (CMI)</h3>
              <p className="text-[10px] text-slate-400">بوابة الدفع الإلكتروني الآمنة بالدرهم المغربي (MAD)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex items-center justify-between">
          <span className="text-xs text-slate-300 font-semibold">المبلغ الإجمالي للدفع:</span>
          <span className="text-lg font-black text-amber-400">{amount.toLocaleString()} درهم</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5 text-right">
            <label className="text-xs font-bold text-slate-300">اسم حامل البطاقة</label>
            <input
              type="text"
              placeholder="مثال: YOUSSEF ALAOUI"
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 uppercase"
              required
            />
          </div>

          <div className="space-y-1.5 text-right">
            <label className="text-xs font-bold text-slate-300">رقم البطاقة البنكية (16 رقم)</label>
            <input
              type="text"
              maxLength={16}
              placeholder="4532 •••• •••• 8821"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono tracking-widest"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 text-right">
              <label className="text-xs font-bold text-slate-300">تاريخ الانتهاء</label>
              <input
                type="text"
                placeholder="MM/YY"
                maxLength={5}
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-mono"
                required
              />
            </div>

            <div className="space-y-1.5 text-right">
              <label className="text-xs font-bold text-slate-300">رمز التحقق (CVV)</label>
              <input
                type="password"
                maxLength={4}
                placeholder="•••"
                value={cvv}
                onChange={(e) => setCvv(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 text-center font-mono"
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-cyan-400 bg-cyan-500/10 p-3 rounded-xl border border-cyan-500/20">
            <Lock className="w-4 h-4 shrink-0" />
            <span>معاملة مشفرة وآمنة وفق معايير البنك المركزي المغربي ومؤسسة CMI.</span>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-5 py-2.5 rounded-xl text-xs"
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>جاري معالجة الدفع...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>تأكيد دفع {amount.toLocaleString()} درهم</span>
                </>
              )}
            </Button>
          </div>
        </form>

      </div>
    </div>
  );
}
