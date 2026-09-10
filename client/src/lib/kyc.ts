/**
 * Client-side KYC helpers mirroring `server/verification/requirements.ts`.
 * The server is the source of truth; these types only keep the UI in sync.
 */

import { CheckCircle2, Clock3, XCircle, AlertTriangle } from "lucide-react";

export type KycDocumentType = "cni" | "driving_license" | "commercial_register" | "passport" | "national_id";

export type KycStatus = "unverified" | "pending" | "verified" | "rejected";

export type BookingCategory = "car" | "property";

export const DOCUMENT_TYPE_LABELS: Record<KycDocumentType, { ar: string; fr: string; en: string }> = {
  cni: { ar: "بطاقة التعريف الوطنية", fr: "Carte nationale d'identité", en: "National ID" },
  driving_license: { ar: "رخصة القيادة", fr: "Permis de conduire", en: "Driving License" },
  commercial_register: { ar: "السجل التجاري", fr: "Registre du commerce", en: "Commercial Register" },
  passport: { ar: "جواز السفر", fr: "Passeport", en: "Passport" },
  national_id: { ar: "بطاقة التعريف", fr: "Carte d'identité", en: "ID Card" },
};

/** Documents that unlock a car booking (Turo-style) — licence only. */
export const CAR_REQUIRED_DOCUMENTS: readonly KycDocumentType[] = ["driving_license"];

/** Documents that unlock a property/stay booking. */
export const PROPERTY_REQUIRED_DOCUMENTS: readonly KycDocumentType[] = ["national_id", "cni", "passport"];

export const KYC_REQUIRED_DOCUMENTS: Record<BookingCategory, readonly KycDocumentType[]> = {
  car: CAR_REQUIRED_DOCUMENTS,
  property: PROPERTY_REQUIRED_DOCUMENTS,
};

export const KYC_STATUS_CONFIG = {
  verified: {
    icon: CheckCircle2,
    label: { ar: "تم التحقق", fr: "Vérifié", en: "Verified" },
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-700",
  },
  pending: {
    icon: Clock3,
    label: { ar: "قيد المراجعة", fr: "En cours de révision", en: "Pending Review" },
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700",
  },
  rejected: {
    icon: XCircle,
    label: { ar: "مرفوضة", fr: "Rejeté", en: "Rejected" },
    badgeClass: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700",
  },
  unverified: {
    icon: AlertTriangle,
    label: { ar: "غير موثق", fr: "Non vérifié", en: "Unverified" },
    badgeClass: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600",
  },
} as const;

export function getKycStatusFromSubmission(status: string | undefined): KycStatus {
  if (!status) return "unverified";
  if (status === "Approved") return "verified";
  if (status === "Rejected") return "rejected";
  return "pending";
}

export function requiredDocumentsFor(category: string | null | undefined): readonly KycDocumentType[] {
  const raw = (category ?? "").toLowerCase();
  const isCar = /car|سيارة|سيارات/.test(raw);
  return isCar ? CAR_REQUIRED_DOCUMENTS : PROPERTY_REQUIRED_DOCUMENTS;
}

/** True when the user's KYC state permits completing a booking in this category. */
export function isKycSatisfiedFor(
  status: KycStatus | null | undefined,
  approvedDocumentTypes: readonly string[] | undefined,
  category: string | null | undefined,
): boolean {
  if (status !== "verified") return false;
  const required = requiredDocumentsFor(category) as readonly string[];
  const held = approvedDocumentTypes ?? [];
  return required.some((doc) => held.includes(doc));
}