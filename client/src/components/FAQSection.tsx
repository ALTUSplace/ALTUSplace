import React, { useState } from 'react';
import { ChevronDown, HelpCircle, ShieldCheck, Car, Building2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export function FAQSection() {
  const { t, direction } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      categoryKey: "faqCategoryBooking",
      icon: Car,
      questionKey: "faqQuestion1",
      answerKey: "faqAnswer1"
    },
    {
      categoryKey: "faqCategorySecurity",
      icon: ShieldCheck,
      questionKey: "faqQuestion2",
      answerKey: "faqAnswer2"
    },
    {
      categoryKey: "faqCategoryPartners",
      icon: Building2,
      questionKey: "faqQuestion3",
      answerKey: "faqAnswer3"
    },
    {
      categoryKey: "faqCategoryCancellation",
      icon: HelpCircle,
      questionKey: "faqQuestion4",
      answerKey: "faqAnswer4"
    }
  ];

  return (
    <section dir={direction} className="py-10 md:py-16 bg-bg-surface border-t border-border-subtle">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-flex items-center gap-2 corner-cut-sm bg-accent-clay-soft text-accent-clay text-sm font-bold px-4 py-1.5 mb-4">
            <HelpCircle className="w-4 h-4" />
            <span>{t('faqBadge')}</span>
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink-primary sm:text-4xl">
            {t('faqTitle')}
          </h2>
          <p className="mt-3 text-sm sm:text-lg text-ink-secondary max-w-2xl mx-auto leading-relaxed">
            {t('faqSubtitle')}
          </p>
        </div>

        <div className="space-y-3 md:space-y-4">
          {faqs.map((faq, idx) => {
            const Icon = faq.icon;
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="bg-bg-elevated rounded-lg shadow-xs border border-border-subtle overflow-hidden transition-all duration-200 hover:border-border-default"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full px-4 md:px-6 py-4 md:py-5 text-start flex items-center justify-between gap-2 md:gap-4 outline-none focus-visible:ring-2 focus-visible:ring-accent-clay focus-visible:ring-inset"
                >
                  <div className="flex min-w-0 items-center gap-3 md:gap-4">
                    <div className="w-9 h-9 md:w-10 md:h-10 corner-cut-sm bg-accent-clay-soft flex items-center justify-center text-accent-clay shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-accent-clay block mb-1">
                        {t(faq.categoryKey)}
                      </span>
                      <h3 className="text-sm sm:text-lg font-bold leading-snug text-ink-primary">
                        {t(faq.questionKey)}
                      </h3>
                    </div>
                  </div>
                  <div className={`w-8 h-8 corner-cut-sm bg-bg-muted flex items-center justify-center text-ink-secondary transition-all duration-200 shrink-0 ${isOpen ? 'rotate-180 bg-accent-clay text-white' : ''}`} aria-hidden="true">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 md:px-6 pb-4 md:pb-6 pt-3 text-sm md:text-base text-ink-secondary leading-relaxed border-t border-border-subtle">
                    {t(faq.answerKey)}
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