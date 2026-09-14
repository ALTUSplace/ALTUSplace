import fs from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import { shapeArabic } from "./arabicShaper";

export type CarRentalContractInput = {
  reference: string;
  language: "ar" | "fr";
  agencyName: string;
  agencyCommercialRegister: string | null;
  agencyAddress: string | null;
  agencyPhone: string | null;
  renterName: string;
  renterEmail: string | null;
  renterPhone: string | null;
  renterIdType: string | null; // cni | passport | national_id
  renterIdNumber: string | null; // masked document number
  residency: string | null; // resident | foreigner
  vehicle: string;
  vehicleCategory: string;
  fuelType: string | null;
  transmission: string | null;
  city: string | null;
  startDate: string; // ISO
  endDate: string; // ISO
  durationDays: number;
  pricePerDay: number;
  addOnsTotal: number;
  subtotal: number;
  commissionFee: number;
  netProfit: number;
  totalPrice: number;
  deposit: number;
  cancelPolicyText: string;
  legalNotice: string;
  issuedAt: string; // ISO
};

const money = (value: number) => `${value.toLocaleString("fr-MA")} MAD`;

function loadArabicFont(doc: jsPDF) {
  const fontPath = path.resolve(process.cwd(), "server/assets/DejaVuSans.ttf");
  if (!fs.existsSync(fontPath)) return false;
  const font = fs.readFileSync(fontPath).toString("base64");
  doc.addFileToVFS("DejaVuSans.ttf", font);
  doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
  doc.addFont("DejaVuSans.ttf", "DejaVuSans", "bold");
  return true;
}

type Line = { text: string; kind: "heading" | "label" | "value" | "note" | "blank" };

export function generateCarRentalContractPdf(input: CarRentalContractInput): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const hasUnicodeFont = loadArabicFont(doc);
  const isArabic = input.language === "ar";
  const pageWidth = 210;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  const dateLabel = (iso: string) =>
    isArabic
      ? new Date(iso).toLocaleDateString("ar-MA", { year: "numeric", month: "long", day: "numeric" })
      : new Date(iso).toLocaleDateString("fr-MA", { year: "numeric", month: "long", day: "numeric" });

  const t = (ar: string, fr: string) => (isArabic ? ar : fr);

  const renterIdLabel = (type: string | null) => {
    const map: Record<string, string> = {
      cni: t("رقم البطاقة الوطنية", "CIN"),
      passport: t("رقم جواز السفر", "Passeport"),
      national_id: t("رقم البطاقة الوطنية", "CIN"),
      driving_license: t("رقم رخصة السياقة", "Permis"),
    };
    return map[type ?? ""] ?? t("رقم الوثيقة", "Document");
  };

  const heading = (title: string): Line => ({ text: title, kind: "heading" });
  const label = (title: string): Line => ({ text: title, kind: "label" });
  const value = (title: string): Line => ({ text: title, kind: "value" });
  const note = (title: string): Line => ({ text: title, kind: "note" });

  const lines: Line[] = [
    heading(t("1. الأطراف", "1. PARTIES")),
    label(t("الوكالة المؤجرة (الطرف الأول)", "L'Agence de location (Première partie)")),
    value(input.agencyName),
    ...(input.agencyCommercialRegister ? [value(t(`المركز التجاري / ICE: ${input.agencyCommercialRegister}`, `RC / ICE: ${input.agencyCommercialRegister}`))] : []),
    ...(input.agencyAddress ? [value(t(`العنوان: ${input.agencyAddress}`, `Adresse: ${input.agencyAddress}`))] : []),
    ...(input.agencyPhone ? [value(t(`الهاتف: ${input.agencyPhone}`, `Téléphone: ${input.agencyPhone}`))] : []),
    label(t("المستأجر (الطرف الثاني)", "Le locataire (Deuxième partie)")),
    value(input.renterName),
    ...(input.renterEmail ? [value(t(`البريد الإلكتروني: ${input.renterEmail}`, `E-mail: ${input.renterEmail}`))] : []),
    ...(input.renterPhone ? [value(t(`الهاتف: ${input.renterPhone}`, `Téléphone: ${input.renterPhone}`))] : []),
    ...(input.renterIdNumber ? [value(`${renterIdLabel(input.renterIdType)}: ${input.renterIdNumber}`)] : []),
    ...(input.residency ? [value(t(`الإقامة: ${input.residency === "resident" ? "مقيم بالمغرب" : "أجنبي"}`, `Résidence: ${input.residency === "resident" ? "Résident (Maroc)" : "Non résident"}`))] : []),
    heading(t("2. المركبة موضوع الكراء", "2. VÉHICULE LOUÉ")),
    value(input.vehicle),
    value(t(`الفئة: ${input.vehicleCategory === "car" ? "سيارة ركوب" : input.vehicleCategory}`,
      `Catégorie: ${input.vehicleCategory === "car" ? "Voiture de tourisme" : input.vehicleCategory}`)),
    ...(input.fuelType ? [value(t(`الوقود: ${input.fuelType}`, `Carburant: ${input.fuelType}`))] : []),
    ...(input.transmission ? [value(t(`ناقل الحركة: ${input.transmission}`, `Boîte de vitesses: ${input.transmission}`))] : []),
    ...(input.city ? [value(t(`مدينة التسليم: ${input.city}`, `Ville de remise: ${input.city}`))] : []),
    heading(t("3. مدة الكراء", "3. DURÉE DE LA LOCATION")),
    value(t(`تبدأ في ${dateLabel(input.startDate)} وتنتهي في ${dateLabel(input.endDate)} (${input.durationDays} يوم).`,
      `Du ${dateLabel(input.startDate)} au ${dateLabel(input.endDate)} (${input.durationDays} jour(s)).`)),
    heading(t("4. الكراء والملحقات", "4. LOYER ET OPTIONS")),
    value(t(`السعر اليومي: ${money(input.pricePerDay)}`, `Tarif journalier: ${money(input.pricePerDay)}`)),
    value(t(`أيام الكراء: ${input.durationDays}`, `Jours de location: ${input.durationDays}`)),
    value(t(`الملحقات: ${money(input.addOnsTotal)}`, `Options: ${money(input.addOnsTotal)}`)),
    value(t(`الإجمالي قبل العمولة: ${money(input.subtotal + input.addOnsTotal)}`, `Sous-total: ${money(input.subtotal + input.addOnsTotal)}`)),
    value(t(`الضمان (وديعة): ${money(input.deposit)}`, `Caution: ${money(input.deposit)}`)),
    value(t(`التأمين والعربون المشمولان ضمن السعر اليومي`, `Assurance et frais inclus dans le tarif journalier`)),
    heading(t("5. التزامات الطرفين", "5. OBLIGATIONS DES PARTIES")),
    note(t("- على المستأجر إرجاع المركبة في نفس حالتها، مع كامل الوثائق، خلال فترة الكراء المحددة.",
      "- Le locataire s'engage à restituer le véhicule dans le même état, avec les documents remis.")),
    note(t("- تتم تسوية أية خسائر أو أضرار وفق مسطرة معاينة نزيهة قبل التسليم وبعده.",
      "- Toute perte ou dommage sera constaté contradictoirement avant et après remise.")),
    note(t("- الهوية ورخصة السياقة للمستأجر قد تم التحقق منها لدى منصة ALTUSplace (KYC) قبل إبرام هذا العقد.",
      "- L'identité et le permis du locataire ont été vérifiés par la plateforme ALTUSplace (KYC) avant la signature du présent contrat.")),
    heading(t("6. سياسة الإلغاء", "6. POLITIQUE D'ANNULATION")),
    note(input.cancelPolicyText),
    heading(t("7. التوقيعات", "7. SIGNATURES")),
    note(t(`حرر بتاريخ: ${dateLabel(input.issuedAt)}`, `Fait le: ${dateLabel(input.issuedAt)}`)),
    note(t("الوكالة المؤجرة: .....................................  المستأجر: .....................................  ",
      "L'agence: .....................................  Le locataire: .....................................  ")),
  ];

  doc.setFillColor(11, 60, 93);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(hasUnicodeFont ? "DejaVuSans" : "helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ALTUSplace", margin, 13);
  doc.setFontSize(10);
  doc.text(isArabic ? shapeArabic("CONTRAT DE LOCATION DE VÉHICULE — عقد كراء سيارة") : "CONTRAT DE LOCATION DE VÉHICULE", margin, 21);
  doc.setTextColor(0, 0, 0);

  if (isArabic && "setR2L" in doc && typeof (doc as any).setR2L === "function") (doc as any).setR2L(true);

  doc.setFont(hasUnicodeFont ? "DejaVuSans" : "helvetica", "bold");
  doc.setFontSize(14);
  doc.setFillColor(229, 124, 35);
  doc.roundedRect(margin, 34, 28, 28, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text(isArabic ? shapeArabic(input.reference) : input.reference, margin, 50, { align: "left", maxWidth: 24 });

  doc.setTextColor(0, 0, 0);
  let y = 70;
  const renderLine = (line: Line) => {
    doc.setFont(hasUnicodeFont ? "DejaVuSans" : "helvetica", line.kind === "heading" ? "bold" : line.kind === "label" ? "bold" : "normal");
    doc.setFontSize(line.kind === "heading" ? 11 : line.kind === "label" ? 8.5 : line.kind === "note" ? 8 : 9.5);
    if (line.kind === "heading") doc.setTextColor(11, 60, 93);
    if (line.kind === "label") doc.setTextColor(120, 120, 120);
    if (line.kind === "value") doc.setTextColor(30, 30, 30);
    if (line.kind === "note") doc.setTextColor(70, 70, 70);
    const sourceText = isArabic ? shapeArabic(line.text) : line.text;
    const wrapped = doc.splitTextToSize(sourceText, contentWidth);
    doc.text(wrapped, isArabic ? pageWidth - margin : margin, y, { align: isArabic ? "right" : "left" });
    doc.setTextColor(0, 0, 0);
    if (line.kind === "blank") return;
    const lineHeight = line.kind === "note" ? 3.8 : 4.8;
    y += wrapped.length * lineHeight + (line.kind === "heading" ? 4 : line.kind === "label" ? 1 : 1.6);
  };

  for (const line of lines) {
    if (y > 268) {
      doc.addPage();
      y = 24;
      if (isArabic && "setR2L" in doc && typeof (doc as any).setR2L === "function") (doc as any).setR2L(true);
    }
    renderLine(line);
  }

  y += 4;
  if (y > 275) {
    doc.addPage();
    y = 24;
  }
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, "F");
  doc.setFont(hasUnicodeFont ? "DejaVuSans" : "helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const footerSource = isArabic ? shapeArabic(input.legalNotice) : input.legalNotice;
  const footer = doc.splitTextToSize(footerSource, contentWidth - 6);
  doc.text(footer, isArabic ? pageWidth - margin - 3 : margin + 3, y + 7, { align: isArabic ? "right" : "left" });

  doc.setFont(hasUnicodeFont ? "DejaVuSans" : "helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(isArabic ? shapeArabic("ALTUSplace — عقد نموذجي للحجز المؤكد عبر المنصة.") : "ALTUSplace — Contrat généré pour une réservation confirmée.", margin, 287);

  return Buffer.from(doc.output("arraybuffer"));
}