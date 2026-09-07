import { Link } from "wouter";
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";

const sections = [
  {
    title: "البيانات التي نجمعها",
    body: "نجمع فقط البيانات اللازمة لتقديم خدمات البحث والحجز والتواصل، مثل الاسم، معلومات الاتصال، تفاصيل الحجز، وبيانات الإعلان التي يضيفها الشريك.",
  },
  {
    title: "كيف نستخدم البيانات",
    body: "تُستخدم البيانات لمعالجة الحجوزات، إصدار العقود والفواتير، تحسين نتائج البحث، والتواصل بشأن حالة الطلبات أو الدعم الفني. لا نبيع بيانات المستخدمين أو نستخدمها خارج هذه الأغراض.",
  },
  {
    title: "الحماية والاحتفاظ",
    body: "نطبق ضوابط وصول مناسبة ونحتفظ بالبيانات للمدة اللازمة قانونياً وتشغيلياً، ثم نحذفها أو نجهّلها عندما لا تعود مطلوبة.",
  },
  {
    title: "حقوقك وخياراتك",
    body: "يمكنك طلب معرفة البيانات المرتبطة بحسابك أو تصحيحها أو الاستفسار عن طريقة استخدامها عبر مركز الدعم. قد نطلب التحقق من الهوية لحماية الحساب.",
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="b2-page-shell" dir="rtl">
      <section className="b2-container b2-section max-w-4xl">
        <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-amber-700 hover:underline dark:text-amber-300">
          <ArrowRight className="h-4 w-4" /> العودة إلى الرئيسية
        </Link>

        <div className="mb-8 rounded-[1.75rem] bg-[var(--brand-navy)] px-6 py-8 text-white sm:px-10">
          <div className="mb-4 flex items-center gap-3 text-amber-300">
            <ShieldCheck className="h-7 w-7" />
            <span className="text-sm font-bold">ALTUSplace | الثقة أولاً</span>
          </div>
          <h1 className="text-3xl font-black sm:text-4xl">سياسة الخصوصية</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/90">توضح هذه الصفحة بشكل مبسط كيف نتعامل مع بيانات مستخدمي منصة ALTUSplace عند تصفح العروض أو إنشاء الحجوزات.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((section) => (
            <article key={section.title} className="b2-card p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-black text-foreground">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-700 dark:text-slate-200">{section.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-muted p-5 text-sm text-foreground">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
          <p className="leading-7">لمزيد من التفاصيل حول شروط الحجز والضمان والعمولات، راجع <Link href="/terms" className="font-bold text-amber-700 underline dark:text-amber-300">شروط الاستخدام</Link> أو تواصل مع <Link href="/support-tickets" className="font-bold text-amber-700 underline dark:text-amber-300">الدعم الفني</Link>.</p>
        </div>
      </section>
    </div>
  );
}
