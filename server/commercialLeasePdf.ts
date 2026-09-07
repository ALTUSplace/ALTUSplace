import fs from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import { buildCommercialLeaseText, type CommercialLeaseInput } from "../client/src/lib/commercialLease";
import { shapeArabic } from "./arabicShaper";

function loadArabicFont(doc: jsPDF) {
  const fontPath = path.resolve(process.cwd(), "server/assets/DejaVuSans.ttf");
  if (!fs.existsSync(fontPath)) return false;
  const font = fs.readFileSync(fontPath).toString("base64");
  doc.addFileToVFS("DejaVuSans.ttf", font);
  doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
  doc.addFont("DejaVuSans.ttf", "DejaVuSans", "bold");
  return true;
}

export function generateServerCommercialLeasePdf(input: CommercialLeaseInput): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const hasUnicodeFont = loadArabicFont(doc);
  const isArabic = input.language === "ar";
  const pageWidth = 210;
  const margin = 18;
  let y = 40;
  const lines = buildCommercialLeaseText(input);

  doc.setFillColor(11, 60, 93);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(hasUnicodeFont ? "DejaVuSans" : "helvetica", "bold");
  doc.setFontSize(18);
  doc.text("B2-RENT", margin, 13);
  doc.setFontSize(10);
  doc.text(isArabic ? shapeArabic("عقد كراء تجاري / مهني") : "CONTRAT DE BAIL COMMERCIAL / PROFESSIONNEL", margin, 21);
  doc.setTextColor(0, 0, 0);
  if (isArabic && "setR2L" in doc && typeof (doc as any).setR2L === "function") (doc as any).setR2L(true);

  lines.forEach((text, index) => {
    const isHeading = index === 0 || /^\d+\./.test(text);
    doc.setFont(hasUnicodeFont ? "DejaVuSans" : "helvetica", isHeading ? "bold" : "normal");
    doc.setFontSize(isHeading ? 11 : 9.5);
    if (isHeading) doc.setTextColor(11, 60, 93);
    const sourceText = isArabic ? shapeArabic(text) : text;
    const wrapped = doc.splitTextToSize(sourceText, pageWidth - margin * 2);
    doc.text(wrapped, isArabic ? pageWidth - margin : margin, y, { align: isArabic ? "right" : "left" });
    doc.setTextColor(0, 0, 0);
    y += wrapped.length * 4.5 + (isHeading ? 5 : 3);
    if (y > 270) { doc.addPage(); y = 20; }
  });

  doc.setFont(hasUnicodeFont ? "DejaVuSans" : "helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(isArabic ? shapeArabic("B2-Rent — نموذج تقني للمراجعة القانونية قبل الاستعمال.") : "B2-Rent — Modèle technique à faire valider par un professionnel du droit.", margin, 287);
  return Buffer.from(doc.output("arraybuffer"));
}
