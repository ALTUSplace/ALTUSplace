/**
 * SecurePaymentModal.tsx - Enhanced secure payment modal for ALTUSplace
 * Provides a professional checkout experience with CMI card payment simulation
 */
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldCheck, CreditCard, Lock, CheckCircle2, Loader2, Building2, Smartphone, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SecurePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (transactionId: string) => void;
  amount: number;
  currency?: string;
  description?: string;
}

type PaymentMethod = 'cmi_card' | 'bank_transfer' | 'mobile_wallet';

const formatCardNumber = (value: string): string => {
  const cleaned = value.replace(/\D/g, '');
  const groups = cleaned.match(/.{1,4}/g);
  return groups ? groups.join(' ') : cleaned;
};

const formatExpiry = (value: string): string => {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length >= 2) {
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`;
  }
  return cleaned;
};

const detectCardType = (number: string): 'visa' | 'mastercard' | 'amex' | 'unknown' => {
  const cleaned = number.replace(/\D/g, '');
  if (/^4/.test(cleaned)) return 'visa';
  if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return 'mastercard';
  if (/^3[47]/.test(cleaned)) return 'amex';
  return 'unknown';
};

export function SecurePaymentModal({
  isOpen,
  onClose,
  onSuccess,
  amount,
  currency = 'درهم',
  description,
}: SecurePaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cmi_card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'method' | 'details' | 'processing' | 'success'>('method');
  const [transactionId, setTransactionId] = useState('');
  const cvvInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const cardType = detectCardType(cardNumber);

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    if (formatted.replace(/\D/g, '').length <= 16) {
      setCardNumber(formatted);
    }
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpiry(e.target.value);
    if (formatted.replace(/\D/g, '').length <= 4) {
      setExpiry(formatted);
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '');
    if (cleaned.length <= 4) {
      setCvv(cleaned);
    }
  };

  const validateCardForm = (): boolean => {
    const cleanedNumber = cardNumber.replace(/\D/g, '');
    if (cleanedNumber.length < 13) {
      toast.error('رقم البطاقة غير صالح. يرجى إدخال رقم بطاقة صحيح.');
      return false;
    }
    if (!cardHolder.trim() || cardHolder.trim().length < 3) {
      toast.error('يرجى إدخال اسم حامل البطاقة.');
      return false;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      toast.error('تاريخ الانتهاء غير صالح. استخدم الصيغة MM/YY.');
      return false;
    }
    const [month, year] = expiry.split('/');
    const expiryDate = new Date(2000 + parseInt(year), parseInt(month) - 1);
    if (expiryDate < new Date()) {
      toast.error('البطاقة منتهية الصلاحية. يرجى استخدام بطاقة سارية.');
      return false;
    }
    if (cvv.length < 3) {
      toast.error('رمز التحقق CVV غير صالح.');
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === 'cmi_card' && !validateCardForm()) return;

    setStep('processing');
    setLoading(true);

    setTimeout(() => {
      const txnId = 'CMI-MA-' + Math.floor(100000 + Math.random() * 900000);
      setTransactionId(txnId);
      setLoading(false);
      setStep('success');
      toast.success('تمت عملية الدفع بنجاح! رقم المعاملة: ' + txnId);
    }, 2500);
  };

  const handleSuccessClose = () => {
    onSuccess(transactionId);
    resetForm();
  };

  const resetForm = () => {
    setCardNumber('');
    setCardHolder('');
    setExpiry('');
    setCvv('');
    setStep('method');
    setTransactionId('');
  };

  const handleClose = () => {
    if (!loading) {
      resetForm();
      onClose();
    }
  };

  const getCardIcon = () => {
    switch (cardType) {
      case 'visa':
        return (
          <svg className="w-8 h-5" viewBox="0 0 32 20" fill="none">
            <rect width="32" height="20" rx="3" fill="#1A1F71" />
            <text x="16" y="13" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">VISA</text>
          </svg>
        );
      case 'mastercard':
        return (
          <svg className="w-8 h-5" viewBox="0 0 32 20" fill="none">
            <rect width="32" height="20" rx="3" fill="#2D2D2D" />
            <circle cx="13" cy="10" r="6" fill="#EB001B" />
            <circle cx="19" cy="10" r="6" fill="#F79E1B" />
          </svg>
        );
      default:
        return <CreditCard className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl text-slate-100 overflow-hidden">
        <div className="bg-gradient-to-l from-amber-500/10 to-slate-950 border-b border-slate-800 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/20 p-2.5 rounded-xl border border-amber-500/30 text-amber-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-white">الدفع الآمن</h3>
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  مشفرة بمعيار PCI-DSS عبر مركز البنك المغربي (CMI)
                </p>
              </div>
            </div>
            <button onClick={handleClose} disabled={loading} className="text-slate-400 hover:text-white text-sm font-bold w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center transition-colors disabled:opacity-50">✕</button>
          </div>
        </div>

        <div className="px-6 pt-5">
          <div className="bg-gradient-to-l from-amber-500/10 to-transparent border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">المبلغ الإجمالي للدفع</p>
              {description && <p className="text-[11px] text-slate-500">{description}</p>}
            </div>
            <span className="text-2xl font-black text-amber-400">{amount.toLocaleString()} <span className="text-sm font-bold">{currency}</span></span>
          </div>
        </div>

        <div className="p-6">
          {step === 'method' && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-slate-300">اختر طريقة الدفع</p>
              <div className="space-y-3">
                <button onClick={() => { setPaymentMethod('cmi_card'); setStep('details'); }} className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-amber-500 bg-amber-500/5 transition-all text-right">
                  <div className="bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/20"><CreditCard className="w-5 h-5 text-blue-400" /></div>
                  <div className="flex-1"><p className="font-bold text-sm">بطاقة بنكية (CMI)</p><p className="text-[11px] text-slate-400">Visa, Mastercard, CMI</p></div>
                </button>
                <button onClick={() => { setPaymentMethod('bank_transfer'); setStep('details'); }} className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-700 hover:border-slate-600 bg-slate-900 transition-all text-right">
                  <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20"><Building2 className="w-5 h-5 text-emerald-400" /></div>
                  <div className="flex-1"><p className="font-bold text-sm">تحويل بنكي</p><p className="text-[11px] text-slate-400">تحويل مباشر إلى حساب الوكالة</p></div>
                </button>
                <button onClick={() => { setPaymentMethod('mobile_wallet'); setStep('details'); }} className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-700 hover:border-slate-600 bg-slate-900 transition-all text-right">
                  <div className="bg-purple-500/10 p-2.5 rounded-xl border border-purple-500/20"><Smartphone className="w-5 h-5 text-purple-400" /></div>
                  <div className="flex-1"><p className="font-bold text-sm">محفظة إلكترونية</p><p className="text-[11px] text-slate-400">Himti, Jumia Pay, Barid Cash</p></div>
                </button>
              </div>
            </div>
          )}

          {step === 'details' && paymentMethod === 'cmi_card' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="bg-gradient-to-bl from-slate-800 via-slate-900 to-slate-800 rounded-2xl p-5 border border-slate-700 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-bl from-amber-500/5 to-transparent" />
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">{getCardIcon()}<div className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" />CMI Secure</div></div>
                  <p className="font-mono text-lg tracking-[0.2em] text-white mb-4">{cardNumber || '•••• •••• •••• ••••'}</p>
                  <div className="flex justify-between items-end">
                    <div><p className="text-[9px] text-slate-500 mb-0.5">حامل البطاقة</p><p className="text-xs font-bold text-slate-300 uppercase">{cardHolder || 'YOUR NAME'}</p></div>
                    <div><p className="text-[9px] text-slate-500 mb-0.5">ينتهي</p><p className="text-xs font-bold text-slate-300">{expiry || 'MM/YY'}</p></div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">رقم البطاقة</label>
                  <div className="relative">
                    <input type="text" inputMode="numeric" autoComplete="cc-number" placeholder="4532 •••• •••• 8821" value={cardNumber} onChange={handleCardNumberChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 font-mono tracking-widest transition-colors" required />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2">{getCardIcon()}</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">اسم حامل البطاقة</label>
                  <input type="text" autoComplete="cc-name" placeholder="مثال: YOUSSEF ALAOUI" value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 uppercase transition-colors" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">تاريخ الانتهاء</label>
                    <input type="text" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" maxLength={5} value={expiry} onChange={handleExpiryChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 text-center font-mono transition-colors" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">CVV</label>
                    <input ref={cvvInputRef} type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} placeholder="•••" value={cvv} onChange={handleCvvChange} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 text-center font-mono transition-colors" required />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <Lock className="w-4 h-4 shrink-0" />
                <span>معاملة مشفرة بـ 256-bit SSL وفق معايير البنك المركبي المغربي ومؤسسة CMI</span>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" onClick={() => setStep('method')} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />رجوع</Button>
                <Button type="submit" disabled={loading} className="flex-[2] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-3 rounded-xl text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" />تأكيد دفع {amount.toLocaleString()} {currency}</Button>
              </div>
            </form>
          )}

          {step === 'details' && paymentMethod === 'bank_transfer' && (
            <div className="space-y-5">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3"><Building2 className="w-5 h-5 text-emerald-400" /><p className="font-bold text-sm text-emerald-300">معلومات التحويل البنكي</p></div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-800"><span className="text-slate-400">اسم البنك:</span><span className="font-bold text-white">BMCE Bank</span></div>
                  <div className="flex justify-between py-2 border-b border-slate-800"><span className="text-slate-400">IBAN:</span><span className="font-mono text-white text-xs">MA 0023 4456 7890 1234 5678 9012</span></div>
                  <div className="flex justify-between py-2 border-b border-slate-800"><span className="text-slate-400">BIC/SWIFT:</span><span className="font-mono text-white">BMCEMAMC</span></div>
                  <div className="flex justify-between py-2"><span className="text-slate-400">المبلغ:</span><span className="font-bold text-amber-400">{amount.toLocaleString()} {currency}</span></div>
                </div>
              </div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-300">يرجى إرسال إيصال التحويل عبر واتساب أو البريد الإلكتروني لتأكيد الحجز.</div>
              <div className="flex gap-3 pt-2">
                <Button type="button" onClick={() => setStep('method')} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />رجوع</Button>
                <Button onClick={handleSubmit} className="flex-[2] bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />تأكيد طلب التحويل</Button>
              </div>
            </div>
          )}

          {step === 'details' && paymentMethod === 'mobile_wallet' && (
            <div className="space-y-5">
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3"><Smartphone className="w-5 h-5 text-purple-400" /><p className="font-bold text-sm text-purple-300">الدفع عبر المحفظة الإلكترونية</p></div>
                <div className="grid grid-cols-3 gap-3">
                  {['Himti', 'Jumia Pay', 'Barid Cash'].map((wallet) => (
                    <button key={wallet} className="p-4 rounded-xl border border-slate-700 bg-slate-900 hover:border-purple-500/50 transition-all text-center">
                      <Smartphone className="w-5 h-5 text-purple-400 mx-auto mb-2" /><p className="text-[11px] font-bold text-slate-300">{wallet}</p>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 text-center">سيتم تحويلك إلى تطبيق المحفظة لإتمام الدفع</p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" onClick={() => setStep('method')} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />رجوع</Button>
                <Button onClick={handleSubmit} className="flex-[2] bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"><Smartphone className="w-4 h-4" />متابعة الدفع</Button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="py-12 flex flex-col items-center justify-center space-y-6">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-amber-500/20 rounded-full" />
                <div className="absolute inset-0 w-20 h-20 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 text-amber-400 animate-spin" /></div>
              </div>
              <div className="text-center space-y-2"><p className="font-bold text-white">جاري معالجة الدفع...</p><p className="text-xs text-slate-400">يرجى عدم إغلاق هذه النافذة</p></div>
              <div className="flex items-center gap-2 text-[11px] text-emerald-400"><Lock className="w-3.5 h-3.5" /><span>اتصال مشفر وآمن</span></div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 bg-emerald-500/20 border-2 border-emerald-500/40 rounded-full flex items-center justify-center"><CheckCircle2 className="w-10 h-10 text-emerald-400" /></div>
              <div className="text-center space-y-2"><p className="text-xl font-extrabold text-white">تمت عملية الدفع بنجاح!</p><p className="text-sm text-slate-400">رقم المعاملة: <span className="text-amber-400 font-mono font-bold">{transactionId}</span></p></div>
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full"><div className="flex justify-between text-sm"><span className="text-slate-400">المبلغ المدفوع:</span><span className="font-bold text-emerald-400">{amount.toLocaleString()} {currency}</span></div></div>
              <Button onClick={handleSuccessClose} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />متابعة إلى تفاصيل الحجز</Button>
            </div>
          )}
        </div>

        {step !== 'processing' && step !== 'success' && (
          <div className="px-6 pb-5">
            <div className="flex items-center justify-center gap-4 pt-4 border-t border-slate-800">
              <div className="flex items-center gap-1 text-[10px] text-slate-500"><Lock className="w-3 h-3" /><span>PCI-DSS Compliant</span></div>
              <div className="flex items-center gap-1 text-[10px] text-slate-500"><ShieldCheck className="w-3 h-3" /><span>256-bit SSL</span></div>
              <div className="flex items-center gap-1 text-[10px] text-slate-500"><ShieldCheck className="w-3 h-3" /><span>CMI Certified</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SecurePaymentModal;
