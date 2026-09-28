import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isBlankVehicleDraft,
  isValidPartnerPhone,
  partnerFieldLabel,
  partnerFirstFieldMessage,
  partnerValidationSummary,
  partnerVehicleDraftToWire,
  toOptionalNumber,
  validatePartnerApplyBody,
  validatePartnerApplyDraft,
  validatePartnerVehicleRow,
  PARTNER_APPLY_MESSAGES,
  baseBytesLength,
  safeBase64,
  MAX_IMAGE_BYTES,
  type PartnerFieldErrors,
} from "../shared/partnerApplication";

const ARABIC = /[\u0600-\u06FF]/;
const ENGLISH_ZOD_PHRASES = [
  "Invalid",
  "Required",
  "Too small",
  "Too big",
  "expected",
  "must be",
];

const completeCarRental = {
  type: "car_rental",
  agencyName: "وكالة الأطلس للكراء",
  city: "مراكش",
  contactPerson: "يوسف بن علي",
  phone: "+212612345678",
  email: "contact@example.com",
  password: "password123",
  fleetSize: 12,
};

const completeRealEstate = {
  ...completeCarRental,
  type: "real_estate",
  fleetSize: undefined,
  propertyCount: 15,
};

const draftFor = (overrides: Record<string, unknown> = {}) => ({
  ...completeCarRental,
  confirmPassword: "password123",
  ...overrides,
});

const expectAllArabic = (fieldErrors: PartnerFieldErrors) => {
  for (const [field, message] of Object.entries(fieldErrors)) {
    expect(message, `message for "${field}" must be Arabic`).toMatch(ARABIC);
    for (const phrase of ENGLISH_ZOD_PHRASES) {
      expect(message, `message for "${field}" must not leak "${phrase}"`).not.toContain(phrase);
    }
  }
};

describe("partner application — accepts complete submissions", () => {
  it("accepts a fully complete car-rental application", () => {
    const result = validatePartnerApplyBody(completeCarRental);
    expect(result.ok).toBe(true);
    expect(result.data?.agencyName).toBe("وكالة الأطلس للكراء");
    expect(result.fieldErrors).toBeNull();
    expect(result.firstInvalidField).toBeNull();
  });

  it("accepts a fully complete real-estate application", () => {
    const result = validatePartnerApplyBody(completeRealEstate);
    expect(result.ok).toBe(true);
    expect(result.data?.propertyCount).toBe(15);
  });

  it("normalizes the email to lower case", () => {
    const result = validatePartnerApplyBody({ ...completeCarRental, email: "  Partner@Example.COM " });
    expect(result.data?.email).toBe("partner@example.com");
  });

  it("accepts national, landline and international phone formats", () => {
    for (const phone of ["+212612345678", "212612345678", "0612345678", "0522-123456"]) {
      expect(validatePartnerApplyBody({ ...completeCarRental, phone }).ok, phone).toBe(true);
    }
  });
});

describe("partner application — rejects every missing mandatory field", () => {
  const mandatoryCases: Array<[string, Record<string, unknown>]> = [
    ["agencyName", { agencyName: "" }],
    ["agencyName", { agencyName: "   " }],
    ["agencyName", { agencyName: "ا" }],
    ["city", { city: "" }],
    ["contactPerson", { contactPerson: "" }],
    ["contactPerson", { contactPerson: "  " }],
    ["phone", { phone: "" }],
    ["phone", { phone: "1" }],
    ["phone", { phone: "abc" }],
    ["phone", { phone: "212" }],
    ["phone", { phone: "212612" }],
    ["email", { email: "" }],
    ["email", { email: "not-an-email" }],
    ["email", { email: "@example.com" }],
    ["password", { password: "" }],
    ["password", { password: "short" }],
    ["fleetSize", { fleetSize: undefined }],
    ["fleetSize", { fleetSize: 0 }],
    ["fleetSize", { fleetSize: -3 }],
    ["fleetSize", { fleetSize: Number.NaN }],
  ];

  for (const [field, overrides] of mandatoryCases) {
    it(`rejects "${field}" when it is ${JSON.stringify(overrides[field])}`, () => {
      const result = validatePartnerApplyBody({ ...completeCarRental, ...overrides });
      expect(result.ok).toBe(false);
      expect(Object.keys(result.fieldErrors ?? {})).toContain(field);
      expectAllArabic(result.fieldErrors ?? {});
    });
  }

  it("reports every missing field at once instead of only the first", () => {
    const result = validatePartnerApplyBody({
      type: "car_rental",
      agencyName: "",
      city: "",
      contactPerson: "",
      phone: "",
      email: "",
      password: "",
    });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual([
      "agencyName",
      "city",
      "contactPerson",
      "email",
      "fleetSize",
      "password",
      "phone",
    ]);
    expectAllArabic(result.fieldErrors ?? {});
  });

  it("requires the property count for a real-estate application", () => {
    const result = validatePartnerApplyBody({
      ...completeRealEstate,
      propertyCount: undefined,
    });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors ?? {})).toContain("propertyCount");
    expectAllArabic(result.fieldErrors ?? {});
  });

  it("rejects a non-object body without throwing", () => {
    for (const body of [undefined, null, "", "text", 42, []]) {
      const result = validatePartnerApplyBody(body);
      expect(result.ok, String(body)).toBe(false);
      expectAllArabic(result.fieldErrors ?? {});
    }
  });

  /**
   * The browser submits every untouched input as "" rather than dropping the
   * key, so an optional field left empty must stay optional — otherwise the
   * form flags fields the applicant never filled in.
   */
  it("treats untouched optional fields as omitted instead of invalid", () => {
    const result = validatePartnerApplyBody({
      ...completeCarRental,
      website: "",
      description: "",
      logo: undefined,
      gallery: [],
      vehicles: [],
    });
    expect(result.ok).toBe(true);
    expect(result.fieldErrors).toBeNull();
  });

  it("still rejects a website that is neither empty nor a URL", () => {
    for (const website of ["example.com", "javascript:alert(1)", "ftp://altusplace.ma"]) {
      const result = validatePartnerApplyBody({ ...completeCarRental, website });
      expect(result.ok, website).toBe(false);
      expect(Object.keys(result.fieldErrors ?? {})).toEqual(["website"]);
      expectAllArabic(result.fieldErrors ?? {});
    }
  });

  it("accepts the blank optional fields the draft always carries", () => {
    expect(validatePartnerApplyDraft(draftFor({ website: "", description: "" })).ok).toBe(true);
  });
});

describe("partner application — fleet details", () => {
  it("flags an incomplete vehicle row at its original form index", () => {
    const row = partnerVehicleDraftToWire({
      name: "داسيا داستر",
      year: "2022",
      seats: "",
      pricePerDay: "",
      fuelType: "",
      transmission: "",
    });
    const fieldErrors = validatePartnerVehicleRow(2, row);
    expect(fieldErrors).toHaveProperty("vehicles.2.pricePerDay");
    expectAllArabic(fieldErrors);
  });

  it("flags a missing vehicle name", () => {
    const row = partnerVehicleDraftToWire({
      name: "  ",
      year: "",
      seats: "",
      pricePerDay: "350",
      fuelType: "",
      transmission: "",
    });
    expect(Object.keys(validatePartnerVehicleRow(0, row))).toEqual(["vehicles.0.name"]);
  });

  it("rejects out-of-range year and seat counts", () => {
    const yearErrors = validatePartnerVehicleRow(
      0,
      partnerVehicleDraftToWire({
        name: "داسيا داستر",
        year: "1800",
        seats: "",
        pricePerDay: "350",
        fuelType: "",
        transmission: "",
      }),
    );
    expect(Object.keys(yearErrors)).toEqual(["vehicles.0.year"]);
    const seatErrors = validatePartnerVehicleRow(
      0,
      partnerVehicleDraftToWire({
        name: "داسيا داستر",
        year: "",
        seats: "99",
        pricePerDay: "350",
        fuelType: "",
        transmission: "",
      }),
    );
    expect(Object.keys(seatErrors)).toEqual(["vehicles.0.seats"]);
    expectAllArabic({ ...yearErrors, ...seatErrors });
  });

  it("treats a fully empty row as untouched, not as an error", () => {
    const empty = {
      name: "",
      year: "",
      seats: "",
      pricePerDay: "",
      fuelType: "",
      transmission: "",
    };
    expect(isBlankVehicleDraft(empty)).toBe(true);
    // ...but a row the applicant started filling in is not blank.
    expect(isBlankVehicleDraft({ ...empty, year: "2022" })).toBe(false);
    expect(isBlankVehicleDraft({ ...empty, pricePerDay: "350" })).toBe(false);
  });

  it("accepts a complete vehicle row", () => {
    const row = partnerVehicleDraftToWire({
      name: "داسيا داستر 2022",
      year: "2022",
      seats: "5",
      pricePerDay: "350",
      fuelType: "ديزل",
      transmission: "أوتوماتيك",
    });
    expect(validatePartnerVehicleRow(0, row)).toEqual({});
  });

  it("still rejects an incomplete vehicle row at the endpoint", () => {
    // The draft leaves rows to the per-row pass; the server keeps checking them.
    const result = validatePartnerApplyBody({
      ...completeCarRental,
      vehicles: [
        partnerVehicleDraftToWire({
          name: "داسيا داستر",
          year: "",
          seats: "",
          pricePerDay: "",
          fuelType: "",
          transmission: "",
        }),
      ],
    });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(["vehicles.0.pricePerDay"]);
    expectAllArabic(result.fieldErrors ?? {});
  });
});

describe("partner application — password confirmation (browser only)", () => {
  it("rejects mismatched passwords on the key confirmPassword", () => {
    const result = validatePartnerApplyDraft(draftFor({ confirmPassword: "different1" }));
    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors ?? {})).toContain("confirmPassword");
    expectAllArabic(result.fieldErrors ?? {});
  });

  it("accepts matching passwords", () => {
    expect(validatePartnerApplyDraft(draftFor()).ok).toBe(true);
  });

  it("reports the mismatch even while a vehicle row is still incomplete", () => {
    // Vehicle rows are owned by validatePartnerVehicleRow, so an incomplete row
    // must not abort the draft and hide this error until the next submit.
    const result = validatePartnerApplyDraft(
      draftFor({
        confirmPassword: "different1",
        vehicles: [partnerVehicleDraftToWire({ name: "داسيا داستر", year: "", seats: "", pricePerDay: "", fuelType: "", transmission: "" })],
      }),
    );
    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(["confirmPassword"]);
    expectAllArabic(result.fieldErrors ?? {});
  });

  it("keeps the server body schema free of the confirmation field", () => {
    const result = validatePartnerApplyBody(completeCarRental);
    expect(result.ok).toBe(true);
    expect(result.data).not.toHaveProperty("confirmPassword");
  });
});

describe("partner application — Arabic, field-addressed messaging", () => {
  it("points the first-invalid field at the earliest field in visual order", () => {
    const result = validatePartnerApplyBody({ ...completeCarRental, email: "x", fleetSize: undefined });
    expect(result.firstInvalidField).toBe("fleetSize");
  });

  it("labels vehicle paths with their row number", () => {
    expect(partnerFieldLabel("vehicles.0.pricePerDay")).toContain("المركبة رقم 1");
    expect(partnerFieldLabel("vehicles.11.name")).toContain("المركبة رقم 12");
    expect(partnerFieldLabel("contactPerson")).toBe("اسم الشخص المسؤول");
    expect(partnerFieldLabel("agencyName")).toBe("اسم الوكالة");
  });

  it("builds a single Arabic API message naming the offending field", () => {
    const result = validatePartnerApplyBody({ ...completeCarRental, contactPerson: "" });
    const message = partnerFirstFieldMessage(result.fieldErrors ?? {});
    expect(message).toMatch(ARABIC);
    expect(message).toContain("الشخص المسؤول");
  });

  it("summarizes the number of fields to correct", () => {
    expect(partnerValidationSummary({})).toBe("");
    const single = partnerValidationSummary({ email: "البريد الإلكتروني مطلوب." });
    expect(single).toMatch(ARABIC);
    expect(single).toContain("البريد الإلكتروني");
    const many = partnerValidationSummary({ email: "أ", phone: "ب", city: "ج" });
    expect(many).toContain("3");
    expect(many).toMatch(ARABIC);
  });
});

/**
 * The applicant-facing contract is Arabic-only, and zod's default messages are
 * English. Every schema node therefore needs an explicit `error`; these pin that
 * down for the nodes that previously had none, so a future refactor cannot
 * silently reintroduce an English string in front of an applicant.
 */
describe("partner application — no raw zod defaults reach the applicant", () => {
  it("keeps every catalogue message Arabic and free of zod's English phrasing", () => {
    for (const [key, message] of Object.entries(PARTNER_APPLY_MESSAGES)) {
      expect(message, `PARTNER_APPLY_MESSAGES.${key} must be Arabic`).toMatch(ARABIC);
      for (const phrase of ENGLISH_ZOD_PHRASES) {
        expect(message, `PARTNER_APPLY_MESSAGES.${key} must not leak "${phrase}"`).not.toContain(
          phrase,
        );
      }
    }
  });

  it("never leaks the synthetic _form token into applicant-facing text", () => {
    expect(partnerFieldLabel("_form")).toMatch(ARABIC);
    expect(partnerFieldLabel("_form")).not.toContain("_form");
    const errors: PartnerFieldErrors = { _form: PARTNER_APPLY_MESSAGES.bodyInvalid };
    expect(partnerFirstFieldMessage(errors)).not.toContain("_form");
    expect(partnerValidationSummary(errors)).not.toContain("_form");
    expect(partnerValidationSummary(errors)).toMatch(ARABIC);
  });

  it("names the gallery rather than the logo when a gallery image is invalid", () => {
    const result = validatePartnerApplyBody({
      ...completeCarRental,
      gallery: [{ mimeType: "image/png", contentBase64: "" }],
    });
    expect(result.ok).toBe(false);
    const message = result.fieldErrors?.["gallery.0.contentBase64"] ?? "";
    expect(message).toMatch(ARABIC);
    expect(message).toContain("صور المعرض");
    expect(message).not.toContain("شعار الوكالة");
  });

  it("reports malformed image and vehicle containers in Arabic", () => {
    const bodies: unknown[] = [
      { ...completeCarRental, gallery: "not-an-array" },
      { ...completeCarRental, logo: "not-an-object" },
      { ...completeCarRental, vehicles: [null] },
      { ...completeCarRental, vehicles: "not-an-array" },
      { ...completeCarRental, description: 42 },
    ];
    for (const body of bodies) {
      const result = validatePartnerApplyBody(body);
      expect(result.ok, JSON.stringify(body)).toBe(false);
      expectAllArabic(result.fieldErrors ?? {});
    }
  });

  it("keeps a vehicle's fuel type and transmission messages on their own field", () => {
    const result = validatePartnerApplyBody({
      ...completeCarRental,
      vehicles: [{ name: "Renault Clio", pricePerDay: 250, fuelType: 12345, transmission: 99 }],
    });
    expect(result.ok).toBe(false);
    const fuel = result.fieldErrors?.["vehicles.0.fuelType"] ?? "";
    const transmission = result.fieldErrors?.["vehicles.0.transmission"] ?? "";
    expect(fuel).toContain("نوع الوقود");
    expect(transmission).toContain("ناقل الحركة");
    for (const message of [fuel, transmission]) {
      expect(message).toMatch(ARABIC);
      // Used to reuse the vehicle *name* message, pointing at the wrong input.
      expect(message).not.toContain("اسم/موديل المركبة");
    }
  });

  it("keeps an over-long description's length message distinct from its type message", () => {
    const tooLong = validatePartnerApplyBody({
      ...completeCarRental,
      description: "ط".repeat(2500),
    });
    expect(tooLong.fieldErrors?.description ?? "").toBe(PARTNER_APPLY_MESSAGES.descriptionLong);
    const wrongType = validatePartnerApplyBody({ ...completeCarRental, description: 42 });
    expect(wrongType.fieldErrors?.description ?? "").toBe(PARTNER_APPLY_MESSAGES.descriptionText);
  });
});

describe("partner application — image size caps", () => {
  /** base64 of `bytes` decoded bytes, so a body can be sized exactly. */
  const base64OfBytes = (bytes: number) =>
    Buffer.alloc(bytes, 0x41).toString("base64");

  const image = (bytes: number, fileName = "photo.jpg") => ({
    fileName,
    mimeType: "image/jpeg",
    contentBase64: base64OfBytes(bytes),
  });

  it("strips a data-URL prefix and counts decoded bytes, not base64 characters", () => {
    const raw = base64OfBytes(900);
    expect(safeBase64(`data:image/jpeg;base64,${raw}`)).toBe(raw);
    expect(safeBase64(raw)).toBe(raw);
    // 900 bytes is 1200 base64 characters; the cap must see the decoded size.
    expect(baseBytesLength(raw)).toBeLessThanOrEqual(900);
    expect(baseBytesLength(raw)).toBeGreaterThan(900 - 4);
  });

  it("subtracts base64 padding when counting decoded bytes", () => {
    expect(baseBytesLength("QQ==")).toBe(1);
    expect(baseBytesLength("QUI=")).toBe(2);
    expect(baseBytesLength("QUJD")).toBe(3);
  });

  it("rejects an over-cap logo as a 400-addressable field error, not a 500", () => {
    const result = validatePartnerApplyBody({
      ...completeCarRental,
      logo: image(MAX_IMAGE_BYTES + 1),
    });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(["logo.contentBase64"]);
    expect(result.fieldErrors?.["logo.contentBase64"]).toBe(
      PARTNER_APPLY_MESSAGES.logoTooLarge,
    );
    expectAllArabic(result.fieldErrors ?? {});
  });

  it("rejects an over-cap gallery image at its own index", () => {
    const result = validatePartnerApplyBody({
      ...completeCarRental,
      gallery: [image(1024, "ok-1.jpg"), image(MAX_IMAGE_BYTES + 1, "big-2.jpg")],
    });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(["gallery.1.contentBase64"]);
    expect(result.fieldErrors?.["gallery.1.contentBase64"]).toBe(
      PARTNER_APPLY_MESSAGES.galleryTooLarge,
    );
    expectAllArabic(result.fieldErrors ?? {});
  });

  it("names the gallery rather than the logo for an over-cap gallery image", () => {
    const result = validatePartnerApplyBody({
      ...completeCarRental,
      gallery: [image(MAX_IMAGE_BYTES + 1)],
    });
    const message = result.fieldErrors?.["gallery.0.contentBase64"] ?? "";
    expect(message).toContain("صور المعرض");
    expect(message).not.toContain("شعار الوكالة");
  });

  it("accepts an image sitting exactly on the cap and rejects one byte more", () => {
    const atCap = validatePartnerApplyBody({
      ...completeCarRental,
      logo: image(MAX_IMAGE_BYTES),
    });
    expect(atCap.ok).toBe(true);
    const overCap = validatePartnerApplyBody({
      ...completeCarRental,
      logo: image(MAX_IMAGE_BYTES + 1),
    });
    expect(overCap.ok).toBe(false);
  });

  it("keeps the cap off the draft schema's mandatory-field rules", () => {
    // The draft shares the image shape, so an over-cap staged image must fail
    // the draft too — with a message, not a crash.
    const result = validatePartnerApplyDraft({
      ...draftFor(),
      logo: image(MAX_IMAGE_BYTES + 1),
    });
    expect(result.ok).toBe(false);
    expectAllArabic(result.fieldErrors ?? {});
  });
});

describe("partner application — helpers", () => {
  it("turns blank numeric input into undefined so required rules can fire", () => {
    expect(toOptionalNumber("")).toBeUndefined();
    expect(toOptionalNumber("   ")).toBeUndefined();
    expect(toOptionalNumber(undefined)).toBeUndefined();
    expect(toOptionalNumber("12")).toBe(12);
    expect(Number.isNaN(toOptionalNumber("abc") as number)).toBe(true);
  });

  it("rejects short, long and malformed phone numbers", () => {
    expect(isValidPartnerPhone("+212612345678")).toBe(true);
    expect(isValidPartnerPhone("0612345678")).toBe(true);
    expect(isValidPartnerPhone("1")).toBe(false);
    expect(isValidPartnerPhone("212")).toBe(false);
    expect(isValidPartnerPhone("212612")).toBe(false);
    expect(isValidPartnerPhone("1234567890123456")).toBe(false);
  });
});

/**
 * Source-level guarantees that cannot be asserted from the schema alone: the
 * endpoint must reject before it inserts, and the form must render the
 * per-field messages next to the inputs.
 */
describe("partner application — endpoint and form wiring (audit)", () => {
  const root = resolve(import.meta.dirname, "..");
  const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

  it("validates the body before the transaction and returns per-field errors", () => {
    const route = read("server/_core/partnerApplication.ts");
    const validation = route.indexOf("validatePartnerApplyBody(body)");
    const insert = route.indexOf(".insert(partnerApplications)");
    expect(validation).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(validation).toBeLessThan(insert);
    expect(route).toContain('"invalid_input"');
    expect(route).toContain("partnerFirstFieldMessage(validation.fieldErrors)");
    // The response body carries the field -> Arabic message map.
    expect(route).toContain("...(fieldErrors ? { fieldErrors } : {})");
  });

  it("shares one schema between the browser form and the endpoint", () => {
    const route = read("server/_core/partnerApplication.ts");
    const form = read("client/src/pages/PartnerApply.tsx");
    expect(route).toContain('from "../../shared/partnerApplication"');
    expect(form).toContain('from "@shared/partnerApplication"');
    expect(route).toContain("validatePartnerApplyBody");
    expect(form).toContain("validatePartnerApplyDraft");
  });

  it("marks every invalid input and renders its message next to it", () => {
    const form = read("client/src/pages/PartnerApply.tsx");
    expect(form).toContain('"aria-invalid"');
    expect(form).toContain('"aria-describedby"');
    expect(form).toContain("<FieldError");
    expect(form).toContain('role="alert"');
    expect(form).toContain("inputErrorClass");
    expect(form).toContain("partnerValidationSummary");
    expect(form).toContain("setFocusField");
    // The browser must not submit while a mandatory field is missing.
    expect(form).toContain("if (!validation.ok || invalidCount > 0)");
    expect(form).toContain("return;");
  });

  it("keeps contact person and the fleet/property count mandatory in the markup", () => {
    const form = read("client/src/pages/PartnerApply.tsx");
    expect(form).toContain("الشخص المسؤول *");
    expect(form).toContain("حجم الأسطول — عدد السيارات *");
    expect(form).toContain("عدد العقارات المتاحة للكراء *");
    expect(form).not.toContain("الشخص المسؤول (اختياري)");
  });

  it("no longer reports raw zod defaults to the applicant", () => {
    const route = read("server/_core/partnerApplication.ts");
    // flatten().fieldErrors surfaced zod's English messages verbatim.
    expect(route).not.toContain("parsed.error.flatten()");
    expect(route).not.toContain("applyBodySchema");
  });

  it("enforces the per-image cap in the shared schema, not only after the INSERT", () => {
    const route = read("server/_core/partnerApplication.ts");
    // The base64 helpers live in shared/ so the schema and the upload path
    // cannot drift into disagreeing about what "too large" means.
    expect(route).toContain("baseBytesLength,");
    expect(route).toContain("safeBase64,");
    expect(route).not.toContain("function baseBytesLength");
    expect(route).not.toContain("function safeBase64");
    // The total-bytes 400 must name a field so the form has something to focus.
    expect(route).toContain("PARTNER_APPLY_MESSAGES.imagesTooLarge");
  });

  /**
   * Source-level only: there is no DOM test environment in this repo, so this
   * asserts the wiring exists rather than that it behaves. See the "no raw zod
   * defaults" block above for the same limitation.
   */
  it("wires both image dropzones into the per-field error chain", () => {
    const form = read("client/src/pages/PartnerApply.tsx");
    expect(form).toContain("const imageErrorsFor");
    expect(form).toContain("const clearImageErrors");
    expect(form).toContain("const fileFieldProps");
    // An id is what lets the summary's focus effect find the control.
    expect(form).toContain('fileFieldProps("logo"');
    expect(form).toContain('fileFieldProps("gallery"');
    expect(form).toContain('<FieldError fieldKey="logo"');
    expect(form).toContain('<FieldError fieldKey="gallery"');
    // An indexed gallery error belongs under its own thumbnail.
    expect(form).toContain("fieldKey={`gallery.${index}`}");
    expect(form).toContain("galleryErrors.byIndex.get(index)");
    // Re-picking clears the stale error.
    expect(form).toContain('clearImageErrors("logo")');
    expect(form).toContain('clearImageErrors("gallery")');
  });

  it("collapses an image error onto its dropzone for the focus effect", () => {
    const form = read("client/src/pages/PartnerApply.tsx");
    expect(form).toContain("const focusTargetFor");
    // PARTNER_APPLY_FIELD_ORDER has no logo/gallery, so without the collapse
    // the summary silently skipped focusing for an image-only rejection.
    expect(form).toContain("setFocusField(focusTargetFor(fieldErrors))");
    expect(form).toContain('key.startsWith("logo.")');
    expect(form).toContain('key.startsWith("gallery.")');
  });

  it("keeps the file inputs' sr-only class instead of the text-input border styling", () => {
    const form = read("client/src/pages/PartnerApply.tsx");
    // fieldProps() would clobber className with a border style meant for text
    // inputs, so the file inputs use a dedicated id/aria-only helper.
    expect(form).toContain('className="sr-only"');
    expect(form).toContain('"aria-describedby": message');
  });
});
