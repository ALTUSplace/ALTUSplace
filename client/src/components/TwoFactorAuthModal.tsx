import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Lock, Smartphone, CheckCircle2, Key, Copy, Download, Check } from 'lucide-react';
import { toast } from 'sonner';

interface TwoFactorAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function TwoFactorAuthModal({ isOpen, onClose, onSuccess }: TwoFactorAuthModalProps) {
  const [step, setStep] = useState<'verify' | 'recovery' | 'success'>('verify');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recoveryCodes] = useState([
    'ALT-8841-992X',
    'ALT-3312-771K',
    'ALT-5590-442M',
    'ALT-1123-883P',
    'ALT-9945-221S',
  ]);

  if (!isOpen) return null;

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) {
      toast.error('الرجاء إدخال رمز التحقق المكون من 6 أرقام بشكل صحيح.');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep('recovery');
      toast.success('تم التحقق بنجاح! يرجى حفظ رموز الاسترداد الاحتياطية.');
    }, 1200);
  };

  const handleCopyCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopied(true);
    toast.success('تم نسخ رموز الاسترداد الاحتياطية إلى الحافظة بنجاح!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadCodes = () => {
    const element = document.createElement('a');
    const file = new Blob([`ALTUSplace 2FA Recovery Codes:\n\n` + recoveryCodes.join('\n')], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'ALTUSplace-recovery-codes.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success('تم تحميل ملف رموز الاسترداد بنجاح!');
  };

  const handleFinish = () => {
    setStep('success');
    toast.success('تم تفعيل المصادقة الثنائية (2FA) ورموز الاسترداد بنجاح تام!');
    setTimeout(() => {
      onSuccess();
      onClose();
      setStep('verify');
      setCode('');
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-8 max-w-md w-full space-y-6 shadow-2xl text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="bg-amber-500/20 p-2 rounded-xl border border-amber-500/30 text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">المصادقة الثنائية الأمنية (2FA)</h3>
              <p className="text-[10px] text-slate-400">حماية متقدمة ورموز استرداد للطوارئ</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
        </div>

        {step === 'success' ? (
          <div className="py-10 text-center space-y-3">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30 animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-white">تم تأمين الحساب وحفظ الرموز!</h4>
            <p className="text-xs text-slate-400">أصبح حسابك الإداري محمياً بأعلى معايير الأمان.</p>
          </div>
        ) : step === 'recovery' ? (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex items-start gap-3">
              <Key className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1 text-slate-300">
                <p className="font-bold text-white">احتفظ برمز الاسترداد (Recovery Codes):</p>
                <p className="text-[11px] text-slate-400">يمكنك استخدام هذه الرموز لمرة واحدة في حال فقدان الوصول لهاتفك.</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="grid grid-cols-1 gap-2 font-mono text-center text-xs text-amber-400">
                {recoveryCodes.map((rc, idx) => (
                  <div key={idx} className="bg-slate-950 py-2 px-3 rounded-xl border border-slate-800 tracking-wider flex items-center justify-between">
                    <span className="text-slate-500 text-[10px]">#{idx + 1}</span>
                    <span className="text-amber-400 font-bold">{rc}</span>
                    <span className="w-4" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                onClick={handleCopyCodes}
                className={`flex-1 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all ${
                  copied
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-slate-950" />
                    <span>تم النسخ بنجاح! ✓</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-amber-400" />
                    <span>نسخ الرموز</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                onClick={handleDownloadCodes}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>تحميل كملف</span>
              </Button>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <Button
                type="button"
                onClick={handleFinish}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold py-3 rounded-xl text-xs shadow-lg shadow-amber-500/20"
              >
                لقد قمت بحفظ الرموز - متابعة
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex items-start gap-3">
              <Smartphone className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1 text-slate-300">
                <p className="font-bold text-white">تم إرسال رمز التحقق إلى هاتفك المرتبط:</p>
                <p className="font-mono text-amber-400">+212 6 •• •• 88 41 (Google Authenticator / SMS)</p>
              </div>
            </div>

            <div className="space-y-1.5 text-right">
              <label className="text-xs font-bold text-slate-300">أدخل رمز التحقق (6 أرقام)</label>
              <input
                type="text"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-center text-lg tracking-widest font-mono text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>هذه الخطوة إلزامية لضمان أمان العمليات المالية وتعديل الأسطول.</span>
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
                    <span>جاري التحقق...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>الخطوة التالية: رموز الاسترداد</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
