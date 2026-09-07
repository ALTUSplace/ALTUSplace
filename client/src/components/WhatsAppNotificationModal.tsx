import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, PhoneCall, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface WhatsAppNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingDetails?: {
    id: string;
    carName: string;
    customerName: string;
    customerPhone: string;
    totalPrice: number;
    agencyPhone?: string;
  };
}

export function WhatsAppNotificationModal({ isOpen, onClose, bookingDetails }: WhatsAppNotificationModalProps) {
  const [recipient, setRecipient] = useState<'customer' | 'agency'>('agency');
  const [message, setMessage] = useState(
    bookingDetails
      ? `مرحباً، تم تأكيد حجزك رقم ${bookingDetails.id} لـ ${bookingDetails.carName} بمبلغ ${bookingDetails.totalPrice} درهم عبر منصة B2-Rent. شكراً لثقتكم بكراؤنا وممتلكاتنا.`
      : 'مرحباً، لدي استفسار بخصوص الحجز والتوثيق الرقمي.'
  );
  const [sent, setSent] = useState(false);

  if (!isOpen) return null;

  const handleSend = () => {
    setSent(true);
    toast.success('تم إرسال إشعار الواتساب والرسالة القصيرة SMS بنجاح!');
    setTimeout(() => {
      setSent(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-8 max-w-md w-full space-y-6 shadow-2xl text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30 text-emerald-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">إرسال إشعار WhatsApp / SMS</h3>
              <p className="text-[10px] text-slate-400">تواصل فوري وآلي مع الزبون أو الوكالة</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
        </div>

        {sent ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30 animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-white">تم الإرسال بنجاح عبر الواتساب!</h4>
            <p className="text-xs text-slate-400">تم توصيل الإشعار وتحديث سجل الحجز.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5 text-right">
              <label className="text-xs font-bold text-slate-300">إرسال إلى:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRecipient('agency')}
                  className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition-all ${
                    recipient === 'agency'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  وكالة التأجير / العقارات
                </button>
                <button
                  type="button"
                  onClick={() => setRecipient('customer')}
                  className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition-all ${
                    recipient === 'customer'
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  المستأجر / العميل
                </button>
              </div>
            </div>

            <div className="space-y-1.5 text-right">
              <label className="text-xs font-bold text-slate-300">نص الرسالة التلقائية</label>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 leading-relaxed resize-none"
              />
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
                type="button"
                onClick={handleSend}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-lg shadow-emerald-600/20 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>إرسال عبر WhatsApp / SMS</span>
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
