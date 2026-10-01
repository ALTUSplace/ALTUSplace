/**
 * Single source of truth for the home-page FAQ.
 *
 * The visible accordion (FAQSection) and the FAQPage JSON-LD both read from
 * `FAQ_KEYS`, so the structured data can never describe a different set of
 * questions than the ones a visitor can actually read. Search guidelines
 * require exactly that: FAQ structured data has to match on-page content.
 */

export type FaqEntry = {
  /** Small category label rendered above the question. */
  categoryKey: string;
  questionKey: string;
  answerKey: string;
};

export const FAQ_KEYS: readonly FaqEntry[] = [
  { categoryKey: "faqCategoryBooking", questionKey: "faqQuestion1", answerKey: "faqAnswer1" },
  { categoryKey: "faqCategorySecurity", questionKey: "faqQuestion2", answerKey: "faqAnswer2" },
  { categoryKey: "faqCategoryPartners", questionKey: "faqQuestion3", answerKey: "faqAnswer3" },
  { categoryKey: "faqCategoryCancellation", questionKey: "faqQuestion4", answerKey: "faqAnswer4" },
];

export type FaqPageJsonLd = {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  mainEntity: Array<{
    "@type": "Question";
    name: string;
    acceptedAnswer: { "@type": "Answer"; text: string };
  }>;
};

/**
 * Builds the FAQPage node for the active language. `t` is the i18n lookup, so
 * the emitted question/answer text is whatever is currently rendered.
 */
export function buildFaqJsonLd(t: (key: string) => string): FaqPageJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_KEYS.map(({ questionKey, answerKey }) => ({
      "@type": "Question",
      name: t(questionKey),
      acceptedAnswer: { "@type": "Answer", text: t(answerKey) },
    })),
  };
}
