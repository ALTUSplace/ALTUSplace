import { LEGAL_CONSENT_EVENT } from "@/config/brand";

export const LEGAL_CONSENT_VERSION = "platform-protection-v1";

export const legalDisclosure = {
  ar: {
    title: "بنود حماية منصة ALTUSplace",
    summary: "أوافق على قراءة وقبول بنود حماية المنصة قبل إنشاء الحساب أو إتمام أي عملية.",
    sections: [
      {
        title: "طبيعة الخدمة",
        body: "منصة ALTUSplace هي وسيط تقني وإعلاني يربط بين مقدمي الخدمات، مثل شركات كراء السيارات وأصحاب العقارات، وبين المستأجرين. لا تملك المنصة السيارات أو العقارات ولا تديرها، ولا تحل محل الشريك في المعاينة أو التسليم.",
      },
      {
        title: "المسؤولية القانونية",
        body: "يتحمل الشريك مسؤولية دقة الإعلان والحالة الميكانيكية للسيارة والسلامة والنظافة ومطابقة العقار للصور والوصف. لا تتحمل ALTUSplace، في حدود ما يسمح به القانون المغربي ودون المساس بالحقوق الآمرة، مسؤولية العيوب أو الحوادث أو السرقة أو الأضرار التي تقع أثناء الكراء. وتخضع العلاقة النهائية للعقد المكتوب والموقع بين الشريك والزبون عند الاستلام.",
      },
      {
        title: "المبالغ المدفوعة",
        body: "يمثل مبلغ تأكيد الحجز رسوم الخدمة التقنية والربط البرمجي للمنصة، وتظهر شروط الإلغاء وعدم الاسترداد قبل الدفع. لا يُطبّق عدم الاسترداد إذا خالف ذلك حقاً قانونياً آمراً أو سياسة استرداد معلنة واجبة التطبيق.",
      },
      {
        title: "النزاعات والتعويضات",
        body: "إذا تخلف الشريك عن تقديم الخدمة المتفق عليها رغم أداء الزبون للعمولة، تراجع المنصة الحالة عبر مركز النزاعات، وقد تعيد مبلغ العمولة وفق سياسة الاسترداد المعمول بها، مع إمكانية تعليق أو حظر حساب الشريك المخالف.",
      },
    ],
  },
  fr: {
    title: "Clauses de protection de la plateforme ALTUSplace",
    summary: "J'accepte de lire et d'accepter les clauses de protection de la plateforme avant de créer un compte ou d'effectuer une opération.",
    sections: [
      {
        title: "Nature du service",
        body: "ALTUSplace est une plateforme publicitaire et un intermédiaire technologique reliant les prestataires, notamment les agences de location de voitures et les propriétaires immobiliers, aux locataires. La plateforme ne possède ni n'exploite les véhicules ou les biens et ne remplace pas le Partenaire lors de l'inspection ou de la remise.",
      },
      {
        title: "Responsabilité juridique",
        body: "Le Partenaire est responsable de l'exactitude de l'annonce, de l'état mécanique et de la sécurité du véhicule, ainsi que de la propreté et de la conformité du bien aux photos et à la description. Dans les limites permises par le droit marocain et sans préjudice des droits impératifs, ALTUSplace n'est pas responsable des défauts, accidents, vols ou dommages survenus pendant la location. La relation finale est régie par le contrat écrit signé entre le Partenaire et le Client lors de la remise.",
      },
      {
        title: "Sommes payées",
        body: "Le montant de confirmation de réservation constitue les frais du service technique et de mise en relation de la plateforme. Les conditions d'annulation et de non-remboursement sont affichées avant le paiement. La non-restitution ne s'applique pas lorsqu'elle contredit un droit impératif ou une politique de remboursement obligatoire.",
      },
      {
        title: "Litiges et remboursements",
        body: "Si le Partenaire ne fournit pas le service convenu malgré le paiement de la commission par le Client, la plateforme examine le dossier via le centre des litiges et peut rembourser la commission selon la politique applicable, avec suspension ou bannissement possible du Partenaire fautif.",
      },
    ],
  },
  en: {
    title: "ALTUSplace platform protection terms",
    summary: "I agree to read and accept the platform protection terms before creating an account or completing any transaction.",
    sections: [
      {
        title: "Nature of the service",
        body: "ALTUSplace is an advertising and technology intermediary connecting service providers, including car-rental agencies and property owners, with tenants. The platform does not own or operate the vehicles or properties and does not replace the Partner during inspection or handover.",
      },
      {
        title: "Legal responsibility",
        body: "The Partner is responsible for listing accuracy, the vehicle's mechanical condition and safety, and the property's cleanliness and conformity with its photos and description. To the extent permitted by Moroccan law and without limiting mandatory rights, ALTUSplace is not responsible for defects, accidents, theft, or damage occurring during the rental. The final relationship is governed by the written contract signed by the Partner and Client at handover.",
      },
      {
        title: "Payments",
        body: "The booking confirmation amount represents the platform's technical service and connection fee. Cancellation and non-refund terms are displayed before payment. Non-refundability does not apply where it conflicts with a mandatory legal right or binding refund policy.",
      },
      {
        title: "Disputes and refunds",
        body: "If the Partner fails to provide the agreed service despite the Client paying the commission, the platform reviews the case through the dispute center and may refund the service fee according to the applicable policy, with possible suspension or banning of the breaching Partner.",
      },
    ],
  },
} as const;

export const cancellationRefundPolicy = {
  ar: {
    title: "سياسة الإلغاء والاسترداد",
    summary: "يظهر مبلغ تأكيد الحجز باعتباره رسوماً للخدمة التقنية والربط. قبل الدفع، يجب على الزبون مراجعة شروط الإلغاء الخاصة بالحجز.",
    points: [
      "يُعد مبلغ تأكيد الحجز المدفوع عبر المنصة رسوماً للخدمة التقنية والربط، وقد يكون غير مسترد عند إلغاء الزبون أو عدم الحضور، ما لم تنص سياسة الحجز أو قاعدة قانونية آمرة على خلاف ذلك.",
      "إذا تعذر على الشريك تقديم الخدمة المتفق عليها رغم أداء الزبون للمبلغ، يمكن للزبون فتح نزاع، وتراجع المنصة الحالة وقد تعيد رسوم الخدمة وفق السياسة المعلنة وشروط العقد.",
      "تخضع أي مبالغ إضافية أو ضمانات أو مصاريف إلغاء لشروط العقد المكتوب بين الشريك والزبون، ولا تُعد هذه الصفحة بديلاً عن العقد أو عن الحقوق القانونية الآمرة.",
    ],
  },
  fr: {
    title: "Politique d'annulation et de remboursement",
    summary: "Les frais de confirmation correspondent au service technique et à la mise en relation. Les conditions applicables sont affichées avant le paiement.",
    points: [
      "Les frais de confirmation payés sur la plateforme rémunèrent le service technique et la mise en relation. Ils peuvent être non remboursables en cas d'annulation ou de non-présentation du Client, sauf disposition contraire de la réservation ou d'une règle impérative.",
      "Si le Partenaire ne peut pas fournir le service convenu malgré le paiement du Client, celui-ci peut ouvrir un litige. La plateforme examine le dossier et peut rembourser les frais de service selon la politique publiée et le contrat.",
      "Les autres montants, dépôts de garantie et frais d'annulation sont régis par le contrat écrit entre le Partenaire et le Client. Cette page ne remplace ni le contrat ni les droits impératifs applicables.",
    ],
  },
  en: {
    title: "Cancellation and refund policy",
    summary: "The confirmation fee covers the technical service and connection. Applicable conditions are displayed before payment.",
    points: [
      "The confirmation fee paid on the platform remunerates the technical service and connection. It may be non-refundable if the Client cancels or does not attend, unless the booking terms or a mandatory legal rule provide otherwise.",
      "If the Partner cannot provide the agreed service despite the Client's payment, the Client may open a dispute. The platform reviews the case and may refund the service fee according to the published policy and contract.",
      "Other amounts, security deposits, and cancellation charges are governed by the written contract between the Partner and Client. This page does not replace the contract or applicable mandatory rights.",
    ],
  },
} as const;

export type LegalLanguage = keyof typeof legalDisclosure;

export function hasLegalConsent() {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((cookie) => cookie.trim().startsWith(`b2_legal_consent=${LEGAL_CONSENT_VERSION}`));
}

export function persistLegalConsent() {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `b2_legal_consent=${LEGAL_CONSENT_VERSION}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(LEGAL_CONSENT_EVENT));
}

export function clearLegalConsent() {
  if (typeof document === "undefined") return;
  document.cookie = "b2_legal_consent=; Path=/; Max-Age=0; SameSite=Lax";
}

export function getLegalDisclosurePlainText(language: LegalLanguage = "ar") {
  const content = legalDisclosure[language];
  return [content.title, ...content.sections.map((section) => `${section.title}: ${section.body}`)].join("\n\n");
}

export function getCancellationRefundPlainText(language: LegalLanguage = "ar") {
  const content = cancellationRefundPolicy[language];
  return [content.title, content.summary, ...content.points].join("\n\n");
}

export function getLegalDisclosureHtml(language: LegalLanguage = "ar") {
  return getLegalDisclosurePlainText(language)
    .split("\n\n")
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("");
}
