import React, { useState } from 'react';
import { ChevronDown, HelpCircle, ShieldCheck, Car, Building2 } from 'lucide-react';

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      category: "التأجير والحجوزات",
      icon: Car,
      question: "كيف يمكنني حجز سيارة أو عقار عبر منصة B2-Rent؟",
      answer: "يمكنك بكل سهولة تصفح السيارات أو العقارات المتاحة، اختيار تواريخ الاستلام والتسليم، ثم الضغط على 'احجز الآن'. سيتم توجيهك لملء تفاصيل الحجز وإتمام الدفع الآمن لعربون الضمان عبر بواباتنا المعتمدة."
    },
    {
      category: "الأمان والضمان",
      icon: ShieldCheck,
      question: "هل المعاملات المالية وعربون الحجز آمنان؟",
      answer: "نعم تماماً. تعتمد منصة B2-Rent نظام ضمان مالي (Escrow) حيث تبقى أموال العربون في حساب الوسيط المعتمد حتى يتم تأكيد استلام السيارة أو العقار بحالة ممتازة من طرف الشريك."
    },
    {
      category: "الشركاء والوكالات",
      icon: Building2,
      question: "كيف يمكنني تسجيل شركتي أو عقاري كشريك في المنصة؟",
      answer: "يمكنك الانتقال إلى صفحة 'لوحة الوكلاء' واختيار التسجيل كشركة كراء سيارات أو منعش عقاري، رفع وثائق التحقق (السجل التجاري أو البطاقة الوطنية)، وبعد مراجعة الإدارة سيتم تفعيل حسابك فوراً."
    },
    {
      category: "سياسة الإلغاء",
      icon: HelpCircle,
      question: "ما هي سياسة إلغاء الحجوزات واسترداد العربون؟",
      answer: "يمكنك إلغاء الحجز مجاناً قبل موعد الاستلام بـ 48 ساعة واسترداد كامل العربون المدفوع. للإلغاء المتأخر، يتم تطبيق شروط الوكالة المتعاقد معها والموضحة في العقد الرقمي."
    }
  ];

  return (
    <section className="py-10 md:py-16 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D98236]/10 text-[#D98236] dark:text-[#D98236] text-sm font-medium mb-3">
            <HelpCircle className="w-4 h-4" />
            <span>الأسئلة المتكررة</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            كل ما ترغب في معرفته حول خدمات B2-Rent
          </h2>
          <p className="mt-3 text-sm sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            إجابات شاملة وواضحة عن عمليات الحجز والدفع وحقوق الشركاء والزبناء في المغرب.
          </p>
        </div>

        <div className="space-y-3 md:space-y-4">
          {faqs.map((faq, idx) => {
            const Icon = faq.icon;
            const isOpen = openIndex === idx;
            return (
              <div 
                key={idx}
                className="bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full px-4 md:px-6 py-4 md:py-5 text-right flex items-center justify-between gap-2 md:gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D98236] focus-visible:ring-inset"
                >
                  <div className="flex min-w-0 items-center gap-3 md:gap-4">
                    <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-[#D98236]/10 dark:bg-[#D98236]/20 flex items-center justify-center text-[#D98236] dark:text-[#D98236] shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-[#D98236] dark:text-[#D98236] block mb-1">
                        {faq.category}
                      </span>
                      <h3 className="text-sm sm:text-lg font-bold leading-snug text-slate-900 dark:text-white">
                        {faq.question}
                      </h3>
                    </div>
                  </div>
                  <div className={`w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 bg-[#D98236] text-white dark:bg-[#D98236] dark:text-white' : ''}`} aria-hidden="true">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 md:px-6 pb-4 md:pb-6 pt-3 text-sm md:text-base text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-700/50">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
