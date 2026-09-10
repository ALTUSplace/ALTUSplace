/**
 * KYC document requirements — the single source of truth that binds a booking
 * *category* to the identity document a renter must present before checkout.
 *
 * Turo-style cars require a valid driving licence. Property (real estate,
 * office, hotel) bookings accept a national ID (CNI) or a passport.
 */

export const KYC_DOCUMENT_TYPES = [
  "cni",
  "driving_license",
  "commercial_register",
  "passport",
  "national_id",
] as const;

export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];

export const DRIVING_LICENCE_VALUES: readonly KycDocumentType[] = ["driving_license"];
export const PROPERTY_ID_VALUES: readonly KycDocumentType[] = ["national_id", "cni", "passport"];

/** Accepted originals only — a commercial register is a vendor document, not a guest identity proof. */
export const GUEST_IDENTITY_DOCUMENTS: ReadonlySet<KycDocumentType> = new Set([
  ...DRIVING_LICENCE_VALUES,
  ...PROPERTY_ID_VALUES,
]);

export type BookingCategory = "car" | "property";

export const KYC_DOCUMENT_REQUIREMENTS: Record<BookingCategory, readonly KycDocumentType[]> = {
  car: DRIVING_LICENCE_VALUES,
  property: PROPERTY_ID_VALUES,
};

const CAR_HINTS = /car|سيارة|سيارات/i;
const PROPERTY_HINTS = /real_estate|property|office|hotel|شقة|فيلا|مكتب|فندق|apartment|villa|room/i;

/**
 * Maps a stored listing `category` value (e.g. "car", "real_estate", "office")
 * to the booking category that drives the KYC requirement. Anything that is not
 * a vehicle is treated as a stay (property).
 */
export function normalizeBookingCategory(category: string | null | undefined): BookingCategory {
  const raw = (category ?? "").trim();
  if (CAR_HINTS.test(raw)) return "car";
  if (raw.length === 0 || PROPERTY_HINTS.test(raw)) return "property";
  return /[a-z]/i.test(raw) ? "property" : "property";
}

export function requiredDocumentsForCategory(category: string | null | undefined): readonly KycDocumentType[] {
  return KYC_DOCUMENT_REQUIREMENTS[normalizeBookingCategory(category)];
}

/** Strict gate: a car booking may only be satisfied by a driving licence submission. */
export function isDocumentAllowedForCategory(
  documentType: KycDocumentType,
  category: BookingCategory | null | undefined,
): boolean {
  if (category === undefined || category === null) return true;
  return KYC_DOCUMENT_REQUIREMENTS[category].includes(documentType);
}

/** Never leak a full document number — keep only the last four digits. */
export function maskDocumentNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, "").toUpperCase();
  if (cleaned.length === 0) return null;
  const kept = Math.min(4, cleaned.length);
  return `${"*".repeat(Math.max(6, cleaned.length) - kept)}${cleaned.slice(-kept)}`;
}

export function isDocumentExpired(expiryDate: Date | null | undefined, now: Date = new Date()): boolean {
  return expiryDate !== null && expiryDate !== undefined && expiryDate.getTime() < now.getTime();
}