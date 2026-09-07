import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/contexts/LanguageContext";
import { startLogin } from "@/const";
import { legalDisclosure, persistLegalConsent } from "@/lib/legalDisclosure";

export default function Register() {
  const [, setLocation] = useLocation();
  const { language, direction, t } = useLanguage();
  const [accepted, setAccepted] = useState(false);
  const content = legalDisclosure[language];

  const continueToAuth = () => {
    if (!accepted) return;
    persistLegalConsent();
    startLogin();
  };

  return (
    <main className="min-h-[70vh] bg-slate-50 px-4 py-10 sm:px-6" dir={direction}>
      <section className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-700">
                <ShieldCheck className="h-5 w-5" />
                <span>{t("kycTitle")}</span>
              </div>
              <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">{content.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{content.summary}</p>
            </div>
            <Button variant="outline" onClick={() => setLocation("/terms")} className="shrink-0 gap-2">
              <FileText className="h-4 w-4" />
              {t("detailsAndBooking")}
            </Button>
          </div>

          <div className="mt-8 space-y-4">
            {content.sections.map((section) => (
              <article key={section.title} className="border-s-4 border-amber-400 bg-amber-50/60 p-4 text-sm leading-7 text-slate-700">
                <h2 className="font-black text-slate-900">{section.title}</h2>
                <p className="mt-1">{section.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Checkbox id="legal-consent" checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} className="mt-1" />
            <label htmlFor="legal-consent" className="cursor-pointer text-sm font-semibold leading-6 text-slate-800">
              {t("identityVerification")}
            </label>
          </div>

          <Button onClick={continueToAuth} disabled={!accepted} className="mt-5 w-full gap-2 bg-[#0B0F15] text-white hover:bg-[#092f49] sm:w-auto">
            <CheckCircle2 className="h-4 w-4" />
            {t("bookNow")}
          </Button>
        </div>

        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#0B0F15] hover:text-amber-700">
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Link>
      </section>
    </main>
  );
}
