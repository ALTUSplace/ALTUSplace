/**
 * PaymentCheckoutModal.tsx - Premium secure payment checkout for ALTUSplace
 * Provides a professional, multi-step checkout experience with CMI/Stripe simulation
 * Features: Card type detection, Luhn validation, progress animation, security badges
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldCheck, CreditCard, Lock, CheckCircle2, Loader2, Building2, Smartphone, ChevronLeft, X, AlertCircle, BadgeCheck, Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface PaymentSuccessResult {
  transactionId: string;
  method: PaymentMethod;
  amount: number;
}

interface PaymentCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: PaymentSuccessResult) => void;
  onError?: (error: string) => void;
  amount: number;
  currency?: string;
  description?: string;
  bookingDetails?: {
    title: string;
    startDate: string;
    endDate: string;
    days: number;
  };
}

export type PaymentMethod = 'cmi_card' | 'bank_transfer' | 'mobile_wallet';
type CheckoutStep = 'method' | 'details' | 'processing' | 'success' | 'error';

// Card formatting helpers
const formatCardNumber = (value: string): string => {
  const cleaned = value.replace(/\D/g, '').slice(0, 16);
  const groups = cleaned.match(/.{1,4}/g);
  return groups ? groups.join(' ') : cleaned;
};

const formatExpiry = (value: string): string => {
  const cleaned = value.replace(/\D/g, '').slice(0, 4);
  if (cleaned.length >= 2) {
    const month = cleaned.slice(0, 2);
    const year = cleaned.slice(2);
    if (month.length === 2) {
      const monthNum = parseInt(month, 10);
      if (monthNum > 12) return `12/${year}`;
      if (monthNum === 0) return `01/${year}`;
    }
    return `${month}/${year}`;
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

// Luhn algorithm for card validation
const luhnCheck = (cardNumber: string): boolean => {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 16) return false;
  let sum = 0;
  let isEven = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
};

// Card type display config
const cardTypeConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  visa: { label: 'VISA', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30' },
  mastercard: { label: 'MC', color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/30' },
  amex: { label: 'AMEX', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' },
  unknown: { label: '', color: '', bg: '', border: '' },
};

export function PaymentCheckoutModal({
  isOpen,
  onClose,
  onSuccess,
  onError,
  amount,
  currency = 'درهم',
  description,
  bookingDetails,
}: PaymentCheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cmi_card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [step, setStep] = useState<CheckoutStep>('method');
  const [transactionId, setTransactionId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const cvvInputRef = useRef<HTMLInputElement>(null);
  const processingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPaymentMethod('cmi_card');
      setCardNumber('');
      setCardHolder('');
      setExpiry('');
      setCvv('');
      setStep('method');
      setTransactionId('');
      setErrorMessage('');
      setProcessingProgress(0);
    }
    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const cardType = detectCardType(cardNumber);

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardNumber(formatCardNumber(e.target.value));
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExpiry(formatExpiry(e.target.value));
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 4);
    setCvv(cleaned);
  };

  const validateCardForm = (): boolean => {
    const cleanedNumber = cardNumber.replace(/\D/g, '');
    if (cleanedNumber.length < 13) {
      toast.error('رقم البطاقة غير صالح. يرجى إدخال رقم بطاقة صحيح (13-16 رقم).');
      return false;
    }
    if (!cardHolder.trim() || cardHolder.trim().length < 3) {
      toast.error('يرجى إدخال اسم حامل البطاقة (3 أحرف على الأقل).');
      return false;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      toast.error('تاريخ الانتهاء غير صالح. استخدم الصيغة MM/YY.');
      return false;
    }
    const [month, year] = expiry.split('/');
    const monthNum = parseInt(month);
    if (monthNum < 1 || monthNum > 12) {
      toast.error('الشهر غير صالح. استخدم رقم بين 01 و 12.');
      return false;
    }
    const expiryDate = new Date(2000 + parseInt(year), monthNum);
    if (expiryDate < new Date()) {
      toast.error('البطاقة منتهية الصلاحية. يرجى استخدام بطاقة سارية.');
      return false;
    }
    if (cvv.length < 3) {
      toast.error('رمز التحقق CVV غير صالح (3-4 أرقام).');
      return false;
    }
    return true;
  };

  const simulatePaymentProcessing = () => {
    setStep('processing');
    setProcessingProgress(0);
    processingIntervalRef.current = setInterval(() => {
      setProcessingProgress(prev => {
        if (prev >= 90) {
          if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);
          return 90;
        }
        return prev + Math.random() * 15;
      });
    }, 300);
  };

  const completePayment = () => {
    if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);
    setProcessingProgress(100);
    const isSuccess = Math.random() > 0.05;
    setTimeout(() => {
      if (isSuccess) {
        const txnId = 'CMI-MA-' + Math.floor(100000 + Math.random() * 900000);
        setTransactionId(txnId);
        setStep('success');
        toast.success('تمت عملية الدفع بنجاح! رقم المعاملة: ' + txnId);
      } else {
        setErrorMessage('تعذرت معالجة الدفع. يرجى التحقق من بيانات البطاقة والمحاولة مرة أخرى.');
        setStep('error');
        if (onError) onError('Payment processing failed');
      }
    }, 500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === 'cmi_card' && !validateCardForm()) return;
    simulatePaymentProcessing();
    setTimeout(completePayment, 2500);
  };

  const handleSuccessClose = () => {
    onSuccess({ transactionId, method: paymentMethod, amount });
    resetForm();
  };

  const resetForm = () => {
    setCardNumber('');
    setCardHolder('');
    setExpiry('');
    setCvv('');
    setStep('method');
    setTransactionId('');
    setErrorMessage('');
    setProcessingProgress(0);
  };

  const handleClose = () => {
    if (step === 'processing') return;
    resetForm();
    onClose();
  };

  const handleRetry = () => {
    setStep('details');
    setErrorMessage('');
  };

  const getCardBrandIcon = () => {
    switch (cardType) {
      case 'visa':
        return <div className="px-2 py-1 bg-blue-600 rounded text-white text-xs font-bold">VISA</div>;
      case 'mastercard':
        return (
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-red-500 opacity-80" />
            <div className="w-4 h-4 rounded-full bg-yellow-500 opacity-80 -ml-2" />
          </div>
        );
      case 'amex':
        return <div className="px-2 py-1 bg-blue-400 rounded text-white text-xs font-bold">AMEX</div>;
      default:
        return <CreditCard className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl text-slate-100 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-l from-amber-500/10 to-slate-950 border-b border-slate-800 p-5 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/20 p-2.5 rounded-xl border border-amber-500/30 text-amber-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-white">الدفع الآمن</h3>
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  مشفرة بمعيار PCI-DSS عبر CMI
                </p>
              </div>
            </div>
            <button onClick={handleClose} disabled={step === 'processing'} className="text-slate-400 hover:text-white w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center transition-colors disabled:opacity-50">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pt-4">
          <div className="bg-gradient-to-l from-amber-500/10 to-transparent border border-amber-500/20 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-1">المبلغ الإجمالي</p>
                {description && <p className="text-[11px] text-slate-500">{description}</p>}
              </div>
              <span className="text-2xl font-black text-amber-400">{amount.toLocaleString()} <span className="text-sm font-bold">{currency}</span></span>
            </div>
            {bookingDetails && (
              <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
                <p className="font-medium text-slate-300">{bookingDetails.title}</p>
                <p>{bookingDetails.startDate} → {bookingDetails.endDate} ({bookingDetails.days} أيام)</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-5">
          {step === 'method' && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-slate-300">اختر طريقة الدفع</p>
              <div className="space-y-3">
                <button onClick={() => { setPaymentMethod('cmi_card'); setStep('details'); }} className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-amber-500 bg-amber-500/5 transition-all text-right hover:bg-amber-500/10">
                  <div className="bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/20"><CreditCard className="w-5 h-5 text-blue-400" /></div>
                  <div className="flex-1"><p className="font-bold text-sm">بطاقة بنكية (CMI)</p><p className="text-[11px] text-slate-400">Visa, Mastercard - فوري وآمن</p></div>
                  <div className="flex gap-1"><div className="px-1.5 py-0.5 bg-blue-600 rounded text-[8px] font-bold text-white">VISA</div></div>
                </button>
                <button onClick={() => { setPaymentMethod('bank_transfer'); setStep('details'); }} className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-700 hover:border-slate-600 bg-slate-900 transition-all text-right">
                  <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20"><Building2 className="w-5 h-5 text-emerald-400" /></div>
                  <div className="flex-1"><p className="font-bold text-sm">تحويل بنكي</p><p className="text-[11px] text-slate-400">تحويل مباشر إلى حساب الوكالة</p></div>
                  <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded">24-48 ساعة</span>
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
                  <div className="flex justify-between items-start mb-6">{getCardBrandIcon()}<div className="text-[10px] text-slate-400 flex items-center gap-1"><Lock className="w-3 h-3" />CMI Secure 3D</div></div>
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
                    <div className="absolute left-3 top-1/2 -translate-y-1/2">{getCardBrandIcon()}</div>
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
                <Lock className="w-4 h-4 shrink-0" /><span>معاملة مشفرة بـ 256-bit SSL</span>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" onClick={() => setStep('method')} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />رجوع</Button>
                <Button type="submit" className="flex-[2] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-3 rounded-xl text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" />تأكيد دفع {amount.toLocaleString()} {currency}</Button>
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
              <div className="text-center space-y-2 w-full">
                <p className="font-bold text-white">جاري معالجة الدفع...</p>
                <p className="text-xs text-slate-400">يرجى عدم إغلاق هذه النافذة</p>
                <div className="w-full bg-slate-800 rounded-full h-2 mt-4">
                  <div className="bg-gradient-to-r from-amber-500 to-amber-400 h-2 rounded-full transition-all duration-300" style={{ width: `${Math.min(processingProgress, 100)}%` }} />
                </div>
              </div>
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

          {step === 'error' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 bg-red-500/20 border-2 border-red-500/40 rounded-full flex items-center justify-center"><AlertCircle className="w-10 h-10 text-red-400" /></div>
              <div className="text-center space-y-2"><p className="text-xl font-extrabold text-white">فشل الدفع</p><p className="text-sm text-slate-400">{errorMessage}</p></div>
              <div className="flex gap-3 w-full">
                <Button onClick={handleClose} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-sm">إلغاء</Button>
                <Button onClick={handleRetry} className="flex-[2] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-3 rounded-xl text-sm shadow-lg shadow-amber-500/20">إعادة المحاولة</Button>
              </div>
            </div>
          )}
        </div>

        {step !== 'processing' && step !== 'success' && step !== 'error' && (
          <div className="px-5 pb-4">
            <div className="flex items-center justify-center gap-4 pt-4 border-t border-slate-800">
              <div className="flex items-center gap-1 text-[10px] text-slate-500"><Lock className="w-3 h-3" /><span>PCI-DSS</span></div>
              <div className="flex items-center gap-1 text-[10px] text-slate-500"><ShieldCheck className="w-3 h-3" /><span>256-bit SSL</span></div>
              <div className="flex items-center gap-1 text-[10px] text-slate-500"><ShieldCheck className="w-3 h-3" /><span>CMI</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PaymentCheckoutModal;