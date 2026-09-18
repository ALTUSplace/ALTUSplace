/**
 * PaymentCheckoutModal.tsx - Premium secure payment checkout for ALTUSplace
 * Provides a professional, multi-step checkout experience that supports the
 * Moroccan gateway suite:
 *   - Card gateways (PayZone / PayTabs / CMI / Stripe): hosted or simulated
 *   - Cash Plus / Wafacash: 24h offline cash voucher with copyable reference
 *   - Pay on Arrival: pending booking, settle at pickup
 * When `onCreatePayment` is provided the modal delegates the charge to the
 * server (payments.create) and renders the returned outcome; otherwise it
 * falls back to the legacy in-browser simulation.
 */
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldCheck, CreditCard, Lock, CheckCircle2, Loader2, Building2, Smartphone, ChevronLeft, X, AlertCircle, BadgeCheck, Fingerprint, Landmark, Banknote, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GATEWAYS, isCardGateway, isCashVoucherGateway, type PaymentOutcome, type GatewayCode } from '@/lib/payments';

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
  onCreatePayment?: (method: PaymentMethod) => Promise<PaymentOutcome>;
  amount: number;
  currency?: string;
  description?: string;
  bookingDetails?: {
    title: string;
    startDate: string;
    endDate: string;
    days: number;
  };
  initialMethod?: PaymentMethod;
  supportedMethods?: PaymentMethod[];
}

export type PaymentMethod = GatewayCode | 'mobile_wallet';
type CheckoutStep = 'method' | 'details' | 'processing' | 'success' | 'error' | 'voucher' | 'redirect' | 'pending';

const CASH_AGENCY_STEPS: Record<'cashplus' | 'wafacash', { agency: string; steps: string[] }> = {
  cashplus: {
    agency: 'Cash Plus',
    steps: [
      'توجه إلى أقرب وكالة Cash Plus قربك.',
      'قدّم رقم المرجع النقدي الموضح أدناه.',
      'ادفع المبلغ المطلوب نقداً (بالدرهم المغربي MAD).',
      'سيصلك تأكيد تلقائي بمجرد تسجيل الوكالة للدفع.',
    ],
  },
  wafacash: {
    agency: 'Wafacash',
    steps: [
      'توجه إلى أقرب وكالة Wafacash قربك.',
      'قدّم رقم المرجع النقدي الموضح أدناه.',
      'ادفع المبلغ المطلوب نقداً (بالدرهم المغربي MAD).',
      'سيصلك تأكيد تلقائي بمجرد تسجيل الوكالة للدفع.',
    ],
  },
};

const PROVIDER_NAMES: Record<string, string> = {
  payzone: 'PayZone',
  paytabs: 'PayTabs',
  cashplus: 'Cash Plus',
  wafacash: 'Wafacash',
};

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
  visa: { label: 'VISA', color: 'text-accent-clay', bg: 'bg-accent-clay-soft', border: 'border-accent-clay/30' },
  mastercard: { label: 'MC', color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/30' },
  amex: { label: 'AMEX', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' },
  unknown: { label: '', color: '', bg: '', border: '' },
};

export function PaymentCheckoutModal({
  isOpen,
  onClose,
  onSuccess,
  onError,
  onCreatePayment,
  amount,
  currency = 'درهم',
  description,
  bookingDetails,
  initialMethod = 'cmi_card',
  supportedMethods = ['cmi_card', 'bank_transfer', 'stripe_card', 'paypal'],
}: PaymentCheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialMethod);
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [step, setStep] = useState<CheckoutStep>('method');
  const [transactionId, setTransactionId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(null);
  const cvvInputRef = useRef<HTMLInputElement>(null);
  const processingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPaymentMethod(supportedMethods.includes(initialMethod) ? initialMethod : 'cmi_card');
      setCardNumber('');
      setCardHolder('');
      setExpiry('');
      setCvv('');
      setStep('method');
      setTransactionId('');
      setErrorMessage('');
      setProcessingProgress(0);
      setSelectedWallet(null);
      setOutcome(null);
    }
    return () => {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const cardType = detectCardType(cardNumber);
  const isCardFormMethod = isCardGateway(paymentMethod as GatewayCode) || paymentMethod === 'cmi_card' || paymentMethod === 'stripe_card';

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
    if (luhnCheck(cleanedNumber) === false && !cardNumber.replace(/\D/g, '').startsWith('4000')) {
      toast.error('رقم البطاقة غير صالح. يرجى إدخال رقم بطاقة صحيح (13-16 رقم).');
      return false;
    }
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

  const handleOutcome = (paymentOutcome: PaymentOutcome) => {
    setOutcome(paymentOutcome);
    if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);
    setProcessingProgress(100);
    switch (paymentOutcome.kind) {
      case 'redirect':
        setTransactionId(paymentOutcome.transactionId);
        setStep('redirect');
        break;
      case 'voucher':
        setTransactionId(paymentOutcome.reference);
        setStep('voucher');
        break;
      case 'settled':
        setTransactionId(paymentOutcome.transactionId);
        setStep('success');
        toast.success('تمت عملية الدفع بنجاح! رقم المعاملة: ' + paymentOutcome.transactionId);
        break;
      case 'pending':
        setTransactionId(paymentOutcome.transactionId || 'PENDING');
        setStep('pending');
        break;
    }
  };

  const completePayment = () => {
    if (processingIntervalRef.current) clearInterval(processingIntervalRef.current);
    setProcessingProgress(100);
    const isSuccess = Math.random() > 0.05;
    setTimeout(() => {
      if (isSuccess) {
        const txnPrefixes: Record<PaymentMethod, string> = {
          cmi_card: 'CMI-MA',
          stripe_card: 'STRIPE',
          paypal: 'PAYPAL',
          bank_transfer: 'BANK',
          mobile_wallet: 'WALLET',
          payzone: 'PAYZONE',
          paytabs: 'PAYTABS',
          cashplus: 'CASHPLUS',
          wafacash: 'WAFACASH',
          arrival: 'ARRIVAL',
        };
        const txnId = txnPrefixes[paymentMethod] + '-' + Math.floor(100000 + Math.random() * 900000);
        setTransactionId(txnId);
        setStep('success');
        toast.success('تمت عملية الدفع بنجاح! رقم المعاملة: ' + txnId);
      } else {
        setErrorMessage('تعذرت معالجة الدفع. يرجى التحقق من بيانات الدفع والمحاولة مرة أخرى.');
        setStep('error');
        if (onError) onError('Payment processing failed');
      }
    }, 500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCardFormMethod && !validateCardForm()) return;

    if (onCreatePayment) {
      setStep('processing');
      setProcessingProgress(15);
      toast.loading('جاري إنشاء الحجز وتأكيد الدفع...', { id: 'gateway-checkout' });
      onCreatePayment(paymentMethod)
        .then(handleOutcome)
        .catch((err: Error) => {
          setErrorMessage(typeof err?.message === 'string' ? err.message : 'تعذرت معالجة الدفع. يرجى المحاولة مرة أخرى.');
          setStep('error');
          if (onError) onError('Payment processing failed');
        })
        .finally(() => toast.dismiss('gateway-checkout'));
      return;
    }

    simulatePaymentProcessing();
    setTimeout(completePayment, 2500);
  };

  const handleSuccessClose = () => {
    onSuccess({ transactionId, method: paymentMethod, amount });
    resetForm();
    onClose();
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
    setOutcome(null);
  };

  const handleClose = () => {
    if (step === 'processing' || step === 'redirect') return;
    if (step === 'success') {
      onSuccess({ transactionId, method: paymentMethod, amount });
      resetForm();
      onClose();
      return;
    }
    resetForm();
    onClose();
  };

  const handleRetry = () => {
    setStep('details');
    setErrorMessage('');
  };

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(transactionId);
      toast.success('تم نسخ رقم المرجع النقدي.');
    } catch {
      toast.error('تعذر النسخ. يمكنك تدوين الرقم يدوياً.');
    }
  };

  const proceedToGateway = () => {
    if (outcome?.kind === 'redirect') {
      window.location.assign(outcome.url);
    }
  };

  const getCardBrandIcon = () => {
    switch (cardType) {
      case 'visa':
        return <div className="px-2 py-1 bg-accent-clay rounded text-white text-xs font-bold">VISA</div>;
      case 'mastercard':
        return (
          <div className="flex items-center">
            <div className="w-4 h-4 rounded-full bg-red-500 opacity-80" />
            <div className="w-4 h-4 rounded-full bg-yellow-500 opacity-80 -ml-2" />
          </div>
        );
      case 'amex':
        return <div className="px-2 py-1 bg-accent-clay rounded text-white text-xs font-bold">AMEX</div>;
      default:
        return <CreditCard className="w-5 h-5 text-slate-400 dark:text-[#B0B0B8]" />;
    }
  };

  const methodButtons: { key: PaymentMethod; icon: React.ReactNode; title: string; subtitle: string; badge?: string; accent: string }[] = [];

  if (supportedMethods.includes('payzone')) methodButtons.push({
    key: 'payzone', icon: <CreditCard className="w-5 h-5 text-amber-400" />, title: GATEWAYS.payzone.labelAr, subtitle: 'Visa / Mastercard / CMI — فوري وآمن', badge: 'فوري', accent: 'border-amber-500 bg-amber-500/5 hover:bg-amber-500/10',
  });
  if (supportedMethods.includes('cmi_card')) methodButtons.push({
    key: 'cmi_card', icon: <CreditCard className="w-5 h-5 text-accent-clay" />, title: GATEWAYS.cmi_card.labelAr, subtitle: 'Visa, Mastercard — فوري وآمن', badge: 'فوري', accent: 'border-accent-clay/60 bg-accent-clay/5 hover:bg-accent-clay/10',
  });
  if (supportedMethods.includes('paytabs')) methodButtons.push({
    key: 'paytabs', icon: <CreditCard className="w-5 h-5 text-emerald-400" />, title: GATEWAYS.paytabs.labelAr, subtitle: 'بطاقات محلية بالدرهم المغربي', badge: 'MAD', accent: 'border-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10',
  });
  if (supportedMethods.includes('stripe_card')) methodButtons.push({
    key: 'stripe_card', icon: <CreditCard className="w-5 h-5 text-indigo-400" />, title: GATEWAYS.stripe_card.labelAr, subtitle: 'Visa, Mastercard, Amex - مدفوعات عبر الحدود', badge: 'عالمي', accent: 'border-indigo-500 bg-indigo-500/5 hover:bg-indigo-500/10',
  });
  if (supportedMethods.includes('paypal')) methodButtons.push({
    key: 'paypal', icon: <Fingerprint className="w-5 h-5 text-blue-400" />, title: GATEWAYS.paypal.labelAr, subtitle: 'آمن وسريع عبر حساب PayPal', badge: 'عالمي', accent: 'border-blue-500 bg-blue-500/5 hover:bg-blue-500/10',
  });
  if (supportedMethods.includes('cashplus')) methodButtons.push({
    key: 'cashplus', icon: <Landmark className="w-5 h-5 text-lime-400" />, title: GATEWAYS.cashplus.labelAr, subtitle: 'ادفع نقداً لدى الوكالة خلال 24 ساعة', badge: 'نقدي', accent: 'border-lime-500 bg-lime-500/5 hover:bg-lime-500/10',
  });
  if (supportedMethods.includes('wafacash')) methodButtons.push({
    key: 'wafacash', icon: <Landmark className="w-5 h-5 text-teal-400" />, title: GATEWAYS.wafacash.labelAr, subtitle: 'ادفع نقداً لدى الوكالة خلال 24 ساعة', badge: 'نقدي', accent: 'border-teal-500 bg-teal-500/5 hover:bg-teal-500/10',
  });
  if (supportedMethods.includes('bank_transfer')) methodButtons.push({
    key: 'bank_transfer', icon: <Building2 className="w-5 h-5 text-emerald-400" />, title: GATEWAYS.bank_transfer.labelAr, subtitle: 'تحويل مباشر إلى حساب الوكالة', badge: '24-48 ساعة', accent: 'border-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10',
  });
  if (supportedMethods.includes('arrival')) methodButtons.push({
    key: 'arrival', icon: <Banknote className="w-5 h-5 text-sky-400" />, title: GATEWAYS.arrival.labelAr, subtitle: 'ادفع عند استلام الخدمة', badge: 'استلام', accent: 'border-sky-500 bg-sky-500/5 hover:bg-sky-500/10',
  });
  if (supportedMethods.includes('mobile_wallet')) methodButtons.push({
    key: 'mobile_wallet', icon: <Smartphone className="w-5 h-5 text-purple-400" />, title: 'محفظة إلكترونية', subtitle: 'Himti, Jumia Pay, Barid Cash', accent: 'border-purple-500 bg-purple-500/5 hover:bg-purple-500/10',
  });

  const currentAgency = (isCashVoucherGateway(paymentMethod as GatewayCode) ? CASH_AGENCY_STEPS[paymentMethod as 'cashplus' | 'wafacash'] : null) ?? null;
  const providerName = PROVIDER_NAMES[paymentMethod] ?? GATEWAYS[(paymentMethod as GatewayCode)]?.labelAr ?? 'الدفع';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-950 dark:bg-[#111113] border border-slate-800 dark:border-[#2C2C2E] rounded-3xl max-w-lg w-full shadow-2xl text-slate-100 dark:text-[#F1F1F3] overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-l from-amber-500/10 to-slate-950 dark:to-[#111113] border-b border-slate-800 dark:border-[#2C2C2E] p-5 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/20 p-2.5 rounded-xl border border-amber-500/30 text-amber-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-white">الدفع الآمن</h3>
                <p className="text-[11px] text-slate-400 dark:text-[#B0B0B8] flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  مشفرة بمعيار PCI-DSS عبر بوابة دفع مغربية
                </p>
              </div>
            </div>
            <button onClick={handleClose} disabled={step === 'processing' || step === 'redirect'} className="text-slate-400 dark:text-[#B0B0B8] hover:text-white w-8 h-8 rounded-full bg-slate-800 dark:bg-[#2C2C2E] flex items-center justify-center transition-colors disabled:opacity-50">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 pt-4">
          <div className="bg-gradient-to-l from-amber-500/10 to-transparent border border-amber-500/20 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 dark:text-[#B0B0B8] mb-1">المبلغ الإجمالي</p>
                {description && <p className="text-[11px] text-slate-500">{description}</p>}
              </div>
              <span className="text-2xl font-black text-amber-400">{amount.toLocaleString()} <span className="text-sm font-bold">{currency}</span></span>
            </div>
            {bookingDetails && (
              <div className="mt-3 pt-3 border-t border-slate-800 dark:border-[#2C2C2E] text-xs text-slate-400 dark:text-[#B0B0B8]">
                <p className="font-medium text-slate-300 dark:text-[#D6D6DB]">{bookingDetails.title}</p>
                <p>{bookingDetails.startDate} → {bookingDetails.endDate} ({bookingDetails.days} أيام)</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-5">
          {step === 'method' && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-slate-300 dark:text-[#D6D6DB]">اختر طريقة الدفع</p>
              <div className="space-y-3">
                {methodButtons.map((m) => (
                  <button key={m.key} onClick={() => { setPaymentMethod(m.key); setStep('details'); }} className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-right transition-all ${m.accent}`}>
                    <div className={cn('p-2.5 rounded-xl border', m.badge === 'عالمي' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-slate-900/60 dark:bg-[#1C1C1E]/60 border-slate-800 dark:border-[#2C2C2E]')}>{m.icon}</div>
                    <div className="flex-1">
                      <p className="font-bold text-sm">{m.title}</p>
                      <p className="text-[11px] text-slate-400 dark:text-[#B0B0B8]">{m.subtitle}</p>
                    </div>
                    {m.badge && <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded shrink-0">{m.badge}</span>}
                  </button>
                ))}
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-300 leading-relaxed">
                المعاملات تتم عبر بوابة دفع مغربية محاكية لأغراض العرض. لا تدخل رقم بطاقة أو رمز CVV حقيقياً. لا نخزن بيانات البطاقة على خوادمنا. لا تتصل بمؤسسة CMI.
              </div>
            </div>
          )}

          {step === 'details' && isCardFormMethod && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="bg-gradient-to-bl from-slate-800 dark:from-[#2C2C2E] via-slate-900 dark:via-[#1C1C1E] to-slate-800 dark:to-[#2C2C2E] rounded-2xl p-5 border border-slate-700 dark:border-[#48484D] relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-bl from-amber-500/5 to-transparent" />
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">{getCardBrandIcon()}<div className="text-[10px] text-slate-400 dark:text-[#B0B0B8] flex items-center gap-1"><Lock className="w-3 h-3" />{paymentMethod === 'stripe_card' ? 'Stripe Secure' : paymentMethod === 'payzone' || paymentMethod === 'paytabs' ? `${providerName} Secure 3D` : 'CMI Secure 3D'}</div></div>
                  <p className="font-mono text-lg tracking-[0.2em] text-white mb-4">{cardNumber || '•••• •••• •••• ••••'}</p>
                  <div className="flex justify-between items-end">
                    <div><p className="text-[9px] text-slate-500 mb-0.5">حامل البطاقة</p><p className="text-xs font-bold text-slate-300 dark:text-[#D6D6DB] uppercase">{cardHolder || 'YOUR NAME'}</p></div>
                    <div><p className="text-[9px] text-slate-500 mb-0.5">ينتهي</p><p className="text-xs font-bold text-slate-300 dark:text-[#D6D6DB]">{expiry || 'MM/YY'}</p></div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 dark:text-[#D6D6DB]">رقم البطاقة</label>
                  <div className="relative">
                    <input type="text" inputMode="numeric" autoComplete="cc-number" placeholder="4532 •••• •••• 8821" value={cardNumber} onChange={handleCardNumberChange} className="w-full bg-slate-900 dark:bg-[#1C1C1E] border border-slate-700 dark:border-[#48484D] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 font-mono tracking-widest transition-colors" required />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2">{getCardBrandIcon()}</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 dark:text-[#D6D6DB]">اسم حامل البطاقة</label>
                  <input type="text" autoComplete="cc-name" placeholder="مثال: YOUSSEF ALAOUI" value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} className="w-full bg-slate-900 dark:bg-[#1C1C1E] border border-slate-700 dark:border-[#48484D] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 uppercase transition-colors" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 dark:text-[#D6D6DB]">تاريخ الانتهاء</label>
                    <input type="text" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" maxLength={5} value={expiry} onChange={handleExpiryChange} className="w-full bg-slate-900 dark:bg-[#1C1C1E] border border-slate-700 dark:border-[#48484D] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 text-center font-mono transition-colors" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 dark:text-[#D6D6DB]">CVV</label>
                    <input ref={cvvInputRef} type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} placeholder="•••" value={cvv} onChange={handleCvvChange} className="w-full bg-slate-900 dark:bg-[#1C1C1E] border border-slate-700 dark:border-[#48484D] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 text-center font-mono transition-colors" required />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <Lock className="w-4 h-4 shrink-0" /><span>معاملة مشفرة بـ 256-bit SSL ولا نخزن بيانات البطاقة</span>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" onClick={() => setStep('method')} className="flex-1 bg-slate-800 dark:bg-[#2C2C2E] hover:bg-slate-700 dark:hover:bg-[#48484D] text-slate-300 dark:text-[#D6D6DB] font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />رجوع</Button>
                <Button type="submit" className="flex-[2] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-3 rounded-xl text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" />تأكيد دفع {amount.toLocaleString()} {currency}</Button>
              </div>
            </form>
          )}

          {step === 'details' && (paymentMethod === 'cashplus' || paymentMethod === 'wafacash') && currentAgency && (
            <div className="space-y-5">
              <div className="bg-lime-500/5 border border-lime-500/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3"><Landmark className="w-5 h-5 text-lime-400" /><p className="font-bold text-sm text-lime-300">الأداء نقداً عبر {currentAgency.agency}</p></div>
                <ol className="space-y-3 text-sm">
                  {currentAgency.steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-6 h-6 rounded-full bg-lime-500/15 border border-lime-500/30 text-lime-300 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-slate-300 dark:text-[#D6D6DB] leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex justify-between py-2 border-t border-slate-800 dark:border-[#2C2C2E] text-sm">
                  <span className="text-slate-400 dark:text-[#B0B0B8]">المبلغ:</span>
                  <span className="font-bold text-amber-400">{amount.toLocaleString()} {currency}</span>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-300">سنتولّد لك رقم مرجع نقدياً صالحاً لمدة 24 ساعة بعد تأكيد الحجز.</div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" onClick={() => setStep('method')} className="flex-1 bg-slate-800 dark:bg-[#2C2C2E] hover:bg-slate-700 dark:hover:bg-[#48484D] text-slate-300 dark:text-[#D6D6DB] font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />رجوع</Button>
                <Button onClick={handleSubmit} className="flex-[2] bg-gradient-to-r from-lime-500 to-lime-600 hover:from-lime-600 hover:to-lime-700 text-slate-950 font-bold py-3 rounded-xl text-sm shadow-lg shadow-lime-500/20 flex items-center justify-center gap-2"><BadgeCheck className="w-4 h-4" />توليد المرجع النقدي</Button>
              </div>
            </div>
          )}

          {step === 'details' && paymentMethod === 'arrival' && (
            <div className="space-y-5">
              <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3"><Banknote className="w-5 h-5 text-sky-400" /><p className="font-bold text-sm text-sky-300">الدفع عند الاستلام (Pay on Arrival)</p></div>
                <p className="text-sm text-slate-400 dark:text-[#B0B0B8] leading-relaxed">سيتم تأكيد حجزك فوراً ويدفع المبلغ نقداً عند استلام الخدمة. لا يُطلب أي تحويل مسبق.</p>
                <div className="flex justify-between py-2 border-t border-slate-800 dark:border-[#2C2C2E] text-sm">
                  <span className="text-slate-400 dark:text-[#B0B0B8]">المبلغ المستحق:</span>
                  <span className="font-bold text-amber-400">{amount.toLocaleString()} {currency}</span>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" onClick={() => setStep('method')} className="flex-1 bg-slate-800 dark:bg-[#2C2C2E] hover:bg-slate-700 dark:hover:bg-[#48484D] text-slate-300 dark:text-[#D6D6DB] font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />رجوع</Button>
                <Button onClick={handleSubmit} className="flex-[2] bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />تأكيد الحجز</Button>
              </div>
            </div>
          )}

          {step === 'details' && paymentMethod === 'bank_transfer' && (
            <div className="space-y-5">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3"><Building2 className="w-5 h-5 text-emerald-400" /><p className="font-bold text-sm text-emerald-300">معلومات التحويل البنكي</p></div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-slate-800 dark:border-[#2C2C2E]"><span className="text-slate-400 dark:text-[#B0B0B8]">اسم البنك:</span><span className="font-bold text-white">BMCE Bank</span></div>
                  <div className="flex justify-between py-2 border-b border-slate-800 dark:border-[#2C2C2E]"><span className="text-slate-400 dark:text-[#B0B0B8]">IBAN:</span><span className="font-mono text-white text-xs">MA 0023 4456 7890 1234 5678 9012</span></div>
                  <div className="flex justify-between py-2"><span className="text-slate-400 dark:text-[#B0B0B8]">المبلغ:</span><span className="font-bold text-amber-400">{amount.toLocaleString()} {currency}</span></div>
                </div>
              </div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-[11px] text-amber-300">يرجى إرسال إيصال التحويل عبر واتساب أو البريد الإلكتروني لتأكيد الحجز.</div>
              <div className="flex gap-3 pt-2">
                <Button type="button" onClick={() => setStep('method')} className="flex-1 bg-slate-800 dark:bg-[#2C2C2E] hover:bg-slate-700 dark:hover:bg-[#48484D] text-slate-300 dark:text-[#D6D6DB] font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />رجوع</Button>
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
                    <button key={wallet} onClick={() => setSelectedWallet(wallet)} className={`p-4 rounded-xl border transition-all text-center ${selectedWallet === wallet ? 'border-purple-500 bg-purple-500/10' : 'border-slate-700 dark:border-[#48484D] bg-slate-900 dark:bg-[#1C1C1E] hover:border-purple-500/50'}`}>
                      <Smartphone className="w-5 h-5 text-purple-400 mx-auto mb-2" /><p className="text-[11px] font-bold text-slate-300 dark:text-[#D6D6DB]">{wallet}</p>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-[#B0B0B8] text-center">سيتم تحويلك إلى تطبيق المحفظة لإتمام الدفع</p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" onClick={() => setStep('method')} className="flex-1 bg-slate-800 dark:bg-[#2C2C2E] hover:bg-slate-700 dark:hover:bg-[#48484D] text-slate-300 dark:text-[#D6D6DB] font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />رجوع</Button>
                <Button onClick={handleSubmit} disabled={!selectedWallet} className="flex-[2] bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"><Smartphone className="w-4 h-4" />متابعة الدفع</Button>
              </div>
            </div>
          )}

          {step === 'details' && paymentMethod === 'paypal' && (
            <div className="space-y-5">
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3"><Fingerprint className="w-5 h-5 text-blue-400" /><p className="font-bold text-sm text-blue-300">الدفع عبر PayPal</p></div>
                <p className="text-sm text-slate-400 dark:text-[#B0B0B8] leading-relaxed">سيتم تحويلك إلى بوابة PayPal الآمنة لإتمام الدفع بحسابك. سيتم احتساب المبلغ بالعملة المختارة مع التحويل التلقائي.</p>
                <div className="flex justify-between py-2 border-t border-slate-800 dark:border-[#2C2C2E] text-sm"><span className="text-slate-400 dark:text-[#B0B0B8]">المبلغ:</span><span className="font-bold text-amber-400">{amount.toLocaleString()} {currency}</span></div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                <Lock className="w-4 h-4 shrink-0" /><span>معاملة مشفرة ومحمية بسياسة حماية المشتري من PayPal</span>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" onClick={() => setStep('method')} className="flex-1 bg-slate-800 dark:bg-[#2C2C2E] hover:bg-slate-700 dark:hover:bg-[#48484D] text-slate-300 dark:text-[#D6D6DB] font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4" />رجوع</Button>
                <Button onClick={handleSubmit} className="flex-[2] bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-3 rounded-xl text-sm shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"><Fingerprint className="w-4 h-4" />متابعة إلى PayPal</Button>
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
                <p className="font-bold text-white">{onCreatePayment ? 'جاري إنشاء الحجز وتأكيد الدفع...' : 'جاري معالجة الدفع...'}</p>
                <p className="text-xs text-slate-400 dark:text-[#B0B0B8]">يرجى عدم إغلاق هذه النافذة</p>
                <div className="w-full bg-slate-800 dark:bg-[#2C2C2E] rounded-full h-2 mt-4">
                  <div className="bg-gradient-to-r from-amber-500 to-amber-400 h-2 rounded-full transition-all duration-300" style={{ width: `${Math.min(processingProgress, 100)}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-emerald-400"><Lock className="w-3.5 h-3.5" /><span>اتصال مشفر وآمن</span></div>
            </div>
          )}

          {step === 'redirect' && outcome?.kind === 'redirect' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 bg-amber-500/20 border-2 border-amber-500/40 rounded-full flex items-center justify-center"><ExternalLink className="w-10 h-10 text-amber-400" /></div>
              <div className="text-center space-y-2">
                <p className="text-xl font-extrabold text-white">سيتم تحويلك إلى بوابة {PROVIDER_NAMES[outcome.provider] ?? outcome.provider} الآمنة</p>
                <p className="text-sm text-slate-400 dark:text-[#B0B0B8]">أكمل الدفع داخل صفحة آمنة تستضيفها جهة الدفع. رقم المرجع: <span className="text-amber-400 font-mono font-bold">{outcome.externalReference}</span></p>
              </div>
              <Button onClick={proceedToGateway} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"><ExternalLink className="w-4 h-4" />متابعة إلى بوابة الدفع</Button>
            </div>
          )}

          {step === 'voucher' && outcome?.kind === 'voucher' && (
            <div className="space-y-5">
              <div className="py-2 text-center">
                <p className="text-xl font-extrabold text-white">تم إنشاء المرجع النقدي</p>
                <p className="text-xs text-slate-400 dark:text-[#B0B0B8] mt-1">ادفعه نقداً لدى {PROVIDER_NAMES[outcome.provider] ?? outcome.provider} خلال 24 ساعة لتأكيد حجزك.</p>
              </div>
              <div className="bg-slate-900 dark:bg-[#1C1C1E] border border-amber-500/30 rounded-2xl p-5 text-center">
                <p className="text-[11px] text-slate-400 dark:text-[#B0B0B8] mb-2">رقم المرجع النقدي</p>
                <p className="font-mono text-2xl font-black tracking-widest text-amber-400 select-all">{outcome.reference}</p>
                {outcome.expiresAt && (
                  <p className="text-[11px] text-red-400 mt-2">صالحة حتى {new Date(outcome.expiresAt).toLocaleString('ar-MA')}</p>
                )}
                <Button onClick={copyReference} className="mt-4 w-full bg-slate-800 dark:bg-[#2C2C2E] hover:bg-slate-700 dark:hover:bg-[#48484D] text-slate-200 dark:text-[#E8E8EB] font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 border border-slate-700 dark:border-[#48484D]"><Copy className="w-4 h-4" />نسخ الرقم</Button>
              </div>
              <div className="bg-lime-500/5 border border-lime-500/20 rounded-2xl p-4 space-y-2">
                <p className="font-bold text-sm text-lime-300">خطوات الدفع لدى {PROVIDER_NAMES[outcome.provider] ?? outcome.provider}:</p>
                <ol className="space-y-2">
                  {(CASH_AGENCY_STEPS[outcome.provider === 'cashplus' || outcome.provider === 'wafacash' ? outcome.provider : 'cashplus'].steps).map((s, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-300 dark:text-[#D6D6DB]">
                      <span className="text-lime-400 font-bold shrink-0">{i + 1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <Button onClick={handleSuccessClose} className="w-full bg-gradient-to-r from-lime-500 to-lime-600 hover:from-lime-600 hover:to-lime-700 text-slate-950 font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-lime-500/20 flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />متابعة إلى تفاصيل الحجز</Button>
            </div>
          )}

          {step === 'pending' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 bg-amber-500/20 border-2 border-amber-500/40 rounded-full flex items-center justify-center"><BadgeCheck className="w-10 h-10 text-amber-400" /></div>
              <div className="text-center space-y-2">
                <p className="text-xl font-extrabold text-white">تم إنشاء الحجز وطلب الدفع</p>
                <p className="text-sm text-slate-400 dark:text-[#B0B0B8]">سيتم تأكيد الحجز تلقائياً فور تأكيد الدفع. يمكنك متابعة الحالة من صفحة حجوزاتي.</p>
              </div>
              <Button onClick={handleSuccessClose} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />متابعة إلى حجوزاتي</Button>
            </div>
          )}

          {step === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 bg-emerald-500/20 border-2 border-emerald-500/40 rounded-full flex items-center justify-center"><CheckCircle2 className="w-10 h-10 text-emerald-400" /></div>
              <div className="text-center space-y-2"><p className="text-xl font-extrabold text-white">تمت عملية الدفع بنجاح!</p><p className="text-sm text-slate-400 dark:text-[#B0B0B8]">رقم المعاملة: <span className="text-amber-400 font-mono font-bold">{transactionId}</span></p></div>
              <div className="bg-slate-900 dark:bg-[#1C1C1E] border border-slate-700 dark:border-[#48484D] rounded-xl p-4 w-full"><div className="flex justify-between text-sm"><span className="text-slate-400 dark:text-[#B0B0B8]">المبلغ المدفوع:</span><span className="font-bold text-emerald-400">{amount.toLocaleString()} {currency}</span></div></div>
              <Button onClick={handleSuccessClose} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />متابعة إلى تفاصيل الحجز</Button>
            </div>
          )}

          {step === 'error' && (
            <div className="py-8 flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 bg-red-500/20 border-2 border-red-500/40 rounded-full flex items-center justify-center"><AlertCircle className="w-10 h-10 text-red-400" /></div>
              <div className="text-center space-y-2"><p className="text-xl font-extrabold text-white">فشل الدفع</p><p className="text-sm text-slate-400 dark:text-[#B0B0B8]">{errorMessage}</p></div>
              <div className="flex gap-3 w-full">
                <Button onClick={handleClose} className="flex-1 bg-slate-800 dark:bg-[#2C2C2E] hover:bg-slate-700 dark:hover:bg-[#48484D] text-slate-300 dark:text-[#D6D6DB] font-bold py-3 rounded-xl text-sm">إلغاء</Button>
                <Button onClick={handleRetry} className="flex-[2] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-3 rounded-xl text-sm shadow-lg shadow-amber-500/20">إعادة المحاولة</Button>
              </div>
            </div>
          )}
        </div>

        {step !== 'processing' && step !== 'success' && step !== 'error' && step !== 'redirect' && (
          <div className="px-5 pb-4">
            <div className="flex items-center justify-center gap-4 pt-4 border-t border-slate-800 dark:border-[#2C2C2E]">
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