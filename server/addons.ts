/**
 * Authoritative add-on pricing for the checkout flow.
 *
 * The server never trusts client-computed amounts: add-on fees are re-derived
 * here from the canonical catalog on every booking/payment transaction so the
 * totals shown at checkout always reconcile with what is persisted.
 */

export type AddOnId = "insurance" | "baby_seat" | "delivery" | "additional_driver" | "cleaning" | "parking" | "late_checkin";

/** Add-ons offered for car rentals (Turo-style). */
export const CAR_ADDON_IDS: readonly AddOnId[] = ["insurance", "baby_seat", "delivery", "additional_driver"];

/** Add-ons offered for property stays (cleaning, parking, late check-in). */
export const PROPERTY_ADDON_IDS: readonly AddOnId[] = ["cleaning", "parking", "late_checkin"];

export type AddOnDefinition = {
  id: AddOnId;
  /** Fee in MAD. When `perDay` is true this is charged for every rental day. */
  fee: number;
  perDay: boolean;
  labelAr: string;
  labelFr: string;
  labelEn: string;
};

export const ADDONS_CATALOG: Record<AddOnId, AddOnDefinition> = {
  insurance: {
    id: "insurance",
    fee: 100,
    perDay: true,
    labelAr: "تأمين شامل (تغطية كاملة)",
    labelFr: "Assurance tous risques",
    labelEn: "Full coverage insurance",
  },
  baby_seat: {
    id: "baby_seat",
    fee: 50,
    perDay: true,
    labelAr: "كرسي أطفال",
    labelFr: "Siège bébé",
    labelEn: "Baby seat",
  },
  delivery: {
    id: "delivery",
    fee: 200,
    perDay: false,
    labelAr: "توصيل إلى مطار محمد الخامس أو عنوانك",
    labelFr: "Livraison aéroport Mohammed V ou à votre adresse",
    labelEn: "Delivery to Mohammed V airport or your address",
  },
  additional_driver: {
    id: "additional_driver",
    fee: 75,
    perDay: true,
    labelAr: "سائق إضافي",
    labelFr: "Conducteur additionnel",
    labelEn: "Additional driver",
  },
  cleaning: {
    id: "cleaning",
    fee: 300,
    perDay: false,
    labelAr: "تنظيف شامل عند المغادرة",
    labelFr: "Ménage complet au départ",
    labelEn: "Full cleaning on departure",
  },
  parking: {
    id: "parking",
    fee: 50,
    perDay: true,
    labelAr: "مكان ركن سيارة خاص",
    labelFr: "Place de parking privée",
    labelEn: "Private parking spot",
  },
  late_checkin: {
    id: "late_checkin",
    fee: 100,
    perDay: false,
    labelAr: "تسجيل وصول متأخر (بعد 22:00)",
    labelFr: "Arrivée tardive (après 22h)",
    labelEn: "Late check-in (after 22:00)",
  },
};

export const ALL_ADDON_IDS = Object.keys(ADDONS_CATALOG) as AddOnId[];

export function isAddOnId(value: unknown): value is AddOnId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ADDONS_CATALOG, value);
}

/** Canonical zod-safe selector list the checkout sends along with a booking. */
export function normalizeAddOns(value: unknown): AddOnId[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isAddOnId);
}

/**
 * Total add-on price in MAD for a rental duration and the selected set.
 * Flat add-ons (e.g. airport delivery) are charged once per booking.
 */
export function calculateAddOnsTotal(selected: readonly AddOnId[] | undefined | null, days: number): number {
  if (!selected || selected.length === 0) return 0;
  if (!Number.isInteger(days) || days <= 0) return 0;
  return selected.reduce((sum, id) => {
    const def = ADDONS_CATALOG[id];
    if (!def) return sum;
    return sum + (def.perDay ? def.fee * days : def.fee);
  }, 0);
}

export function addOnLabels(selected: readonly AddOnId[], language: "ar" | "fr" | "en"): string[] {
  const key = language === "fr" ? "labelFr" : language === "en" ? "labelEn" : "labelAr";
  return selected.map((id) => ADDONS_CATALOG[id]?.[key]).filter((label): label is string => Boolean(label));
}