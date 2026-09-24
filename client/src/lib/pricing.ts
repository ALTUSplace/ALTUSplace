/**
 * Shared booking price helpers used by CarDetails, Checkout and property
 * detail pages. The server remains the authoritative price calculator —
 * these helpers keep the client preview aligned with its semantics
 * (midday-anchored dates, ceil duration, guarded subtotal).
 */

/** Daily insurance fee applied when the renter opts into full coverage. */
export const INSURANCE_FEE_PER_DAY = 100;

/** Daily baby-seat fee applied when the renter opts into the add-on. */
export const BABY_SEAT_FEE_PER_DAY = 50;

/**
 * Parses a `YYYY-MM-DD` (or full ISO) date string anchored to midday so
 * daylight-saving transitions cannot shift the day count. Returns null for
 * empty or unparseable values.
 */
export function parseDayDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Rental duration in days between two date strings (ceil, end exclusive).
 * Returns 0 when either date is missing/invalid or when the range is not
 * strictly forward — callers apply their own display fallback on top.
 */
export function calculateRentalDays(startDate: string, endDate: string): number {
  const start = parseDayDate(startDate);
  const end = parseDayDate(endDate);
  if (!start || !end || end.getTime() <= start.getTime()) return 0;
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Price subtotal for a rental. Returns 0 when the rate or duration is not a
 * positive finite number, mirroring the checkout guard against NaN leakage.
 */
export function calculateRentalSubtotal(pricePerDay: number, days: number): number {
  if (!Number.isFinite(pricePerDay) || pricePerDay <= 0) return 0;
  if (!Number.isInteger(days) || days <= 0) return 0;
  return pricePerDay * days;
}

/**
 * Checkout add-ons (server/Addons.ts is the authoritative source of these
 * fees — this client mirror keeps the preview totals in lockstep with it).
 */
export type AddOnId = "insurance" | "baby_seat" | "delivery" | "additional_driver" | "cleaning" | "parking" | "late_checkin";

/** Add-ons offered for car rentals (Turo-style). */
export const CAR_ADDON_IDS: readonly AddOnId[] = ["insurance", "baby_seat", "delivery", "additional_driver"];

/** Add-ons offered for property stays (cleaning, parking, late check-in). */
export const PROPERTY_ADDON_IDS: readonly AddOnId[] = ["cleaning", "parking", "late_checkin"];

export const ADDON_CATALOG: Record<AddOnId, { fee: number; perDay: boolean; labelAr: string; labelFr: string; labelEn: string }> = {
  insurance: { fee: 100, perDay: true, labelAr: "تأمين شامل (تغطية كاملة)", labelFr: "Assurance tous risques", labelEn: "Full coverage insurance" },
  baby_seat: { fee: 50, perDay: true, labelAr: "كرسي أطفال", labelFr: "Siège bébé", labelEn: "Baby seat" },
  delivery: { fee: 200, perDay: false, labelAr: "توصيل إلى مطار محمد الخامس أو عنوانك", labelFr: "Livraison aéroport Mohammed V ou adresse", labelEn: "Delivery to Mohammed V airport or your address" },
  additional_driver: { fee: 75, perDay: true, labelAr: "سائق إضافي", labelFr: "Conducteur additionnel", labelEn: "Additional driver" },
  cleaning: { fee: 300, perDay: false, labelAr: "تنظيف شامل عند المغادرة", labelFr: "Ménage complet au départ", labelEn: "Full cleaning on departure" },
  parking: { fee: 50, perDay: true, labelAr: "مكان ركن سيارة خاص", labelFr: "Place de parking privée", labelEn: "Private parking spot" },
  late_checkin: { fee: 100, perDay: false, labelAr: "تسجيل وصول متأخر (بعد 22:00)", labelFr: "Arrivée tardive (après 22h)", labelEn: "Late check-in (after 22:00)" },
};

export function isAddOnId(value: unknown): value is AddOnId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ADDON_CATALOG, value);
}

/** Total price for the selected add-ons across a rental duration. */
export function calculateAddOnsTotal(selected: readonly AddOnId[], days: number): number {
  if (!selected || selected.length === 0) return 0;
  if (!Number.isInteger(days) || days <= 0) return 0;
  return selected.reduce((sum, id) => {
    const def = ADDON_CATALOG[id];
    if (!def) return sum;
    return sum + (def.perDay ? def.fee * days : def.fee);
  }, 0);
}

export type CheckoutTotals = {
  subtotal: number;
  addOnsTotal: number;
  total: number;
};

/** Full checkout preview: base rental + add-ons + grand total. */
export function calculateCheckoutTotal(pricePerDay: number, days: number, selected: readonly AddOnId[]): CheckoutTotals {
  const subtotal = calculateRentalSubtotal(pricePerDay, days);
  const addOnsTotal = calculateAddOnsTotal(selected ?? [], days);
  return { subtotal, addOnsTotal, total: subtotal + addOnsTotal };
}
