import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Building2, ImagePlus, Loader2, Save, ShieldCheck, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const initialForm = {
  agencyName: "",
  agencyPhone: "",
  agencyEmail: "",
  agencyAddress: "",
  agencyWebsite: "",
  agencyLatitude: "",
  agencyLongitude: "",
  agencyHours: "",
  commercialRegister: "",
  whatsappPhone: "",
};

type AgencyForm = typeof initialForm;

type LogoMime = "image/jpeg" | "image/png" | "image/webp";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("تعذر قراءة ملف الشعار."));
    reader.readAsDataURL(file);
  });
}

export default function AgencySettings() {
  const { user, loading: authLoading } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const settingsQuery = trpc.agency.settings.useQuery(undefined, { enabled: !!user });
  const updateSettings = trpc.agency.updateSettings.useMutation({
    onSuccess: async () => {
      await settingsQuery.refetch();
      toast.success("تم حفظ إعدادات الوكالة بنجاح.");
    },
    onError: (error) => toast.error(error.message),
  });
  const uploadLogo = trpc.storage.uploadAgencyLogo.useMutation({
    onSuccess: async () => {
      await settingsQuery.refetch();
      toast.success("تم تحديث شعار الوكالة.");
    },
    onError: (error) => toast.error(error.message),
  });
  const [form, setForm] = useState<AgencyForm>(initialForm);

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    setForm({
      agencyName: data.agencyName ?? "",
      agencyPhone: data.agencyPhone ?? "",
      agencyEmail: data.agencyEmail ?? "",
      agencyAddress: data.agencyAddress ?? "",
      agencyWebsite: data.agencyWebsite ?? "",
      agencyLatitude: data.agencyLatitude ?? "",
      agencyLongitude: data.agencyLongitude ?? "",
      agencyHours: data.agencyHours ?? "",
      commercialRegister: data.commercialRegister ?? "",
      whatsappPhone: data.whatsappPhone ?? "",
    });
  }, [settingsQuery.data]);

  if (authLoading || (user && settingsQuery.isLoading)) {
    return <div className="container grid min-h-[50vh] place-items-center" dir="rtl">جاري تحميل إعدادات الوكالة...</div>;
  }
  if (!user) {
    return <div className="container grid min-h-[50vh] place-items-center p-6 text-center" dir="rtl"><p>يرجى تسجيل الدخول للوصول إلى إعدادات الوكالة.</p></div>;
  }
  if (user.role !== "owner" && user.role !== "admin") {
    return <div className="container grid min-h-[50vh] place-items-center p-6 text-center" dir="rtl"><p>هذه الصفحة مخصصة لأصحاب الوكالات.</p></div>;
  }

  const updateField = (field: keyof AgencyForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    updateSettings.mutate(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim() || null])) as AgencyForm);
  };
  const handleLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type as LogoMime)) {
      toast.error("اختر صورة JPG أو PNG أو WebP.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("يجب ألا يتجاوز حجم الشعار 3 ميجابايت.");
      return;
    }
    try {
      uploadLogo.mutate({ fileName: file.name, mimeType: file.type as LogoMime, contentBase64: await fileToBase64(file) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز الشعار.");
    }
  };

  return <div className="container max-w-4xl space-y-6 py-6 md:py-10" dir="rtl">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Link href="/host" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" />العودة إلى لوحة المالك</Link>
        <p className="text-sm text-muted-foreground">إعدادات الحساب التجاري</p>
        <h1 className="text-3xl font-black tracking-tight">إعدادات الوكالة</h1>
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><ShieldCheck className="h-5 w-5" />بياناتك خاصة بحسابك</div>
    </div>

    <section className="rounded-3xl border bg-card p-5 shadow-sm md:p-7">
      <div className="mb-6 flex items-center gap-3"><Building2 className="h-6 w-6 text-[var(--brand-amber)]" /><div><h2 className="text-xl font-bold">هوية الوكالة</h2><p className="text-sm text-muted-foreground">هذه البيانات تساعد الزبناء على التعرف على وكالتك بعد تأكيد الحجز.</p></div></div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-3xl border-2 border-dashed bg-muted/40">
          {settingsQuery.data?.agencyLogoUrl ? <img src={settingsQuery.data.agencyLogoUrl} alt="شعار الوكالة" className="h-full w-full object-contain" /> : <Building2 className="h-10 w-10 text-muted-foreground" />}
        </div>
        <div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogo} /><Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploadLogo.isPending}><ImagePlus className="ml-2 h-4 w-4" />{uploadLogo.isPending ? "جاري رفع الشعار..." : "تغيير الشعار"}</Button><p className="mt-2 text-xs text-muted-foreground">JPG أو PNG أو WebP، بحد أقصى 3MB.</p></div>
      </div>
    </section>

    <form onSubmit={submit} className="space-y-6 rounded-3xl border bg-card p-5 shadow-sm md:p-7">
      <div><h2 className="text-xl font-bold">بيانات الاتصال</h2><p className="mt-1 text-sm text-muted-foreground">يمكنك تعديل هذه البيانات في أي وقت من دون تغيير إعلاناتك.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="اسم الوكالة" value={form.agencyName} onChange={(value) => updateField("agencyName", value)} placeholder="مثال: ALTUSplace Casablanca" />
        <Field label="الهاتف" value={form.agencyPhone} onChange={(value) => updateField("agencyPhone", value)} placeholder="+212 6..." dir="ltr" />
        <Field label="البريد الإلكتروني" value={form.agencyEmail} onChange={(value) => updateField("agencyEmail", value)} placeholder="contact@agency.ma" type="email" dir="ltr" />
        <Field label="واتساب" value={form.whatsappPhone} onChange={(value) => updateField("whatsappPhone", value)} placeholder="+212 6..." dir="ltr" />
        <Field label="السجل التجاري RC" value={form.commercialRegister} onChange={(value) => updateField("commercialRegister", value)} placeholder="رقم السجل التجاري" dir="ltr" />
        <Field label="الموقع الإلكتروني" value={form.agencyWebsite} onChange={(value) => updateField("agencyWebsite", value)} placeholder="https://..." dir="ltr" type="url" />
        <label className="grid gap-2 text-sm font-medium md:col-span-2">العنوان الكامل<textarea value={form.agencyAddress} onChange={(event) => updateField("agencyAddress", event.target.value)} placeholder="المدينة، الشارع، رقم المكتب" className="min-h-24 rounded-xl border bg-background p-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" /></label>
      </div>
      <div className="border-t pt-6"><div className="mb-4 flex items-center gap-3"><MapPin className="h-5 w-5 text-[var(--brand-amber)]" /><div><h3 className="font-bold">موقع الوكالة وساعات العمل</h3><p className="text-xs text-muted-foreground">أدخل إحداثيات Google Maps لتسهيل الوصول إلى مقر الوكالة.</p></div></div><div className="grid gap-4 md:grid-cols-2"><Field label="خط العرض Latitude" value={form.agencyLatitude} onChange={(value) => updateField("agencyLatitude", value)} placeholder="33.5731" dir="ltr" /><Field label="خط الطول Longitude" value={form.agencyLongitude} onChange={(value) => updateField("agencyLongitude", value)} placeholder="-7.5898" dir="ltr" /><label className="grid gap-2 text-sm font-medium md:col-span-2"><span className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />ساعات العمل</span><textarea value={form.agencyHours} onChange={(event) => updateField("agencyHours", event.target.value)} placeholder="الإثنين - السبت: 09:00 - 18:00\nالأحد: مغلق" className="min-h-24 rounded-xl border bg-background p-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" /></label></div>{form.agencyLatitude && form.agencyLongitude && <a href={`https://www.google.com/maps?q=${encodeURIComponent(`${form.agencyLatitude},${form.agencyLongitude}`)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"><MapPin className="h-4 w-4" />معاينة الموقع على Google Maps</a>}</div>
      <div className="flex justify-start"><Button type="submit" disabled={updateSettings.isPending} className="bg-[var(--brand-amber)] text-white hover:opacity-90"><Save className="ml-2 h-4 w-4" />{updateSettings.isPending ? <><Loader2 className="ml-2 h-4 w-4 animate-spin" />جاري الحفظ...</> : "حفظ التغييرات"}</Button></div>
    </form>
  </div>;
}

function Field({ label, value, onChange, placeholder, type = "text", dir }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; dir?: "ltr" | "rtl" }) {
  return <label className="grid gap-2 text-sm font-medium">{label}<input type={type} dir={dir} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="rounded-xl border bg-background p-3 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" /></label>;
}
