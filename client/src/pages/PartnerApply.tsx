import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  AlertCircle,
  Building2,
  Car,
  CheckCircle2,
  ChevronRight,
  ImagePlus,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/lib/seo";
import {
  AGENCY_NAME_MAX,
  CITY_MAX,
  CONTACT_PERSON_MAX,
  DESCRIPTION_MAX,
  MAX_GALLERY_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_TOTAL_IMAGES,
  MAX_VEHICLES,
  PARTNER_APPLY_FIELD_ORDER,
  PARTNER_PASSWORD_MIN,
  VEHICLE_FUEL_MAX,
  VEHICLE_NAME_MAX,
  VEHICLE_TRANSMISSION_MAX,
  isBlankVehicleDraft,
  partnerFieldLabel,
  partnerValidationSummary,
  partnerVehicleDraftToWire,
  toOptionalNumber,
  validatePartnerApplyDraft,
  validatePartnerVehicleRow,
  type PartnerFieldErrors,
  type PartnerVehicleDraft,
} from "@shared/partnerApplication";

type StagedImage = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  previewUrl: string;
};

type ApplyPayload = {
  type: "car_rental" | "real_estate";
  agencyName: string;
  city: string;
  contactPerson: string;
  phone: string;
  email: string;
  password: string;
  website?: string;
  description?: string;
  fleetSize?: number;
  propertyCount?: number;
  logo?: { fileName?: string; mimeType: string; contentBase64: string };
  gallery?: Array<{ fileName?: string; mimeType: string; contentBase64: string }>;
  vehicles?: Array<{
    name: string;
    year?: number;
    seats?: number;
    pricePerDay: number;
    fuelType?: string;
    transmission?: string;
  }>;
};

type VehicleDraft = PartnerVehicleDraft;

/** `vehicles.0.pricePerDay` -> the DOM id of the input it belongs to. */
const fieldId = (key: string) => `partner-field-${key.replace(/\./g, "-")}`;

/**
 * The control a validation key belongs to, for the error summary's focus.
 * Text inputs key 1:1 and follow the visual order, but an image error names the
 * offending node (`logo.contentBase64`, `gallery.1.contentBase64`) and has no
 * input of its own, so both collapse onto their dropzone — which is what the
 * focus effect actually looks up with `getElementById(fieldId(key))`.
 */
const focusTargetFor = (fieldErrors: PartnerFieldErrors): string | null => {
  const ordered = PARTNER_APPLY_FIELD_ORDER.find((field) => fieldErrors[field] !== undefined);
  if (ordered) return ordered;
  const keys = Object.keys(fieldErrors);
  if (keys.some((key) => key === "logo" || key.startsWith("logo."))) return "logo";
  if (keys.some((key) => key === "gallery" || key.startsWith("gallery."))) return "gallery";
  return null;
};

const emptyVehicle = (): VehicleDraft => ({
  name: "",
  year: "",
  seats: "",
  pricePerDay: "",
  fuelType: "",
  transmission: "",
});

function fileToStaged(file: File): Promise<StagedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      const meta = comma !== -1 ? result.slice(5, comma) : "";
      const mime = meta.split(";")[0] || file.type || "image/jpeg";
      const contentBase64 = comma !== -1 ? result.slice(comma + 1) : "";
      if (!contentBase64) {
        reject(new Error("تعذر قراءة الصورة."));
        return;
      }
      resolve({ fileName: file.name, mimeType: mime, contentBase64, previewUrl: result });
    };
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة."));
    reader.readAsDataURL(file);
  });
}

async function callApply(body: unknown): Promise<{ success: boolean; applicationId: number; status: string }> {
  const timeoutMs = 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch("/api/auth/partner/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("انتهت مهلة العملية — تحقق من اتصالك بالإنترنت وحاول مجدداً.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  let payload: { error?: string; reason?: string; fieldErrors?: PartnerFieldErrors } | null = null;
  try {
    payload = (await response.json()) as {
      error?: string;
      reason?: string;
      fieldErrors?: PartnerFieldErrors;
    };
  } catch {
    // non-JSON error body: fall back to the generic message below
  }
  if (!response.ok) {
    // A 400 from the intake endpoint carries per-field Arabic messages; hand
    // them back so the form can highlight the exact inputs.
    const error = new Error(payload?.error || "حدث خطأ غير متوقع. حاول مرة أخرى.") as Error & {
      fieldErrors?: PartnerFieldErrors;
    };
    if (payload?.reason === "invalid_input" && payload.fieldErrors) {
      error.fieldErrors = payload.fieldErrors;
    }
    throw error;
  }
  return payload as { success: boolean; applicationId: number; status: string };
}

const inputClass =
  "mt-2 w-full rounded-lg border p-3 font-normal focus:border-brand-panel focus:outline-none focus:ring-2 focus:ring-brand-panel/20";
const inputErrorClass = "border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-500/20";

/** Inline Arabic message rendered directly under the offending input. */
function FieldError({ fieldKey, message }: { fieldKey: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={`${fieldId(fieldKey)}-error`}
      role="alert"
      className="mt-1.5 flex items-start gap-1.5 text-xs font-bold leading-relaxed text-red-600"
    >
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export default function PartnerApply() {
  const [match, params] = useRoute("/become-partner/:type");
  const rawType = params?.type === "real-estate" ? "real_estate" : "car_rental";
  const isCar = rawType === "car_rental";

  const title = useMemo(
    () => (isCar ? "الانضمام كشريك — وكالة كراء السيارات" : "الانضمام كشريك — وكالة عقارية"),
    [isCar],
  );

  useSEO({
    title,
    description:
      "قدّم طلب انضمام كشريك في ALTUSplace: بيانات وكالتك، معلومات التواصل، وشعار وصور وكالتك. ستُراجع طلباتك ليصدر حساب شر كك بعد الموافقة.",
    path: match ? `/become-partner/${params?.type}` : "/become-partner",
    canonicalPath: match ? `/become-partner/${params?.type}` : "/become-partner",
  });

  const [agencyName, setAgencyName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [description, setDescription] = useState("");
  const [fleetSize, setFleetSize] = useState("");
  const [propertyCount, setPropertyCount] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [logo, setLogo] = useState<StagedImage | null>(null);
  const [gallery, setGallery] = useState<StagedImage[]>([]);
  const [vehicles, setVehicles] = useState<VehicleDraft[]>([]);
  const [errors, setErrors] = useState<PartnerFieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [focusField, setFocusField] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Send the eye to the first field that still has to be corrected.
  useEffect(() => {
    if (!focusField) return;
    const element = document.getElementById(fieldId(focusField));
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    if (element instanceof HTMLElement) element.focus({ preventScroll: true });
    setFocusField(null);
  }, [focusField]);

  const totalImageCount = (logo ? 1 : 0) + gallery.length;

  /** Clears a field's error as soon as the applicant edits it again. */
  const clearError = (...keys: string[]) => {
    setErrors((current) => {
      if (!keys.some((key) => current[key] !== undefined)) return current;
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
  };

  /**
   * Image problems arrive keyed by the offending node, so resolve them by
   * prefix. Three shapes matter: `logo` / `logo.contentBase64` and a bare
   * `gallery` name the control as a whole and land on its dropzone, while
   * `gallery.1.contentBase64` names one photo and belongs under that
   * thumbnail. Keeping them apart means a container-level error can never hide
   * behind a thumbnail that does not exist.
   */
  const imageErrorsFor = (prefix: string) => {
    const indexedKey = new RegExp(`^${prefix}\\.(\\d+)\\.`);
    let whole: string | undefined;
    const byIndex = new Map<number, string>();
    for (const [key, message] of Object.entries(errors)) {
      if (key !== prefix && !key.startsWith(`${prefix}.`)) continue;
      const match = indexedKey.exec(key);
      if (!match) {
        if (whole === undefined) whole = message;
        continue;
      }
      const index = Number(match[1]);
      if (!byIndex.has(index)) byIndex.set(index, message);
    }
    return { whole, byIndex };
  };

  /** Clears every error under an image control (`logo`, `logo.contentBase64`, `gallery.1.*`, ...). */
  const clearImageErrors = (prefix: string) => {
    setErrors((current) => {
      const kept = Object.fromEntries(
        Object.entries(current).filter(([key]) => key !== prefix && !key.startsWith(`${prefix}.`)),
      );
      return Object.keys(kept).length === Object.keys(current).length ? current : kept;
    });
  };

  /**
   * Both file inputs are visually replaced by a dropzone <label>, so
   * `fieldProps`' border styling does not apply and `className` has to stay
   * `sr-only` — only the accessibility wiring is reused. Supplying the id is
   * what lets the error summary's focus effect find the control at all: it
   * looks the target up with `getElementById(fieldId(key))`, which previously
   * returned null for both dropzones and silently did nothing.
   */
  const fileFieldProps = (key: string, message?: string) => ({
    id: fieldId(key),
    "aria-invalid": message ? (true as const) : undefined,
    "aria-describedby": message ? `${fieldId(key)}-error` : undefined,
  });

  const logoErrors = imageErrorsFor("logo");
  const galleryErrors = imageErrorsFor("gallery");

  const pickLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clearImageErrors("logo");
    if (!file.type.startsWith("image/")) {
      toast.error("يرجى اختيار ملف صورة صالح.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("حجم الصورة كبير جداً — الحد الأقصى 6 ميجابايت.");
      return;
    }
    try {
      setLogo(await fileToStaged(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر قراءة الصورة.");
    }
  };

  const pickGallery = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    clearImageErrors("gallery");
    if (gallery.length + files.length > MAX_GALLERY_IMAGES) {
      toast.error(`يمكن رفع ${MAX_GALLERY_IMAGES} صور كحد أقصى في المعرض.`);
      return;
    }
    if (totalImageCount + files.length > MAX_TOTAL_IMAGES) {
      toast.error(`يمكن رفع ${MAX_TOTAL_IMAGES} صور كحد أقصى (الشعار + المعرض).`);
      return;
    }
    try {
      const staged: StagedImage[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          toast.error("يرجى اختيار ملفات صور صالحة.");
          return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error("حجم صورة كبيرة جداً — الحد الأقصى 6 ميجابايت لكل صورة.");
          return;
        }
        staged.push(await fileToStaged(file));
      }
      setGallery((current) => [...current, ...staged]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر قراءة الصور.");
    }
  };

  const addVehicle = () => {
    setVehicles((current) =>
      current.length >= MAX_VEHICLES ? current : [...current, emptyVehicle()],
    );
  };
  const updateVehicle = (index: number, patch: Partial<VehicleDraft>) => {
    setVehicles((current) =>
      current.map((vehicle, i) => (i === index ? { ...vehicle, ...patch } : vehicle)),
    );
    clearError(...Object.keys(patch).map((key) => `vehicles.${index}.${key}`));
  };
  const removeVehicle = (index: number) => {
    setVehicles((current) => current.filter((_, i) => i !== index));
    setErrors((current) => {
      const next: PartnerFieldErrors = {};
      for (const [key, value] of Object.entries(current)) {
        if (!key.startsWith(`vehicles.${index}.`)) next[key] = value;
      }
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setServerError(null);

    // Rows the applicant actually started filling in. Unused rows never reach
    // the API, but a partially filled row is reported instead of being
    // silently discarded.
    const startedVehicles = isCar
      ? vehicles
          .map((vehicle, index) => ({ vehicle, index }))
          .filter(({ vehicle }) => !isBlankVehicleDraft(vehicle))
      : [];

    const wireVehicles = startedVehicles.map(({ vehicle }) => partnerVehicleDraftToWire(vehicle));

    const draft = {
      type: rawType,
      agencyName: agencyName.trim(),
      city: city.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim(),
      password,
      confirmPassword,
      website: website.trim(),
      description: description.trim(),
      fleetSize: toOptionalNumber(fleetSize),
      propertyCount: toOptionalNumber(propertyCount),
      logo: logo
        ? { fileName: logo.fileName, mimeType: logo.mimeType, contentBase64: logo.contentBase64 }
        : undefined,
      gallery: gallery.map((image) => ({
        fileName: image.fileName,
        mimeType: image.mimeType,
        contentBase64: image.contentBase64,
      })),
      vehicles: wireVehicles,
    };

    const validation = validatePartnerApplyDraft(draft);
    // Vehicle rows are validated against their original form index, so the
    // message always lands on the row the applicant can see.
    const vehicleErrors = startedVehicles.reduce<PartnerFieldErrors>(
      (accumulator, { vehicle, index }) => ({
        ...accumulator,
        ...validatePartnerVehicleRow(index, partnerVehicleDraftToWire(vehicle)),
      }),
      {},
    );

    const invalidCount = Object.keys(vehicleErrors).length;
    if (!validation.ok || invalidCount > 0) {
      const fieldErrors: PartnerFieldErrors = { ...vehicleErrors, ...(validation.fieldErrors ?? {}) };
      setErrors(fieldErrors);
      setFocusField(validation.firstInvalidField ?? Object.keys(vehicleErrors)[0] ?? null);
      return;
    }

    const payload: ApplyPayload = {
      type: rawType,
      agencyName: draft.agencyName,
      city: draft.city,
      contactPerson: draft.contactPerson,
      phone: draft.phone,
      email: draft.email.toLowerCase(),
      password,
      website: draft.website || undefined,
      description: draft.description || undefined,
      fleetSize: isCar ? draft.fleetSize : undefined,
      propertyCount: !isCar ? draft.propertyCount : undefined,
      logo: draft.logo,
      gallery: draft.gallery,
      vehicles: wireVehicles.length
        ? wireVehicles.map((vehicle) => ({
            name: String(vehicle.name),
            pricePerDay: Math.round(Number(vehicle.pricePerDay)),
            year: vehicle.year === undefined ? undefined : Number(vehicle.year),
            seats: vehicle.seats === undefined ? undefined : Number(vehicle.seats),
            fuelType: (vehicle.fuelType as string | undefined) || undefined,
            transmission: (vehicle.transmission as string | undefined) || undefined,
          }))
        : undefined,
    };

    setSubmitting(true);
    try {
      await callApply(payload);
      setErrors({});
      setSubmitted(true);
    } catch (error) {
      const fieldErrors = (error as { fieldErrors?: PartnerFieldErrors } | null)?.fieldErrors;
      if (fieldErrors && Object.keys(fieldErrors).length > 0) {
        // The endpoint rejected the payload — mirror its per-field messages
        // onto the inputs instead of only showing a toast.
        setErrors(fieldErrors);
        setFocusField(focusTargetFor(fieldErrors));
      }
      const message =
        error instanceof Error ? error.message : "حدث خطأ غير متوقع. حاول مرة أخرى.";
      setServerError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-[#f4f7f6] px-4 py-16 text-slate-900">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <h1 className="mt-5 text-2xl font-black text-ink-primary">تم استلام طلبك بنجاح</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            شكراً لاهتمامك بالانضمام إلى ALTUSplace. سيراجع فريقنا طلبك وسيصدر لك حساب شريك فور
            الموافقة، وسيمكنك بعدها من تسجيل الدخول بالبريد الإلكتروني وكلمة المرور اللذين أدخلتهما.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/">
              <Button className="w-full bg-brand-panel text-brand-panel-ink hover:bg-brand-panel-alt">العودة إلى الرئيسية</Button>
            </Link>
            <Link href="/partner">
              <Button variant="outline" className="w-full">فضاء الشركاء — تسجيل الدخول</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const errorKeys = Object.keys(errors);
  const validationSummary = partnerValidationSummary(errors);

  /** Shared a11y + styling props so every invalid input is marked the same way. */
  const fieldProps = (key: string, extraClass = "") => {
    const message = errors[key];
    return {
      id: fieldId(key),
      className: `${inputClass} ${message ? inputErrorClass : extraClass}`.trim(),
      "aria-invalid": message ? (true as const) : undefined,
      "aria-describedby": message ? `${fieldId(key)}-error` : undefined,
    };
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f7f6] px-4 py-10 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/become-partner" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-ink-primary">
          <ChevronRight className="h-4 w-4" />
          كل مسارات الانضمام
        </Link>

        <section className="mt-4 rounded-2xl bg-brand-panel p-6 text-brand-panel-ink">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 text-[#f5b85b]">
            {isCar ? <Car className="h-6 w-6" /> : <Building2 className="h-6 w-6" />}
          </span>
          <h1 className="mt-4 text-2xl font-black sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">
            قدّم طلب انضمام مع بيانات وكالتك ومعلومات التواصل وصورها. سيُراجع فريقنا طلبك ويصدر حساب
            الشريك بعد الموافقة.
          </p>
        </section>

        {errorKeys.length > 0 && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm"
          >
            <p className="flex items-center gap-2 font-black text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {validationSummary}
            </p>
            <ul className="mt-3 space-y-1.5">
              {errorKeys.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setFocusField(key)}
                    className="text-end text-xs font-bold text-red-700 underline decoration-red-300 underline-offset-4 hover:decoration-red-600"
                  >
                    {partnerFieldLabel(key)}: {errors[key]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {serverError && Object.keys(errors).length === 0 && (
          <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {serverError}
          </p>
        )}

        <form onSubmit={submit} noValidate className="mt-6 space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-black text-ink-primary">بيانات الوكالة</h2>
            <p className="mt-1 text-xs text-slate-500">الحقول المعلَّمة بـ * إلزامية.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="text-sm font-semibold sm:col-span-2">
                <label htmlFor={fieldId("agencyName")}>اسم الوكالة *</label>
                <input
                  {...fieldProps("agencyName")}
                  value={agencyName}
                  onChange={(event) => { setAgencyName(event.target.value); clearError("agencyName"); }}
                  maxLength={AGENCY_NAME_MAX}
                  placeholder="مثال: وكالة الأطلس للكراء"
                />
                <FieldError fieldKey="agencyName" message={errors.agencyName} />
              </div>
              <div className="text-sm font-semibold">
                <label htmlFor={fieldId("city")}>المدينة *</label>
                <input
                  {...fieldProps("city")}
                  value={city}
                  onChange={(event) => { setCity(event.target.value); clearError("city"); }}
                  maxLength={CITY_MAX}
                  placeholder="مراكش"
                />
                <FieldError fieldKey="city" message={errors.city} />
              </div>
              <div className="text-sm font-semibold">
                <label htmlFor={fieldId("contactPerson")}>الشخص المسؤول *</label>
                <input
                  {...fieldProps("contactPerson")}
                  value={contactPerson}
                  onChange={(event) => { setContactPerson(event.target.value); clearError("contactPerson"); }}
                  maxLength={CONTACT_PERSON_MAX}
                  placeholder="الاسم الكامل"
                />
                <FieldError fieldKey="contactPerson" message={errors.contactPerson} />
              </div>
              {isCar ? (
                <div className="text-sm font-semibold">
                  <label htmlFor={fieldId("fleetSize")}>حجم الأسطول — عدد السيارات *</label>
                  <input
                    {...fieldProps("fleetSize")}
                    type="number"
                    min="1"
                    step="1"
                    value={fleetSize}
                    onChange={(event) => { setFleetSize(event.target.value); clearError("fleetSize"); }}
                    placeholder="مثال: 10"
                  />
                  <FieldError fieldKey="fleetSize" message={errors.fleetSize} />
                </div>
              ) : (
                <div className="text-sm font-semibold">
                  <label htmlFor={fieldId("propertyCount")}>عدد العقارات المتاحة للكراء *</label>
                  <input
                    {...fieldProps("propertyCount")}
                    type="number"
                    min="1"
                    step="1"
                    value={propertyCount}
                    onChange={(event) => { setPropertyCount(event.target.value); clearError("propertyCount"); }}
                    placeholder="مثال: 15"
                  />
                  <FieldError fieldKey="propertyCount" message={errors.propertyCount} />
                </div>
              )}
              {isCar && Number(fleetSize) > 0 && vehicles.every(isBlankVehicleDraft) ? (
                <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 sm:col-span-2">
                  أُدخل حجم الأسطول ({fleetSize}) دون تسجيل تفاصيل المركبات في قسم «مركبات الأسطول» أعلاه — لن تُنشر أي سيارات تلقائياً بعد الموافقة إلا إذا أدرجت مركباتك.
                </p>
              ) : null}
              <div className="text-sm font-semibold">
                <label htmlFor={fieldId("website")}>الموقع الإلكتروني (اختياري)</label>
                <input
                  {...fieldProps("website")}
                  type="url"
                  dir="ltr"
                  value={website}
                  onChange={(event) => { setWebsite(event.target.value); clearError("website"); }}
                  placeholder="https://example.com"
                />
                <FieldError fieldKey="website" message={errors.website} />
              </div>
              <div className="text-sm font-semibold sm:col-span-2">
                <label htmlFor={fieldId("description")}>نبذة عن الوكالة (اختياري)</label>
                <textarea
                  {...fieldProps("description", "min-h-24")}
                  value={description}
                  onChange={(event) => { setDescription(event.target.value); clearError("description"); }}
                  maxLength={DESCRIPTION_MAX}
                  placeholder="تخصصكم، الخدمات، عدد الفروع..."
                />
                <FieldError fieldKey="description" message={errors.description} />
              </div>
            </div>
          </section>

          {isCar && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black text-ink-primary">مركبات الأسطول (اختياري)</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    أدرج سياراتك التي ستُنشر تلقائياً في الموقع فور اعتماد طلب الشراكة — اسم المركبة،
                    السنة، المقاعد، والسعر اليومي بالدرهم.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addVehicle}
                  disabled={vehicles.length >= MAX_VEHICLES}
                >
                  <Plus className="ms-1 h-4 w-4" />
                  إضافة مركبة
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                {vehicles.length === 0 && (
                  <p className="rounded-lg bg-slate-50 p-3 text-xs text-ink-secondary">
                    لم تُضف أي مركبات بعد — يمكن للوكالة إضافة مركباتها لاحقاً من فضاء الشريك بعد
                    الموافقة.
                  </p>
                )}
                {vehicles.map((vehicle, index) => (
                  <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-500">مركبة {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeVehicle(index)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-700"
                        aria-label={`حذف المركبة ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        حذف
                      </button>
                    </div>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="text-sm font-semibold sm:col-span-2 lg:col-span-3">
                        <label htmlFor={fieldId(`vehicles.${index}.name`)}>الاسم / الموديل *</label>
                        <input
                          {...fieldProps(`vehicles.${index}.name`)}
                          value={vehicle.name}
                          onChange={(event) => updateVehicle(index, { name: event.target.value })}
                          placeholder="مثال: داسيا داستر 2022"
                          maxLength={VEHICLE_NAME_MAX}
                        />
                        <FieldError
                          fieldKey={`vehicles.${index}.name`}
                          message={errors[`vehicles.${index}.name`]}
                        />
                      </div>
                      <div className="text-sm font-semibold">
                        <label htmlFor={fieldId(`vehicles.${index}.year`)}>سنة الصنع</label>
                        <input
                          {...fieldProps(`vehicles.${index}.year`)}
                          type="number"
                          min="1900"
                          max="2100"
                          step="1"
                          value={vehicle.year}
                          onChange={(event) => updateVehicle(index, { year: event.target.value })}
                          placeholder="مثال: 2022"
                        />
                        <FieldError
                          fieldKey={`vehicles.${index}.year`}
                          message={errors[`vehicles.${index}.year`]}
                        />
                      </div>
                      <div className="text-sm font-semibold">
                        <label htmlFor={fieldId(`vehicles.${index}.seats`)}>عدد المقاعد</label>
                        <input
                          {...fieldProps(`vehicles.${index}.seats`)}
                          type="number"
                          min="1"
                          max="50"
                          step="1"
                          value={vehicle.seats}
                          onChange={(event) => updateVehicle(index, { seats: event.target.value })}
                          placeholder="مثال: 5"
                        />
                        <FieldError
                          fieldKey={`vehicles.${index}.seats`}
                          message={errors[`vehicles.${index}.seats`]}
                        />
                      </div>
                      <div className="text-sm font-semibold">
                        <label htmlFor={fieldId(`vehicles.${index}.pricePerDay`)}>
                          السعر اليومي (درهم) *
                        </label>
                        <input
                          {...fieldProps(`vehicles.${index}.pricePerDay`)}
                          type="number"
                          min="1"
                          step="1"
                          value={vehicle.pricePerDay}
                          onChange={(event) =>
                            updateVehicle(index, { pricePerDay: event.target.value })
                          }
                          placeholder="مثال: 350"
                        />
                        <FieldError
                          fieldKey={`vehicles.${index}.pricePerDay`}
                          message={errors[`vehicles.${index}.pricePerDay`]}
                        />
                      </div>
                      <div className="text-sm font-semibold">
                        <label htmlFor={fieldId(`vehicles.${index}.fuelType`)}>نوع الوقود</label>
                        <input
                          {...fieldProps(`vehicles.${index}.fuelType`)}
                          value={vehicle.fuelType}
                          onChange={(event) =>
                            updateVehicle(index, { fuelType: event.target.value })
                          }
                          placeholder="ديزل"
                          maxLength={VEHICLE_FUEL_MAX}
                        />
                        <FieldError
                          fieldKey={`vehicles.${index}.fuelType`}
                          message={errors[`vehicles.${index}.fuelType`]}
                        />
                      </div>
                      <div className="text-sm font-semibold">
                        <label htmlFor={fieldId(`vehicles.${index}.transmission`)}>
                          ناقل الحركة
                        </label>
                        <input
                          {...fieldProps(`vehicles.${index}.transmission`)}
                          value={vehicle.transmission}
                          onChange={(event) =>
                            updateVehicle(index, { transmission: event.target.value })
                          }
                          placeholder="أوتوماتيك"
                          maxLength={VEHICLE_TRANSMISSION_MAX}
                        />
                        <FieldError
                          fieldKey={`vehicles.${index}.transmission`}
                          message={errors[`vehicles.${index}.transmission`]}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-black text-ink-primary">معلومات التواصل والحساب</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="text-sm font-semibold">
                <label htmlFor={fieldId("phone")}>رقم الهاتف (واتساب) *</label>
                <input
                  {...fieldProps("phone")}
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(event) => { setPhone(event.target.value); clearError("phone"); }}
                  placeholder="+2126XXXXXXXX"
                />
                <FieldError fieldKey="phone" message={errors.phone} />
              </div>
              <div className="text-sm font-semibold">
                <label htmlFor={fieldId("email")}>البريد الإلكتروني *</label>
                <input
                  {...fieldProps("email")}
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); clearError("email"); }}
                  placeholder="you@example.com"
                />
                <FieldError fieldKey="email" message={errors.email} />
              </div>
              <div className="text-sm font-semibold">
                <label htmlFor={fieldId("password")}>
                  كلمة المرور ({PARTNER_PASSWORD_MIN} أحرف على الأقل) *
                </label>
                <input
                  {...fieldProps("password")}
                  type="password"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); clearError("password", "confirmPassword"); }}
                  autoComplete="new-password"
                />
                <FieldError fieldKey="password" message={errors.password} />
              </div>
              <div className="text-sm font-semibold">
                <label htmlFor={fieldId("confirmPassword")}>تأكيد كلمة المرور *</label>
                <input
                  {...fieldProps("confirmPassword")}
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => { setConfirmPassword(event.target.value); clearError("confirmPassword"); }}
                  autoComplete="new-password"
                />
                <FieldError fieldKey="confirmPassword" message={errors.confirmPassword} />
              </div>
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ستستخدم هذه البيانات لتسجيل الدخول إلى فضاء الشركاء فور موافقة فريقنا على طلبك.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-black text-ink-primary">صور الوكالة</h2>
            <p className="mt-1 text-xs text-slate-500">
              الشعار اختياري، ويمكن رفع حتى {MAX_GALLERY_IMAGES} صور إضافية للوكالة أو الأسطول (كل صورة حتى 6 ميجابايت).
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {/* The FieldError sits outside the <label> on purpose: nested inside
                  it, the message becomes part of the label's text and clicking it
                  would re-open the file dialog. */}
              <div className="flex flex-col">
                <label className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:border-brand-panel">
                  {logo ? (
                    <img src={logo.previewUrl} alt="شعار الوكالة" className="max-h-24 rounded-lg object-contain" />
                  ) : (
                    <ImagePlus className="h-6 w-6 text-ink-secondary" />
                  )}
                  <span className="text-xs font-bold text-slate-600">{logo ? "تغيير الشعار" : "رفع شعار الوكالة (اختياري)"}</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={pickLogo} {...fileFieldProps("logo", logoErrors.whole)} />
                  {logo && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogo(null);
                        clearImageErrors("logo");
                      }}
                      className="absolute left-2 top-2 rounded-full bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                      aria-label="إزالة الشعار"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </label>
                <FieldError fieldKey="logo" message={logoErrors.whole} />
              </div>

              <div className="flex flex-col">
                <label className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:border-brand-panel">
                  <ImagePlus className="h-6 w-6 text-ink-secondary" />
                  <span className="text-xs font-bold text-slate-600">رفع صور المعرض ({gallery.length}/{MAX_GALLERY_IMAGES})</span>
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={pickGallery} {...fileFieldProps("gallery", galleryErrors.whole)} />
                </label>
                <FieldError fieldKey="gallery" message={galleryErrors.whole} />
              </div>
            </div>

            {gallery.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {gallery.map((image, index) => (
                  <div key={`${image.fileName}-${index}`} className="relative">
                    <img src={image.previewUrl} alt={`صورة معرض ${index + 1}`} className="h-24 w-full rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setGallery((current) => current.filter((_, itemIndex) => itemIndex !== index));
                        clearImageErrors("gallery");
                      }}
                      className="absolute right-1 top-1 rounded-full bg-red-50 p-1 text-red-600 hover:bg-red-100"
                      aria-label="إزالة الصورة"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <FieldError
                      fieldKey={`gallery.${index}`}
                      message={galleryErrors.byIndex.get(index)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {serverError && Object.keys(errors).length > 0 && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
              {serverError}
            </p>
          )}

          <Button type="submit" disabled={submitting} className="w-full bg-brand-panel py-4 text-base font-black text-brand-panel-ink hover:bg-brand-panel-alt disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? (
              <>
                <Loader2 className="ms-2 h-5 w-5 animate-spin" />
                جارٍ إرسال الطلب...
              </>
            ) : (
              "إرسال طلب الانضمام"
            )}
          </Button>
          <p className="text-center text-xs text-slate-500">
            بإرسالك الطلب فإنك توافق على مراجعة فريق ALTUSplace لبياناتك قبل إصدار حساب الشريك.
          </p>
        </form>
      </div>
    </div>
  );
}