import { useState } from 'react';
import { HelpCircle, ChevronDown, Mail, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SUPPORT_EMAIL } from '@/config/brand';

export default function Help() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const faqs = [
    {
      q: 'ما هي الشروط المطلوبة لتأجير سيارة أو عقار في المغرب عبر المنصة؟',
      a: 'يجب أن يتوفر المستأجر على رخصة قيادة أو بطاقة وطنية سارية المفعول، وأن يكون بلغ سن 21 سنة على الأقل. بالنسبة للعقارات، يكفي إدلاء بطاقة الهوية أو جواز السفر.',
    },
    {
      q: 'كيف يتم تأكيد الحجز وإصدار العقد الرقمي؟',
      a: 'بعد اختيار الخدمة وتحديد التواريخ، يتم إصدار الحجز فوراً مع عقد إيجار رقمي بصيغة PDF يتضمن التوقيع الإلكتروني والختم الرسمي للوكالة.',
    },
    {
      q: 'هل الوكالات والشركات المنضمة للمنصة موثوقة؟',
      a: 'نعم، جميع وكالات كراء السيارات والشركات العقارية تخضع لعمليات تدقيق صارمة وتحمل شارة الاعتماد الرسمي والتقييمات الحقيقية للزبائن.',
    },
    {
      q: 'كيف يمكنني التواصل مع فريق الدعم الفني مباشرة؟',
      a: `يمكنك إرسال استفسارك عبر البريد الإلكتروني الرسمي ${SUPPORT_EMAIL} أو استخدام نموذج الدعم أدناه وسيتم الرد عليك في أسرع وقت.`,
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4" dir="rtl">
      <div className="container mx-auto max-w-4xl space-y-12">
        
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-400 mx-auto">
            <HelpCircle className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-white">مركز المساعدة والدعم الفني</h1>
          <p className="text-slate-400 text-sm">نحن هنا للإجابة عن كافة استفساراتك وتوفير تجربة وساطة سلسة وموثوقة</p>
        </div>

        {/* الأسئلة الشائعة */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white mb-4">الأسئلة الأكثر شيوعاً</h2>
          {faqs.map((faq, idx) => (
            <div key={idx} className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <button
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                className="w-full flex items-center justify-between p-6 text-right font-bold text-white hover:text-amber-400 transition-colors"
              >
                <span>{faq.q}</span>
                <ChevronDown className={`w-5 h-5 transition-transform ${openIndex === idx ? 'rotate-180 text-amber-400' : 'text-slate-500'}`} />
              </button>
              {openIndex === idx && (
                <div className="px-6 pb-6 text-slate-300 text-sm leading-relaxed border-t border-slate-900 pt-4">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* نموذج التواصل المباشر للدعم الفني */}
        <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl shadow-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-900 pb-4">
            <div className="w-10 h-10 bg-amber-500/20 border border-amber-500/40 rounded-xl flex items-center justify-center text-amber-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">إرسال استفسار للدعم الفني</h3>
              <p className="text-xs text-slate-400">{`سيتم إرسال رسالتك مباشرة إلى البريد المعتمد: ${SUPPORT_EMAIL}`}</p>
            </div>
          </div>

          {submitted ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-8 rounded-2xl text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h4 className="text-lg font-bold text-white">تم إرسال رسالتك بنجاح!</h4>
              <p className="text-xs text-slate-300">شكراً لتواصلك معنا. سنقوم بالرد على بريدك الإلكتروني في أقرب وقت ممكن.</p>
              <Button
                onClick={() => { setSubmitted(false); setFormData({ name: '', email: '', subject: '', message: '' }); }}
                className="bg-amber-500 text-slate-950 font-bold text-xs mt-2"
              >
                إرسال استفسار آخر
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-right">
                  <label className="text-xs font-bold text-slate-300">الاسم الكامل</label>
                  <input
                    type="text"
                    required
                    placeholder="أدخل اسمك..."
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="space-y-1.5 text-right">
                  <label className="text-xs font-bold text-slate-300">البريد الإلكتروني</label>
                  <input
                    type="email"
                    required
                    placeholder="example@domain.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5 text-right">
                <label className="text-xs font-bold text-slate-300">موضوع الاستفسار</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: استفسار حول حجز سيارة أو عقد إيجار..."
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5 text-right">
                <label className="text-xs font-bold text-slate-300">نص الرسالة أو الاستفسار</label>
                <textarea
                  required
                  rows={4}
                  placeholder="اكتب تفاصيل استفسارك هنا..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-extrabold px-8 py-3.5 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  <Send className="w-4 h-4" />
                  <span>إرسال الاستفسار للدعم الفني</span>
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* البريد الإلكتروني الرسمي للدعم */}
        <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl flex items-center justify-center gap-4">
          <div className="w-12 h-12 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center justify-center text-amber-400 flex-shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 text-center">البريد الإلكتروني الرسمي المعتمد للدعم الفني</div>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-lg font-bold text-white hover:text-amber-400">{SUPPORT_EMAIL}</a>
          </div>
        </div>

      </div>
    </div>
  );
}
