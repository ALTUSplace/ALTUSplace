import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import {
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

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 4;
const MAX_TOTAL_IMAGES = 5; // logo + gallery
const MAX_VEHICLES = 20;

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
  phone: string;
  email: string;
  password: string;
  website?: string;
  contactPerson?: string;
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

type VehicleDraft = {
  name: string;
  year: string;
  seats: string;
  pricePerDay: string;
  fuelType: string;
  transmission: string;
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

async function callApply<T>(body: unknown): Promise<T> {
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
  let payload: { error?: string; reason?: string } | null = null;
  try {
    payload = (await response.json()) as { error?: string; reason?: string };
  } catch {
    // non-JSON error body: fall back to the generic message below
  }
  if (!response.ok) {
    throw new Error(payload?.error || "حدث خطأ غير متوقع. حاول مرة أخرى.");
  }
  return payload as T;
}

const inputClass =
  "mt-2 w-full rounded-lg border p-3 font-normal focus:border-brand-panel focus:outline-none focus:ring-2 focus:ring-brand-panel/20";

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
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const totalImageCount = (logo ? 1 : 0) + gallery.length;

  const pickLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
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
  };
  const removeVehicle = (index: number) => {
    setVehicles((current) => current.filter((_, i) => i !== index));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setFieldError(null);

    const trimmedName = agencyName.trim();
    if (trimmedName.length < 2) return setFieldError("أدخل اسم الوكالة (حرفان على الأقل).");
    if (!city.trim()) return setFieldError("أدخل المدينة.");
    if (!phone.trim()) return setFieldError("أدخل رقم الهاتف بالصيغة الدولية (مثال: +2126...).");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setFieldError("أدخل بريداً إلكترونياً صالحاً.");
    if (password.length < 8) return setFieldError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
    if (password !== confirmPassword) return setFieldError("كلمتا المرور غير متطابقتين.");
    if (website.trim() && !/^https?:\/\/[^\s]+$/.test(website.trim())) {
      return setFieldError("رابط الموقع يجب أن يبدأ بـ http:// أو https:// (أو اتركه فارغاً).");
    }
    if (isCar && fleetSize.trim() && (!Number.isInteger(Number(fleetSize)) || Number(fleetSize) < 0)) {
      return setFieldError("أدخل عدد سيارات الأسطول كرقم صحيح موجب.");
    }
    if (!isCar && propertyCount.trim() && (!Number.isInteger(Number(propertyCount)) || Number(propertyCount) < 0)) {
      return setFieldError("أدخل عدد العقارات كرقم صحيح موجب.");
    }

    const filledVehicles = isCar
      ? vehicles.filter((v) => v.name.trim() || v.pricePerDay.trim())
      : [];
    for (const v of filledVehicles) {
      if (!v.name.trim()) return setFieldError("أدخل اسم/موديل كل مركبة مضافة في قائمة المركبات.");
      if (!v.pricePerDay.trim() || !Number.isInteger(Number(v.pricePerDay)) || Number(v.pricePerDay) < 1) {
        return setFieldError("السعر اليومي لكل مركبة يجب أن يكون رقماً صحيحاً أكبر من صفر (درهم).");
      }
      if (v.year.trim() && (!Number.isInteger(Number(v.year)) || Number(v.year) < 1900 || Number(v.year) > 2100)) {
        return setFieldError("سنة الصنع يجب أن تكون بين 1900 و 2100.");
      }
      if (v.seats.trim() && (!Number.isInteger(Number(v.seats)) || Number(v.seats) < 1 || Number(v.seats) > 50)) {
        return setFieldError("عدد المقاعد يجب أن يكون بين 1 و 50.");
      }
    }

    const payload: ApplyPayload = {
      type: rawType,
      agencyName: trimmedName,
      city: city.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      password,
      website: website.trim() || undefined,
      contactPerson: contactPerson.trim() || undefined,
      description: description.trim() || undefined,
      fleetSize: isCar && fleetSize.trim() ? Number(fleetSize) : undefined,
      propertyCount: !isCar && propertyCount.trim() ? Number(propertyCount) : undefined,
      logo: logo
        ? { fileName: logo.fileName, mimeType: logo.mimeType, contentBase64: logo.contentBase64 }
        : undefined,
      gallery: gallery.map((image) => ({
        fileName: image.fileName,
        mimeType: image.mimeType,
        contentBase64: image.contentBase64,
      })),
      vehicles:
        isCar && filledVehicles.length
          ? filledVehicles.map((v) => ({
              name: v.name.trim(),
              pricePerDay: Math.round(Number(v.pricePerDay)),
              year: v.year.trim() ? Number(v.year) : undefined,
              seats: v.seats.trim() ? Number(v.seats) : undefined,
              fuelType: v.fuelType.trim() || undefined,
              transmission: v.transmission.trim() || undefined,
            }))
          : undefined,
    };

    setSubmitting(true);
    try {
      await callApply<{
        success: boolean;
        applicationId: number;
        status: string;
      }>(payload);
      setSubmitted(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حدث خطأ غير متوقع. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main dir="rtl" className="grid min-h-screen place-items-center bg-[#f4f7f6] px-4 py-16 text-slate-900">
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
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#f4f7f6] px-4 py-10 text-slate-900 sm:px-6 lg:px-10">
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

        <form onSubmit={submit} className="mt-6 space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-black text-ink-primary">بيانات الوكالة</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold sm:col-span-2">
                اسم الوكالة *
                <input className={inputClass} value={agencyName} onChange={(event) => setAgencyName(event.target.value)} placeholder="مثال: وكالة الأطلس للكراء" />
              </label>
              <label className="text-sm font-semibold">
                المدينة *
                <input className={inputClass} value={city} onChange={(event) => setCity(event.target.value)} placeholder="مراكش" />
              </label>
              <label className="text-sm font-semibold">
                الشخص المسؤول (اختياري)
                <input className={inputClass} value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} placeholder="الاسم الكامل" />
              </label>
              {isCar ? (
                <label className="text-sm font-semibold">
                  حجم الأسطول — عدد السيارات
                  <input className={inputClass} type="number" min="0" value={fleetSize} onChange={(event) => setFleetSize(event.target.value)} placeholder="مثال: 10" />
                </label>
              ) : (
                <label className="text-sm font-semibold">
                  عدد العقارات المتاحة للكراء
                  <input className={inputClass} type="number" min="0" value={propertyCount} onChange={(event) => setPropertyCount(event.target.value)} placeholder="مثال: 15" />
                </label>
              )}
              {isCar && Number(fleetSize) > 0 && vehicles.filter((v) => v.name.trim() || v.pricePerDay.trim()).length === 0 ? (
                <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 sm:col-span-2">
                  أُدخل حجم الأسطول ({fleetSize}) دون تسجيل تفاصيل المركبات في قسم «مركبات الأسطول» أعلاه — لن تُنشر أي سيارات تلقائياً بعد الموافقة إلا إذا أدرجت مركباتك.
                </p>
              ) : null}
              <label className="text-sm font-semibold">
                الموقع الإلكتروني (اختياري)
                <input className={inputClass} type="url" dir="ltr" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" />
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                نبذة عن الوكالة (اختياري)
                <textarea className={`${inputClass} min-h-24`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder="تخصصكم، الخدمات، عدد الفروع..." />
              </label>
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
                  <Plus className="ml-1 h-4 w-4" />
                  إضافة مركبة
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                {vehicles.length === 0 && (
                  <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-400">
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
                      <label className="text-sm font-semibold sm:col-span-2 lg:col-span-3">
                        الاسم / الموديل *
                        <input
                          className={inputClass}
                          value={vehicle.name}
                          onChange={(event) => updateVehicle(index, { name: event.target.value })}
                          placeholder="مثال: داسيا داستر 2022"
                          maxLength={120}
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        سنة الصنع
                        <input
                          className={inputClass}
                          type="number"
                          min="1900"
                          max="2100"
                          value={vehicle.year}
                          onChange={(event) => updateVehicle(index, { year: event.target.value })}
                          placeholder="مثال: 2022"
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        عدد المقاعد
                        <input
                          className={inputClass}
                          type="number"
                          min="1"
                          max="50"
                          value={vehicle.seats}
                          onChange={(event) => updateVehicle(index, { seats: event.target.value })}
                          placeholder="مثال: 5"
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        السعر اليومي (درهم) *
                        <input
                          className={inputClass}
                          type="number"
                          min="1"
                          value={vehicle.pricePerDay}
                          onChange={(event) =>
                            updateVehicle(index, { pricePerDay: event.target.value })
                          }
                          placeholder="مثال: 350"
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        نوع الوقود
                        <input
                          className={inputClass}
                          value={vehicle.fuelType}
                          onChange={(event) =>
                            updateVehicle(index, { fuelType: event.target.value })
                          }
                          placeholder="ديزل"
                          maxLength={32}
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        ناقل الحركة
                        <input
                          className={inputClass}
                          value={vehicle.transmission}
                          onChange={(event) =>
                            updateVehicle(index, { transmission: event.target.value })
                          }
                          placeholder="أوتوماتيك"
                          maxLength={32}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-black text-ink-primary">معلومات التواصل والحساب</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                رقم الهاتف (واتساب) *
                <input className={inputClass} type="tel" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+2126XXXXXXXX" />
              </label>
              <label className="text-sm font-semibold">
                البريد الإلكتروني *
                <input className={inputClass} type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
              </label>
              <label className="text-sm font-semibold">
                كلمة المرور (8 أحرف على الأقل) *
                <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
              </label>
              <label className="text-sm font-semibold">
                تأكيد كلمة المرور *
                <input className={inputClass} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
              </label>
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
              <label className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:border-brand-panel">
                {logo ? (
                  <img src={logo.previewUrl} alt="شعار الوكالة" className="max-h-24 rounded-lg object-contain" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-slate-400" />
                )}
                <span className="text-xs font-bold text-slate-600">{logo ? "تغيير الشعار" : "رفع شعار الوكالة (اختياري)"}</span>
                <input type="file" accept="image/*" className="sr-only" onChange={pickLogo} />
                {logo && (
                  <button
                    type="button"
                    onClick={() => setLogo(null)}
                    className="absolute left-2 top-2 rounded-full bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                    aria-label="إزالة الشعار"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </label>

              <label className="relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:border-brand-panel">
                <ImagePlus className="h-6 w-6 text-slate-400" />
                <span className="text-xs font-bold text-slate-600">رفع صور المعرض ({gallery.length}/{MAX_GALLERY_IMAGES})</span>
                <input type="file" accept="image/*" multiple className="sr-only" onChange={pickGallery} />
              </label>
            </div>

            {gallery.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {gallery.map((image, index) => (
                  <div key={`${image.fileName}-${index}`} className="relative">
                    <img src={image.previewUrl} alt={`صورة معرض ${index + 1}`} className="h-24 w-full rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => setGallery((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      className="absolute right-1 top-1 rounded-full bg-red-50 p-1 text-red-600 hover:bg-red-100"
                      aria-label="إزالة الصورة"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {fieldError && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{fieldError}</p>
          )}

          <Button type="submit" disabled={submitting} className="w-full bg-brand-panel py-4 text-base font-black text-brand-panel-ink hover:bg-brand-panel-alt disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? (
              <>
                <Loader2 className="ml-2 h-5 w-5 animate-spin" />
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
    </main>
  );
}