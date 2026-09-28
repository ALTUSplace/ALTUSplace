import { z } from "zod";

/**
 * Single source of truth for the public partner application ("كن شريك") intake.
 *
 * Both the browser form (client/src/pages/PartnerApply.tsx) and the intake
 * endpoint (server/_core/partnerApplication.ts) validate against the schema
 * below, so:
 *   - a payload the browser accepts is a payload the server accepts,
 *   - a payload with a missing/incomplete mandatory field is rejected *before*
 *     any INSERT runs, and
 *   - every rejection carries an Arabic message keyed by the exact field that
 *     has to be corrected (`agencyName`, `vehicles.0.pricePerDay`, ...).
 */

/* ------------------------------------------------------------------ limits */

export const AGENCY_NAME_MIN = 2;
export const AGENCY_NAME_MAX = 80;
export const CITY_MAX = 120;
export const CONTACT_PERSON_MIN = 2;
export const CONTACT_PERSON_MAX = 120;
export const PHONE_MAX = 32;
export const EMAIL_MAX = 320;
export const PARTNER_PASSWORD_MIN = 8;
export const PARTNER_PASSWORD_MAX = 256;
export const WEBSITE_MAX = 255;
export const DESCRIPTION_MAX = 2000;
export const FLEET_SIZE_MAX = 100_000;
export const PROPERTY_COUNT_MAX = 100_000;
export const MAX_VEHICLES = 20;
export const MAX_GALLERY_IMAGES = 4;
export const MAX_TOTAL_IMAGES = 5; // logo + gallery
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB per image
export const MAX_TOTAL_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB across logo + gallery
export const VEHICLE_NAME_MAX = 120;
export const VEHICLE_YEAR_MIN = 1900;
export const VEHICLE_YEAR_MAX = 2100;
export const VEHICLE_SEATS_MIN = 1;
export const VEHICLE_SEATS_MAX = 50;
export const VEHICLE_PRICE_MIN = 1;
export const VEHICLE_PRICE_MAX = 100_000;
export const VEHICLE_FUEL_MAX = 32;
export const VEHICLE_TRANSMISSION_MAX = 32;

/** Kept beside the byte caps so a message can never disagree with the limit. */
const MAX_IMAGE_MB = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));

/** Strip an optional `data:<mime>;base64,` prefix so raw base64 always flows through. */
export function safeBase64(value: string): string {
  const comma = value.indexOf(",");
  return comma !== -1 && value.slice(0, comma).includes(";base64") ? value.slice(comma + 1) : value;
}

/** Approximate decoded byte length of a base64 string (used for size caps). */
export function baseBytesLength(base64: string): number {
  const len = base64.length;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/* ------------------------------------------------ Arabic field dictionary */

export const PARTNER_APPLY_FIELD_LABELS = {
  type: "نوع طلب الانضمام",
  agencyName: "اسم الوكالة",
  city: "المدينة",
  contactPerson: "اسم الشخص المسؤول",
  phone: "رقم الهاتف (واتساب)",
  email: "البريد الإلكتروني",
  password: "كلمة المرور",
  confirmPassword: "تأكيد كلمة المرور",
  fleetSize: "حجم الأسطول (عدد السيارات)",
  propertyCount: "عدد العقارات المتاحة للكراء",
  website: "الموقع الإلكتروني",
  description: "نبذة عن الوكالة",
  logo: "شعار الوكالة",
  gallery: "صور المعرض",
  vehicles: "مركبات الأسطول",
} as const;

export type PartnerApplyField = keyof typeof PARTNER_APPLY_FIELD_LABELS;

/** Visual order of the mandatory fields — drives the error summary + focus. */
export const PARTNER_APPLY_FIELD_ORDER: readonly PartnerApplyField[] = [
  "agencyName",
  "city",
  "contactPerson",
  "fleetSize",
  "propertyCount",
  "website",
  "description",
  "phone",
  "email",
  "password",
  "confirmPassword",
] as const;

const VEHICLE_FIELD_LABELS: Record<string, string> = {
  name: "اسم/موديل المركبة",
  year: "سنة الصنع",
  seats: "عدد المقاعد",
  pricePerDay: "السعر اليومي بالمدرهم",
  fuelType: "نوع الوقود",
  transmission: "ناقل الحركة",
};

/**
 * Arabic label for a validation key, including the indexed vehicle paths the
 * schema produces (`vehicles.0.pricePerDay` -> "السعر اليومي بالمدرهم
 * (المركبة رقم 1)").
 */
export function partnerFieldLabel(key: string): string {
  const parts = key.split(".");
  if (parts[0] === "vehicles" && parts.length === 3) {
    const index = Number(parts[1]);
    const base = VEHICLE_FIELD_LABELS[parts[2]] ?? parts[2];
    return Number.isInteger(index) && index >= 0 ? `${base} (المركبة رقم ${index + 1})` : base;
  }
  if (parts[0] === "gallery") return PARTNER_APPLY_FIELD_LABELS.gallery;
  if (parts[0] === "logo") return PARTNER_APPLY_FIELD_LABELS.logo;
  if (parts[0] === "vehicles") return PARTNER_APPLY_FIELD_LABELS.vehicles;
  // `_form` is the synthetic key used when the body is not an object at all
  // (malformedBodyFailure). It names no field, so describe the request itself
  // rather than letting the raw token reach the summary banner and the API's
  // `error` string.
  if (key === "_form") return "بيانات الطلب";
  return PARTNER_APPLY_FIELD_LABELS[key as PartnerApplyField] ?? key;
}

/* ------------------------------------------------- Arabic error catalogue */

export const PARTNER_APPLY_MESSAGES = {
  type: "نوع طلب الانضمام غير صالح. اختر «وكالة سيارات» أو «وكالة عقارية».",
  agencyNameRequired: "اسم الوكالة مطلوب.",
  agencyNameShort: `اسم الوكالة يجب أن يتكون من ${AGENCY_NAME_MIN} أحرف على الأقل.`,
  agencyNameLong: `اسم الوكالة يجب ألا يتجاوز ${AGENCY_NAME_MAX} حرفاً.`,
  cityRequired: "المدينة مطلوبة.",
  cityLong: `اسم المدينة يجب ألا يتجاوز ${CITY_MAX} حرفاً.`,
  contactPersonRequired: "اسم الشخص المسؤول عن الوكالة مطلوب.",
  contactPersonShort: `اسم الشخص المسؤول يجب أن يتكون من ${CONTACT_PERSON_MIN} أحرف على الأقل.`,
  contactPersonLong: `اسم الشخص المسؤول يجب ألا يتجاوز ${CONTACT_PERSON_MAX} حرفاً.`,
  phoneRequired: "رقم الهاتف (واتساب) مطلوب.",
  phoneInvalid: "رقم الهاتف غير صالح — أدخله بالصيغة الدولية (مثال: +212612345678).",
  phoneLong: `رقم الهاتف يجب ألا يتجاوز ${PHONE_MAX} رقماً.`,
  emailRequired: "البريد الإلكتروني مطلوب.",
  emailInvalid: "البريد الإلكتروني غير صالح — تحقق من كتابته (مثال: name@example.com).",
  emailLong: `البريد الإلكتروني طويل جداً — الحد الأقصى ${EMAIL_MAX} حرفاً.`,
  passwordRequired: "كلمة المرور مطلوبة.",
  passwordShort: `كلمة المرور يجب أن تكون ${PARTNER_PASSWORD_MIN} أحرف على الأقل.`,
  passwordLong: "كلمة المرور طويلة جداً.",
  confirmPasswordRequired: "تأكيد كلمة المرور مطلوب.",
  passwordMismatch: "كلمتا المرور غير متطابقتين.",
  fleetSizeRequired: "عدد سيارات الأسطول مطلوب.",
  fleetSizeNumber: "عدد سيارات الأسطول يجب أن يكون رقماً صحيحاً (مثال: 10).",
  fleetSizeRange: `عدد سيارات الأسطول يجب أن يكون بين 1 و ${FLEET_SIZE_MAX}.`,
  propertyCountRequired: "عدد العقارات المتاحة للكراء مطلوب.",
  propertyCountNumber: "عدد العقارات يجب أن يكون رقماً صحيحاً (مثال: 15).",
  propertyCountRange: `عدد العقارات يجب أن يكون بين 1 و ${PROPERTY_COUNT_MAX}.`,
  websiteInvalid: "رابط الموقع غير صالح — يجب أن يبدأ بـ http:// أو https:// (أو اتركه فارغاً).",
  websiteLong: `رابط الموقع طويل جداً — الحد الأقصى ${WEBSITE_MAX} حرفاً.`,
  descriptionLong: `نبذة عن الوكالة طويلة جداً — الحد الأقصى ${DESCRIPTION_MAX} حرفاً.`,
  vehiclesRequired: "أدخل اسم/موديل كل مركبة أدرجتها في قسم مركبات الأسطول.",
  vehiclesPriceRequired: "أدخل السعر اليومي لكل مركبة كرقم صحيح أكبر من صفر (بالمدرهم).",
  vehiclesYearRange: `سنة الصنع يجب أن تكون بين ${VEHICLE_YEAR_MIN} و ${VEHICLE_YEAR_MAX}.`,
  vehiclesYearNumber: "سنة الصنع يجب أن تكون رقماً صحيحاً.",
  vehiclesSeatsRange: `عدد المقاعد يجب أن يكون بين ${VEHICLE_SEATS_MIN} و ${VEHICLE_SEATS_MAX}.`,
  vehiclesSeatsNumber: "عدد المقاعد يجب أن يكون رقماً صحيحاً.",
  vehiclesNameLong: `اسم/موديل المركبة طويل جداً — الحد الأقصى ${VEHICLE_NAME_MAX} حرفاً.`,
  vehiclesFuelTypeText: "نوع الوقود يجب أن يكون نصاً.",
  vehiclesFuelTypeLong: `نوع الوقود طويل جداً — الحد الأقصى ${VEHICLE_FUEL_MAX} حرفاً.`,
  vehiclesTransmissionText: "ناقل الحركة يجب أن يكون نصاً.",
  vehiclesTransmissionLong: `ناقل الحركة طويل جداً — الحد الأقصى ${VEHICLE_TRANSMISSION_MAX} حرفاً.`,
  vehiclesInvalid: "بيانات مركبات الأسطول غير صالحة.",
  descriptionText: "نبذة عن الوكالة يجب أن تكون نصاً.",
  bodyInvalid: "تعذّر قراءة بيانات الطلب. أعد تحميل الصفحة وأكمل النموذج من جديد.",
  logoInvalid: "شعار الوكالة غير صالح. أعد اختيار صورة صالحة.",
  logoTooLarge: `حجم شعار الوكالة كبير جداً — الحد الأقصى ${MAX_IMAGE_MB} ميجابايت.`,
  galleryInvalid: "صور المعرض غير صالحة. أعد اختيار صورة صالحة.",
  galleryTooLarge: `حجم صورة من صور المعرض كبير جداً — الحد الأقصى ${MAX_IMAGE_MB} ميجابايت لكل صورة.`,
  imagesTooLarge: "إجمالي حجم الصور كبير جداً — الحد الأقصى 10 ميجابايت.",
  galleryTooMany: `يمكن رفع ${MAX_GALLERY_IMAGES} صور في معرض الوكالة كحد أقصى.`,
  vehiclesTooMany: `يمكن إدراج ${MAX_VEHICLES} مركبة كحد أقصى في الطلب الواحد.`,
} as const;

/* --------------------------------------------------------- phone strictness */

/** Digits-only view of a user-entered phone number. */
export function partnerPhoneDigits(value: string): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

/**
 * Strict phone gate for the public application. Rejects blank/short/garbage
 * input ("1", "abc", "212") that the lenient storage normalizer would happily
 * turn into a bogus number, while still allowing Moroccan national (0 + 8/9
 * digits), Moroccan international (212 + 9) and foreign E.164 numbers.
 */
export function isValidPartnerPhone(value: string): boolean {
  const digits = partnerPhoneDigits(value);
  if (digits.length < 8 || digits.length > 15) return false;
  if (digits.startsWith("212") && digits.length !== 12) return false; // 212 + 9 digits
  if (digits.startsWith("0") && digits.length !== 9 && digits.length !== 10) return false;
  return true;
}

/* ------------------------------------------------------------- form helpers */

/** Blank numeric input becomes `undefined` so "required" rules can fire. */
export function toOptionalNumber(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  return Number(trimmed); // NaN surfaces as an Arabic "must be a number" issue
}

export type PartnerVehicleDraft = {
  name: string;
  year: string;
  seats: string;
  pricePerDay: string;
  fuelType: string;
  transmission: string;
};

/** A vehicle row counts as "started" as soon as any of its inputs has content. */
export function isBlankVehicleDraft(vehicle: PartnerVehicleDraft): boolean {
  return ![
    vehicle.name,
    vehicle.year,
    vehicle.seats,
    vehicle.pricePerDay,
    vehicle.fuelType,
    vehicle.transmission,
  ].some((value) => String(value ?? "").trim());
}

/* ----------------------------------------------------------------- schemas */

/**
 * Image-shaped field. Takes the field's own invalid message so a bad gallery
 * photo no longer reports "شعار الوكالة غير صالح" — Arabic, but pointing the
 * applicant at the wrong control. Every node carries an explicit `error`
 * because Zod's defaults are English and the applicant-facing contract is
 * Arabic-only: `fileName`'s length checks and `mimeType`'s upper bound were
 * previously unguarded and leaked "Too small" / "Too big".
 */
const imageSchema = (invalid: string, tooLarge: string) =>
  z
    .object(
      {
        fileName: z
          .string({ error: invalid })
          .trim()
          .min(1, { error: invalid })
          .max(120, { error: invalid })
          .optional(),
        mimeType: z
          .string({ error: invalid })
          .trim()
          .min(1, { error: invalid })
          .max(64, { error: invalid }),
        contentBase64: z
          .string({ error: invalid })
          .min(1, { error: invalid }),
      },
      { error: invalid },
    )
    .superRefine((image, ctx) => {
      // The per-image cap is enforced here rather than in the upload helper
      // because the upload runs *after* the application row is inserted: an
      // image between MAX_IMAGE_BYTES and MAX_TOTAL_IMAGE_BYTES used to cost an
      // INSERT plus a compensating DELETE and answer 500 "تعذر رفع الصور"
      // instead of a 400 the form can point at. Keyed to contentBase64, like
      // every other image error.
      if (baseBytesLength(safeBase64(image.contentBase64)) > MAX_IMAGE_BYTES) {
        ctx.addIssue({ code: "custom", path: ["contentBase64"], message: tooLarge });
      }
    });

const optionalTrimmedText = (max: number, tooLong: string, wrongType: string) =>
  // Written as an explicit union rather than `.optional().or(z.literal(""))`:
  // the union node reports its OWN `invalid_union` issue and discards both
  // branch messages, so a per-branch override cannot stop the English
  // "Invalid input" default from reaching the applicant. Same accepted inputs.
  z.union(
    [
      z
        .string({ error: wrongType })
        .trim()
        .max(max, { error: tooLong })
        .optional(),
      z.literal(""),
    ],
    { error: wrongType },
  );

const partnerVehicleShape = {
  name: z
    .string({ error: PARTNER_APPLY_MESSAGES.vehiclesRequired })
    .trim()
    .min(1, { error: PARTNER_APPLY_MESSAGES.vehiclesRequired })
    .max(VEHICLE_NAME_MAX, { error: PARTNER_APPLY_MESSAGES.vehiclesNameLong }),
  year: z
    .number({ error: PARTNER_APPLY_MESSAGES.vehiclesYearNumber })
    .int({ error: PARTNER_APPLY_MESSAGES.vehiclesYearNumber })
    .min(VEHICLE_YEAR_MIN, { error: PARTNER_APPLY_MESSAGES.vehiclesYearRange })
    .max(VEHICLE_YEAR_MAX, { error: PARTNER_APPLY_MESSAGES.vehiclesYearRange })
    .optional(),
  seats: z
    .number({ error: PARTNER_APPLY_MESSAGES.vehiclesSeatsNumber })
    .int({ error: PARTNER_APPLY_MESSAGES.vehiclesSeatsNumber })
    .min(VEHICLE_SEATS_MIN, { error: PARTNER_APPLY_MESSAGES.vehiclesSeatsRange })
    .max(VEHICLE_SEATS_MAX, { error: PARTNER_APPLY_MESSAGES.vehiclesSeatsRange })
    .optional(),
  pricePerDay: z
    .number({ error: PARTNER_APPLY_MESSAGES.vehiclesPriceRequired })
    .int({ error: PARTNER_APPLY_MESSAGES.vehiclesPriceRequired })
    .min(VEHICLE_PRICE_MIN, { error: PARTNER_APPLY_MESSAGES.vehiclesPriceRequired })
    .max(VEHICLE_PRICE_MAX, { error: PARTNER_APPLY_MESSAGES.vehiclesPriceRequired }),
  // These two previously reused the vehicle *name* message, so a too-long fuel
  // type was reported against the wrong field.
  fuelType: optionalTrimmedText(
    VEHICLE_FUEL_MAX,
    PARTNER_APPLY_MESSAGES.vehiclesFuelTypeLong,
    PARTNER_APPLY_MESSAGES.vehiclesFuelTypeText,
  ),
  transmission: optionalTrimmedText(
    VEHICLE_TRANSMISSION_MAX,
    PARTNER_APPLY_MESSAGES.vehiclesTransmissionLong,
    PARTNER_APPLY_MESSAGES.vehiclesTransmissionText,
  ),
};

// Element-level `error` so a malformed row (`vehicles: [null]`) is reported in
// Arabic rather than with zod's "Invalid input: expected object".
export const partnerVehicleSchema = z.object(partnerVehicleShape, {
  error: PARTNER_APPLY_MESSAGES.vehiclesInvalid,
});

export type PartnerVehicleWire = z.infer<typeof partnerVehicleSchema>;

const partnerApplyBaseShape = {
  agencyName: z
    .string({ error: PARTNER_APPLY_MESSAGES.agencyNameRequired })
    .trim()
    .min(AGENCY_NAME_MIN, { error: PARTNER_APPLY_MESSAGES.agencyNameShort })
    .max(AGENCY_NAME_MAX, { error: PARTNER_APPLY_MESSAGES.agencyNameLong }),
  city: z
    .string({ error: PARTNER_APPLY_MESSAGES.cityRequired })
    .trim()
    .min(1, { error: PARTNER_APPLY_MESSAGES.cityRequired })
    .max(CITY_MAX, { error: PARTNER_APPLY_MESSAGES.cityLong }),
  contactPerson: z
    .string({ error: PARTNER_APPLY_MESSAGES.contactPersonRequired })
    .trim()
    .min(CONTACT_PERSON_MIN, { error: PARTNER_APPLY_MESSAGES.contactPersonShort })
    .max(CONTACT_PERSON_MAX, { error: PARTNER_APPLY_MESSAGES.contactPersonLong }),
  phone: z
    .string({ error: PARTNER_APPLY_MESSAGES.phoneRequired })
    .trim()
    .min(1, { error: PARTNER_APPLY_MESSAGES.phoneRequired })
    .max(PHONE_MAX, { error: PARTNER_APPLY_MESSAGES.phoneLong })
    .refine(isValidPartnerPhone, { error: PARTNER_APPLY_MESSAGES.phoneInvalid }),
  email: z
    .string({ error: PARTNER_APPLY_MESSAGES.emailRequired })
    .trim()
    .min(1, { error: PARTNER_APPLY_MESSAGES.emailRequired })
    .toLowerCase()
    .pipe(z.email({ error: PARTNER_APPLY_MESSAGES.emailInvalid }))
    .pipe(z.string().max(EMAIL_MAX, { error: PARTNER_APPLY_MESSAGES.emailLong })),
  password: z
    .string({ error: PARTNER_APPLY_MESSAGES.passwordRequired })
    .min(PARTNER_PASSWORD_MIN, { error: PARTNER_APPLY_MESSAGES.passwordShort })
    .max(PARTNER_PASSWORD_MAX, { error: PARTNER_APPLY_MESSAGES.passwordLong }),
  // Optional: the form submits an untouched input as "" (not undefined), so an
  // empty value has to be accepted here or the browser would flag a field the
  // applicant never filled in.
  website: z
    .string({ error: PARTNER_APPLY_MESSAGES.websiteInvalid })
    .trim()
    .max(WEBSITE_MAX, { error: PARTNER_APPLY_MESSAGES.websiteLong })
    .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), {
      error: PARTNER_APPLY_MESSAGES.websiteInvalid,
    })
    .optional(),
  description: z
    .string({ error: PARTNER_APPLY_MESSAGES.descriptionText })
    .trim()
    .max(DESCRIPTION_MAX, { error: PARTNER_APPLY_MESSAGES.descriptionLong })
    .optional(),
  logo: imageSchema(PARTNER_APPLY_MESSAGES.logoInvalid, PARTNER_APPLY_MESSAGES.logoTooLarge).optional(),
  gallery: z
    .array(
      imageSchema(PARTNER_APPLY_MESSAGES.galleryInvalid, PARTNER_APPLY_MESSAGES.galleryTooLarge),
      { error: PARTNER_APPLY_MESSAGES.galleryInvalid },
    )
    .max(MAX_GALLERY_IMAGES, { error: PARTNER_APPLY_MESSAGES.galleryTooMany })
    .optional(),
  vehicles: z
    .array(partnerVehicleSchema, { error: PARTNER_APPLY_MESSAGES.vehiclesInvalid })
    .max(MAX_VEHICLES, { error: PARTNER_APPLY_MESSAGES.vehiclesTooMany })
    .optional(),
} as const;

/* ------------------------------------------------- mandatory fleet details */

type PartnerCountFieldSpec = {
  /** Shown when the applicant left the field empty. */
  required: string;
  /** Shown when the field holds something that is not a number at all. */
  number: string;
  /** Shown when the number is outside the accepted range. */
  range: string;
  max: number;
};

const FLEET_SIZE_FIELD: PartnerCountFieldSpec = {
  required: PARTNER_APPLY_MESSAGES.fleetSizeRequired,
  number: PARTNER_APPLY_MESSAGES.fleetSizeNumber,
  range: PARTNER_APPLY_MESSAGES.fleetSizeRange,
  max: FLEET_SIZE_MAX,
};

const PROPERTY_COUNT_FIELD: PartnerCountFieldSpec = {
  required: PARTNER_APPLY_MESSAGES.propertyCountRequired,
  number: PARTNER_APPLY_MESSAGES.propertyCountNumber,
  range: PARTNER_APPLY_MESSAGES.propertyCountRange,
  max: PROPERTY_COUNT_MAX,
};

const isBlankCountInput = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/**
 * Fleet size / property count.
 *
 * "Mandatory" is enforced by the branch that owns the field, never by a
 * cross-field rule: zod skips `superRefine`/`.check` entirely once the
 * enclosing object (or discriminated union) has already failed, so a superRefine
 * rule silently drops its message whenever another field is also empty — which
 * is exactly the all-blank-form case that matters most. Requiring the field in
 * the schema keeps the Arabic message attached to the right input.
 */
function partnerCountField(spec: PartnerCountFieldSpec, required: boolean) {
  const count = z
    .number({ error: (issue) => (isBlankCountInput(issue.input) ? spec.required : spec.number) })
    .int({ error: spec.number })
    .min(1, { error: spec.range })
    .max(spec.max, { error: spec.range });
  return required ? count : count.optional();
}

/**
 * The chosen application type decides which fleet detail is mandatory: a car
 * agency states its fleet size, a real-estate agency its property count.
 * Modelling this as a discriminated union (rather than one flat object plus a
 * conditional rule) is what keeps every message field-addressed.
 */
const carRentalBranch = {
  ...partnerApplyBaseShape,
  type: z.literal("car_rental"),
  fleetSize: partnerCountField(FLEET_SIZE_FIELD, true),
  propertyCount: partnerCountField(PROPERTY_COUNT_FIELD, false),
};

const realEstateBranch = {
  ...partnerApplyBaseShape,
  type: z.literal("real_estate"),
  fleetSize: partnerCountField(FLEET_SIZE_FIELD, false),
  propertyCount: partnerCountField(PROPERTY_COUNT_FIELD, true),
};

const confirmPasswordField = z
  .string({ error: PARTNER_APPLY_MESSAGES.confirmPasswordRequired })
  .trim()
  .min(1, { error: PARTNER_APPLY_MESSAGES.confirmPasswordRequired })
  .max(PARTNER_PASSWORD_MAX, { error: PARTNER_APPLY_MESSAGES.passwordLong });

/**
 * The draft deliberately does not police the vehicle rows. The form validates
 * each row separately, against its *original* index, so a partially filled row
 * lands on the exact input the applicant sees; re-checking the rows here would
 * abort the draft (and with it the password-confirmation check below) as soon
 * as one row is incomplete, hiding that error until a second submit. The
 * endpoint still validates every row strictly.
 */
const partnerApplyDraftBaseShape = {
  ...partnerApplyBaseShape,
  vehicles: z
    .array(z.unknown())
    .max(MAX_VEHICLES, { error: PARTNER_APPLY_MESSAGES.vehiclesTooMany })
    .optional(),
  confirmPassword: confirmPasswordField,
};

/** Server-side contract for `POST /api/auth/partner/apply`. */
export const partnerApplySchema = z.discriminatedUnion(
  "type",
  [z.object(carRentalBranch), z.object(realEstateBranch)],
  { error: PARTNER_APPLY_MESSAGES.type },
);

export type PartnerApplyInput = z.infer<typeof partnerApplySchema>;

/** Browser-side draft schema — adds the password confirmation field. */
export const partnerApplyDraftSchema = z
  .discriminatedUnion(
    "type",
    [
      z.object({ ...carRentalBranch, ...partnerApplyDraftBaseShape }),
      z.object({ ...realEstateBranch, ...partnerApplyDraftBaseShape }),
    ],
    { error: PARTNER_APPLY_MESSAGES.type },
  )
  .superRefine((draft, ctx) => {
    if (draft.password !== draft.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: PARTNER_APPLY_MESSAGES.passwordMismatch,
      });
    }
  });

/* --------------------------------------------------------------- validation */

export type PartnerFieldErrors = Record<string, string>;

export type PartnerApplyValidation<T> =
  | { ok: true; data: T; fieldErrors: null; firstInvalidField: null }
  | { ok: false; data: null; fieldErrors: PartnerFieldErrors; firstInvalidField: string | null };

const hasArabic = /[\u0600-\u06FF]/;

/** Flattens a ZodError into `fieldKey -> Arabic message` (first error wins). */
export function partnerFieldErrorsFromZod(error: z.ZodError): PartnerFieldErrors {
  const fieldErrors: PartnerFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_form";
    if (fieldErrors[key] === undefined) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** The invalid field the UI should focus first: visual order, then any other. */
export function firstInvalidPartnerField(fieldErrors: PartnerFieldErrors): string | null {
  const keys = Object.keys(fieldErrors);
  if (keys.length === 0) return null;
  for (const field of PARTNER_APPLY_FIELD_ORDER) {
    if (fieldErrors[field] !== undefined) return field;
  }
  return keys[0] ?? null;
}

function failure(fieldErrors: PartnerFieldErrors): PartnerApplyValidation<never> {
  return { ok: false, data: null, fieldErrors, firstInvalidField: firstInvalidPartnerField(fieldErrors) };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A missing/blank/non-object body is a malformed request rather than a field
 * error, so it is reported as one Arabic `_form` message instead of zod's
 * English "expected object, received ...".
 */
function malformedBodyFailure(): PartnerApplyValidation<never> {
  return failure({ _form: PARTNER_APPLY_MESSAGES.bodyInvalid });
}

/** Server guard: validates a raw JSON body before anything touches the DB. */
export function validatePartnerApplyBody(input: unknown): PartnerApplyValidation<PartnerApplyInput> {
  if (!isPlainObject(input)) return malformedBodyFailure();
  const parsed = partnerApplySchema.safeParse(input);
  if (!parsed.success) return failure(partnerFieldErrorsFromZod(parsed.error));
  return { ok: true, data: parsed.data, fieldErrors: null, firstInvalidField: null };
}

/** Browser guard: validates the in-progress form draft field by field. */
export function validatePartnerApplyDraft(
  input: unknown,
): PartnerApplyValidation<z.infer<typeof partnerApplyDraftSchema>> {
  if (!isPlainObject(input)) return malformedBodyFailure();
  const parsed = partnerApplyDraftSchema.safeParse(input);
  if (!parsed.success) return failure(partnerFieldErrorsFromZod(parsed.error));
  return { ok: true, data: parsed.data, fieldErrors: null, firstInvalidField: null };
}

/**
 * Validates a single vehicle row against its *original* form index, so the
 * error key (`vehicles.0.name`) always points at the row the applicant sees
 * even when unused rows are dropped from the submitted array.
 */
export function validatePartnerVehicleRow(
  index: number,
  row: unknown,
): PartnerFieldErrors {
  const parsed = partnerVehicleSchema.safeParse(row);
  if (parsed.success) return {};
  const fieldErrors: PartnerFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "name");
    fieldErrors[`vehicles.${index}.${field}`] = issue.message;
  }
  return fieldErrors;
}

/** Converts a vehicle row draft into the wire shape expected by the schema. */
export function partnerVehicleDraftToWire(vehicle: PartnerVehicleDraft): Record<string, unknown> {
  return {
    name: vehicle.name.trim(),
    year: toOptionalNumber(vehicle.year),
    seats: toOptionalNumber(vehicle.seats),
    // A blank price stays NaN so the row is reported as incomplete instead of
    // being silently treated as 0.
    pricePerDay: toOptionalNumber(vehicle.pricePerDay) ?? Number.NaN,
    fuelType: vehicle.fuelType.trim() || undefined,
    transmission: vehicle.transmission.trim() || undefined,
  };
}

/* ------------------------------------------------------------- UX messages */

/** Headline for the error summary shown above the form. */
export function partnerValidationSummary(fieldErrors: PartnerFieldErrors): string {
  const count = Object.keys(fieldErrors).length;
  if (count === 0) return "";
  if (count === 1) {
    const key = Object.keys(fieldErrors)[0] as string;
    return `تعذّر إرسال الطلب: الحقل «${partnerFieldLabel(key)}» غير مكتمل. صحّحه ثم أعد المحاولة.`;
  }
  return `تعذّر إرسال الطلب: ${count} حقول غير مكتملة. تم تمييزها بالأحمر — صحّحها ثم أعد المحاولة.`;
}

/**
 * Single Arabic message for the API `error` field: the first offending field,
 * labelled. The full per-field map travels in `fieldErrors` so the form can
 * point at the exact input that has to be corrected.
 */
export function partnerFirstFieldMessage(fieldErrors: PartnerFieldErrors): string {
  const key = firstInvalidPartnerField(fieldErrors);
  if (key === null) return "بيانات غير صالحة. تحقق من الحقول ثم أعد المحاولة.";
  const message = fieldErrors[key] as string;
  const label = partnerFieldLabel(key);
  return message.includes(label) ? message : `«${label}»: ${message}`;
}

/** Guards against a future refactor swapping an Arabic message for a raw one. */
export function isArabicValidationMessage(message: string): boolean {
  return hasArabic.test(message);
}
