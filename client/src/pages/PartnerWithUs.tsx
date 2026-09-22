import { Building2, Car, ChevronLeft, Handshake, LogIn, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/lib/seo";

const paths = [
  {
    key: "car_rental",
    href: "/become-partner/car-rental",
    icon: Car,
    title: "وكالة كراء السيارات",
    subtitle: "اعرض أسطولك من السيارات للكراء اليومي والشهري",
    points: ["مزامنة بسيطة لعروض سياراتك", "حجوزات فورية ومدفوعات مضمونة", "أسعار مرنة حسب السيارة والمدة"],
    cta: "قدّم طلب انضمام — وكالة سيارات",
  },
  {
    key: "real_estate",
    href: "/become-partner/real-estate",
    icon: Building2,
    title: "وكالة عقارية",
    subtitle: "اعرض الشقق والفلل والمكاتب للكراء في مدن المغرب",
    points: ["نشر شققك وفللك ومكاتبك بسهولة", "عقود كراء إلكترونية وتوثيق", "ائتمان عبر لوحة تحكم شريكك"],
    cta: "قدّم طلب انضمام — وكالة عقارية",
  },
] as const;

export default function PartnerWithUs() {
  useSEO({
    title: "كن شريكاً مع ALTUSplace | سجّل وكالتك",
    description: "انضم إلى ALTUSplace كشريك: وكالة كراء سيارات أو وكالة عقارية. قدّم طلبك وابدأ بعرض سياراتك وعقاراتك للكراء بعد المراجعة.",
    path: "/become-partner",
    canonicalPath: "/become-partner",
  });

  return (
    <main dir="rtl" className="min-h-screen bg-[#f4f7f6] text-slate-900">
      <section className="relative overflow-hidden bg-[#102d2b] text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-bold text-[#7ee2b8]">
            <Handshake className="h-3.5 w-3.5" />
            شريك ALTUSplace
          </span>
          <h1 className="mx-auto mt-6 max-w-2xl text-3xl font-black leading-tight sm:text-5xl">
            كن شريكاً وعُدّ منتجاتك للكراء
            <span className="block text-[#f5b85b]">مع ALTUSplace</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
            اختر نوع وكالتك، قدّم طلبك مع بيانات وكالتك وصورها، وسيراجع فريقنا طلبك ليصدر لك حساب شريك
            كامل العتاد: لوحة تحكم، مدفوعات مضمونة، وحجوزات فورية.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-white/80">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#7ee2b8]" />مراجعة واعتماد يدوي</span>
            <span className="inline-flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-[#7ee2b8]" />حساب شريك فور الموافقة</span>
            <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4 text-[#7ee2b8]" />بدون رسوم اشتراك</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-[#3B82F6]">اختر مسار التسجيل</p>
        <h2 className="mt-2 text-center text-2xl font-black text-[#102d2b] sm:text-3xl">ما نوع وكالتك؟</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {paths.map((path) => (
            <div key={path.key} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#102d2b] text-[#f5b85b]">
                  <path.icon className="h-7 w-7" />
                </span>
                <div>
                  <h3 className="text-lg font-black text-[#102d2b]">{path.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{path.subtitle}</p>
                </div>
              </div>
              <ul className="mt-6 space-y-2.5">
                {path.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#f5b85b]" />
                    {point}
                  </li>
                ))}
              </ul>
              <Link href={path.href} className="mt-auto pt-6">
                <Button className="w-full bg-[#102d2b] text-white hover:bg-[#163c39]">
                  {path.cta}
                  <ChevronLeft className="mr-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-sm text-slate-600">
            لديك وكالة مسجلة بالفعل؟{" "}
            <Link href="/partner" className="inline-flex items-center gap-1 font-bold text-[#3B82F6] hover:underline">
              <LogIn className="h-4 w-4" />
              ادخل إلى فضاء الشركاء
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}