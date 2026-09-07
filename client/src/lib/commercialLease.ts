import { jsPDF } from "jspdf";

export type CommercialLeaseInput = {
  reference: string;
  landlordName: string;
  landlordRc?: string | null;
  tenantName: string;
  premises: string;
  city: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  deposit: number;
  purpose: "commercial" | "professional";
  language?: "ar" | "fr";
};

const money = (value: number) => `${new Intl.NumberFormat("fr-MA").format(value)} MAD`;

export function buildCommercialLeaseText(input: CommercialLeaseInput): string[] {
  const isArabic = input.language === "ar";
  const purpose = input.purpose === "commercial" ? (isArabic ? "تجاري" : "commercial") : (isArabic ? "مهني" : "professionnel");
  const legalNotice = isArabic
    ? "تنبيه قانوني: هذا نموذج تقني عام، ويجب استكماله ومراجعته واعتماده من طرف محامٍ أو موثق مغربي قبل التوقيع أو الاستعمال الفعلي."
    : "Avertissement légal : ce modèle technique doit être complété, vérifié et validé par un avocat ou un notaire au Maroc avant toute signature ou utilisation réelle.";
  return isArabic ? [
    "عقد كراء محل تجاري أو مهني",
    `مرجع العقد: ${input.reference}`,
    legalNotice,
    "تنبيه نطاق المسؤولية: يقر الطرفان بأن B2-Rent منصة إعلانية ووسيط تقني فقط، ولا تملك أو تدير السيارة أو العقار موضوع الحجز. يتحمل الشريك مسؤولية الحالة الميكانيكية للسيارة وسلامتها، أو حالة العقار ونظافته ومطابقته للوصف، كما يتحمل المكتري مسؤولية معاينة الأصل وإبلاغ الشريك بأي ملاحظة عند التسليم، وذلك في حدود ما يسمح به القانون المغربي ودون المساس بالحقوق القانونية الآمرة.",
    "1. تعريف الأطراف",
    `المكري: ${input.landlordName || "يستكمل"}`,
    `السجل التجاري (RC): ${input.landlordRc || "يستكمل من طرف المكري"}`,
    `المكتري: ${input.tenantName || "يستكمل"}`,
    "2. تعيين المحل والغرض من الكراء",
    `المحل موضوع العقد: ${input.premises || "يستكمل"}، ${input.city || "المغرب"}. ويخصص للاستعمال ${purpose} دون أي نشاط غير مرخص أو مخالف للقوانين الجاري بها العمل.`,
    "3. المدة",
    `يسري العقد من ${input.startDate} إلى ${input.endDate}، مع مراعاة المقتضيات القانونية وشروط التجديد المتفق عليها كتابةً.`,
    "4. الوجيبة الكرائية والضمان",
    `حدد مبلغ الكراء الشهري في ${money(input.monthlyRent)}، وحدد الضمان في ${money(input.deposit)}. وتفصل المصاريف والرسوم وشروط المراجعة في الشروط الخاصة الموقعة.`,
    "5. التزامات المكري",
    "يلتزم المكري بتسليم المحل بالحالة المتفق عليها، وضمان الانتفاع الهادئ به، وإنجاز الإصلاحات التي تقع على عاتقه قانوناً أو تعاقداً.",
    "6. التزامات المكتري",
    "يلتزم المكتري بأداء الوجيبة والمصاريف في آجالها، واستعمال المحل للغرض المحدد، واحترام شروط السلامة، وإرجاعه وفق الشروط المتفق عليها مع مراعاة الاستهلاك العادي.",
    "7. الإنهاء وتسوية النزاعات",
    "يجب أن يحترم كل إنهاء أو إعذار أو إجراء المساطر والآجال والشروط المنصوص عليها في القانون المغربي المطبق وفي الشروط الخاصة. وتسعى الأطراف إلى الحل الودي قبل اللجوء إلى القضاء.",
    "8. التوقيعات",
    "حرر العقد في نسختين أصليتين بعد القراءة والقبول والمراجعة القانونية.",
    "المكري: ____________________       المكتري: ____________________",
  ] : [
    "CONTRAT DE BAIL COMMERCIAL / PROFESSIONNEL",
    `Référence du contrat : ${input.reference}`,
    legalNotice,
    "Clause de responsabilité : Les parties reconnaissent que B2-Rent est uniquement une plateforme publicitaire et un intermédiaire technologique et qu'elle ne possède ni n'exploite le véhicule ou le bien réservé. Le Partenaire demeure responsable de l'état mécanique et de la sécurité du véhicule, ou de l'état, de la propreté et de la conformité du bien à son annonce. Le Preneur doit examiner le bien et signaler toute réserve au Partenaire lors de la remise, dans les limites permises par le droit marocain et sans préjudice des droits impératifs.",
    "1. IDENTIFICATION DES PARTIES",
    `Le Bailleur : ${input.landlordName || "À compléter"}.`,
    `Registre de commerce (RC) du Bailleur : ${input.landlordRc || "À compléter par le Bailleur"}.`,
    `Le Preneur : ${input.tenantName || "À compléter"}.`,
    "2. DÉSIGNATION ET DESTINATION DES LOCAUX",
    `Les locaux sont situés à ${input.premises || "À compléter"}, ${input.city || "Maroc"}. Ils sont destinés à un usage ${purpose}, à l'exclusion de toute activité non autorisée ou contraire à la réglementation applicable.`,
    "3. DURÉE",
    `Le bail prend effet le ${input.startDate} et arrive à échéance le ${input.endDate}, sous réserve des règles légales et des conditions de reconduction convenues par écrit.`,
    "4. LOYER, CHARGES ET GARANTIE",
    `Le loyer est fixé à ${money(input.monthlyRent)} par mois et le dépôt de garantie à ${money(input.deposit)}. Les charges, taxes et modalités de révision sont précisées dans les conditions particulières signées.`,
    "5. OBLIGATIONS DU BAILLEUR",
    "Le Bailleur délivre les locaux dans l'état convenu, assure la jouissance paisible des lieux et effectue les réparations qui lui incombent légalement ou contractuellement.",
    "6. OBLIGATIONS DU PRENEUR",
    "Le Preneur paie le loyer et les charges à échéance, utilise les locaux conformément à leur destination, respecte les règles de sécurité et restitue les lieux selon les conditions convenues, hors usure normale.",
    "7. RÉSILIATION ET RÈGLEMENT DES LITIGES",
    "Toute résiliation, mise en demeure ou procédure respecte les formes, délais et conditions du droit marocain applicable et des conditions particulières. Les parties privilégient une résolution amiable avant toute démarche judiciaire.",
    "8. SIGNATURES",
    "Fait en deux exemplaires originaux après lecture, acceptation et validation juridique.",
    "Le Bailleur : ____________________       Le Preneur : ____________________",
  ];
}

export function generateCommercialLeasePdf(input: CommercialLeaseInput): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const isArabic = input.language === "ar";
  const pageWidth = 210;
  const margin = 18;
  let y = 18;
  const lines = buildCommercialLeaseText(input);

  doc.setFillColor(11, 60, 93);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ALTUSPLACE", margin, 13);
  doc.setFontSize(10);
  doc.text(isArabic ? "عقد كراء تجاري / مهني" : "CONTRAT DE BAIL COMMERCIAL / PROFESSIONNEL", margin, 21);
  doc.setTextColor(0, 0, 0);
  y = 40;

  lines.forEach((text, index) => {
    const isHeading = index === 0 || /^\d+\./.test(text);
    doc.setFont("helvetica", isHeading ? "bold" : "normal");
    doc.setFontSize(isHeading ? 11 : 9.5);
    if (isHeading) doc.setTextColor(11, 60, 93);
    const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2);
    doc.text(wrapped, isArabic ? pageWidth - margin : margin, y, { align: isArabic ? "right" : "left" });
    doc.setTextColor(0, 0, 0);
    y += wrapped.length * 4.5 + (isHeading ? 5 : 3);
    if (y > 270) { doc.addPage(); y = 20; }
  });

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(isArabic ? "B2-Rent — نموذج تقني للمراجعة القانونية قبل الاستعمال." : "B2-Rent — Modèle technique à faire valider par un professionnel du droit.", margin, 287);
  return doc.output("blob");
}
