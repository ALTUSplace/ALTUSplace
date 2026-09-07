import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, Download, FileText, Mail, Moon, Receipt, Save, ShieldCheck, Sun, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import type { InvoicePdfInput } from "@/lib/invoicePdf";

const money = (value: number, currency = "MAD") => `${new Intl.NumberFormat("fr-MA").format(value)} ${currency}`;
const date = (value: string | Date | null | undefined) => value ? new Date(value).toLocaleDateString("fr-MA") : "—";

const statusLabel: Record<string, string> = {
  Pending: "قيد المراجعة",
  Confirmed: "مؤكد",
  Cancelled: "ملغى",
  Issued: "صادرة",
};

export default function Profile() {
  const { user, loading: authLoading, isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<"info" | "bookings" | "invoices">("info");
  const [name, setName] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [commercialRegister, setCommercialRegister] = useState("");
  const profileMutation = trpc.auth.updateProfile.useMutation();

  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setWhatsappPhone(user.whatsappPhone || "");
    setCommercialRegister(user.commercialRegister || "");
  }, [user]);

  const bookingsQuery = trpc.bookings.list.useQuery(undefined, { enabled: isAuthenticated });
  const invoicesQuery = trpc.invoices.list.useQuery(undefined, { enabled: isAuthenticated });
  const displayName = name || user?.name || "مستخدم B2-Rent";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase() || "BR";

  const invoicesByBooking = useMemo(() => new Map((invoicesQuery.data ?? []).map(invoice => [invoice.bookingId, invoice])), [invoicesQuery.data]);

  const saveProfile = (event: React.FormEvent) => {
    event.preventDefault();
    profileMutation.mutate({
      whatsappPhone: whatsappPhone.trim() || null,
      commercialRegister: commercialRegister.trim() || null,
    }, {
      onSuccess: () => toast.success("تم حفظ بيانات التواصل والسجل التجاري في حسابك."),
      onError: (error) => toast.error(error.message || "تعذر حفظ بيانات الحساب."),
    });
  };

  const downloadInvoice = async (invoice: InvoicePdfInput) => {
    const { generateInvoicePdf } = await import("@/lib/invoicePdf");
    const blob = generateInvoicePdf(invoice);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.invoiceNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading || (isAuthenticated && bookingsQuery.isLoading && invoicesQuery.isLoading)) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">جاري تحميل بيانات الحساب...</div>;
  }

  if (!isAuthenticated || !user) return null;

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4" dir="rtl">
      <div className="container max-w-5xl mx-auto space-y-6">
        <section className="bg-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-2xl">{initials}</div>
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs bg-emerald-400/10 text-emerald-300 px-3 py-1 rounded-full mb-2">
                  <ShieldCheck className="w-3.5 h-3.5" /> حساب مصادق عليه
                </div>
                <h1 className="text-2xl font-black">{displayName}</h1>
                <p className="text-sm text-slate-300 flex items-center gap-2 mt-1"><Mail className="w-4 h-4 text-amber-400" />{user.email || "البريد غير متوفر"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ["info", "البيانات الشخصية", UserRound],
                ["bookings", `حجوزاتي (${bookingsQuery.data?.length ?? 0})`, Calendar],
                ["invoices", `فواتيري (${invoicesQuery.data?.length ?? 0})`, Receipt],
              ] as const).map(([tab, label, Icon]) => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${activeTab === tab ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:text-white"}`}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {activeTab === "info" && (
          <section className="bg-card border border-border rounded-3xl p-6 md:p-8 space-y-8">
            <div>
              <h2 className="text-lg font-black flex items-center gap-2"><UserRound className="w-5 h-5 text-amber-500" /> بيانات الحساب</h2>
              <p className="text-sm text-muted-foreground mt-2">هذه البيانات مصدرها جلسة المصادقة الحالية، ولا يتم عرض رقم هاتف أو مدينة غير محفوظين في الحساب.</p>
            </div>
            <form onSubmit={saveProfile} className="grid md:grid-cols-2 gap-5">
              <label className="space-y-2 text-sm">
                <span className="font-bold">الاسم المعروض</span>
                <input value={name || user.name || ""} onChange={event => setName(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3" placeholder="اسمك" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-bold">البريد الإلكتروني</span>
                <input value={user.email || ""} readOnly className="w-full rounded-xl border border-border bg-muted px-3 py-3 text-muted-foreground" />
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-bold">رقم واتساب للمؤجر</span>
                <input value={whatsappPhone} onChange={event => setWhatsappPhone(event.target.value)} inputMode="tel" dir="ltr" className="w-full rounded-xl border border-border bg-background px-3 py-3" placeholder="2126XXXXXXXX" />
                <span className="text-xs text-muted-foreground">يظهر للمستأجر فقط بعد تأكيد الحجز.</span>
              </label>
              <label className="space-y-2 text-sm">
                <span className="font-bold">السجل التجاري (RC)</span>
                <input value={commercialRegister} onChange={event => setCommercialRegister(event.target.value)} dir="ltr" className="w-full rounded-xl border border-border bg-background px-3 py-3" placeholder="RC ..." />
                <span className="text-xs text-muted-foreground">يُدرج في عقد الكراء عند إنشاء العقد.</span>
              </label>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={profileMutation.isPending} className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"><Save className="w-4 h-4 ml-2" /> {profileMutation.isPending ? "جارٍ الحفظ..." : "حفظ بيانات الحساب"}</Button>
              </div>
            </form>
            <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold flex items-center gap-2">{theme === "dark" ? <Moon className="w-4 h-4 text-amber-500" /> : <Sun className="w-4 h-4 text-amber-500" />} مظهر المنصة</h3>
                <p className="text-sm text-muted-foreground mt-1">الوضع الحالي: {theme === "dark" ? "ليلي" : "نهاري"}</p>
              </div>
              <Button type="button" variant="outline" onClick={toggleTheme}>تبديل المظهر</Button>
            </div>
          </section>
        )}

        {activeTab === "bookings" && (
          <section className="space-y-4">
            <h2 className="text-lg font-black flex items-center gap-2"><Calendar className="w-5 h-5 text-amber-500" /> الحجوزات المرتبطة بحسابك</h2>
            {bookingsQuery.isError ? <EmptyState text="تعذر تحميل الحجوزات حالياً. حاول تحديث الصفحة." /> : bookingsQuery.data?.length ? bookingsQuery.data.map(booking => {
              const invoice = invoicesByBooking.get(booking.id);
              return <div key={booking.id} className="bg-card border border-border rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2"><span className="text-xs font-bold text-amber-600">BK-{booking.id}</span><span className="text-xs rounded-full px-2 py-1 bg-muted">{statusLabel[booking.status] || booking.status}</span></div>
                  <p className="font-bold">حجز إعلان رقم {booking.listingId}</p>
                  <p className="text-sm text-muted-foreground">{date(booking.startDate)} — {date(booking.endDate)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <strong className="text-amber-600">{money(booking.totalPrice)}</strong>
                  {invoice && <Button type="button" size="sm" variant="outline" onClick={() => downloadInvoice(invoice)}><Download className="w-4 h-4 ml-1" /> الفاتورة</Button>}
                </div>
              </div>;
            }) : <EmptyState text="لا توجد حجوزات مرتبطة بهذا الحساب بعد." />}
          </section>
        )}

        {activeTab === "invoices" && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black flex items-center gap-2"><Receipt className="w-5 h-5 text-amber-500" /> الفواتير الإلكترونية</h2><span className="text-xs text-muted-foreground">بيانات محفوظة في قاعدة البيانات</span></div>
            {invoicesQuery.isError ? <EmptyState text="تعذر تحميل الفواتير حالياً." /> : invoicesQuery.data?.length ? invoicesQuery.data.map(invoice => <div key={invoice.id} className="bg-card border border-border rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2"><span className="font-bold text-amber-600">{invoice.invoiceNumber}</span><span className={`text-xs rounded-full px-2 py-1 ${invoice.status === "Issued" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{statusLabel[invoice.status] || invoice.status}</span></div>
                <p className="text-sm">حجز #{invoice.bookingId} · {invoice.listingTitle || "إعلان تأجير"}</p>
                <p className="text-xs text-muted-foreground mt-1">TVA {invoice.vatRateBasisPoints / 100}% · الدفع: {invoice.paymentStatus} · {date(invoice.issuedAt)}</p>
              </div>
              <div className="flex items-center gap-4"><strong className="text-lg">{money(invoice.total, invoice.currency)}</strong><Button type="button" className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold" onClick={() => downloadInvoice(invoice)}><Download className="w-4 h-4 ml-1" /> تنزيل PDF</Button></div>
            </div>) : <EmptyState text="لا توجد فواتير لهذا الحساب بعد. ستظهر هنا بعد تسجيل الدفع." />}
          </section>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center text-muted-foreground text-sm"><FileText className="w-8 h-8 mx-auto mb-3 text-amber-500" />{text}</div>;
}
