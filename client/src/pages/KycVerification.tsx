import { useState } from "react";
import { ShieldCheck, FileText, History } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { KycDocumentUpload } from "@/components/KycDocumentUpload";
import { KYC_STATUS_CONFIG, getKycStatusFromSubmission } from "@/components/KycDocumentUpload";
import { Badge } from "@/components/ui/badge";

export default function KycVerification() {
  const { isAuthenticated, loading: authLoading } = useAuth({ redirectOnUnauthenticated: true });
  const { language, direction, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<"upload" | "history">("upload");
  const submissions = trpc.kyc.listMine.useQuery(undefined, { enabled: isAuthenticated });
  const lang = language === "ar" ? "ar" : language === "fr" ? "fr" : "en";
  const roleLabel = (value: string) => value === "owner" ? (language === "ar" ? "\u0645\u0627\u0644\u0643" : "Propri\u00e9taire") : value === "company" ? (language === "ar" ? "\u0634\u0631\u0643\u0629" : "Entreprise") : (language === "ar" ? "\u0645\u0633\u062a\u0623\u062c\u0631" : "Locataire");
  if (authLoading || !isAuthenticated) return <div className="min-h-screen grid place-items-center">{t("loading")}</div>;
  return (
    <main dir={direction} lang={language} className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20"><ShieldCheck className="h-6 w-6 text-amber-400" /></div>
            <div><h1 className="text-2xl font-black">{t("kycTitle")}</h1><p className="mt-2 text-sm text-slate-300">{t("kycSubtitle")}</p></div>
          </div>
        </header>
        <div className="flex gap-2 rounded-2xl border bg-card p-1.5">
          <button type="button" onClick={() => setActiveTab("upload")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${activeTab === "upload" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><ShieldCheck className="h-4 w-4" />{language === "ar" ? "\u0631\u0641\u0639 \u0648\u062b\u064a\u0642\u0629" : "T\u00e9l\u00e9charger"}</button>
          <button type="button" onClick={() => setActiveTab("history")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${activeTab === "history" ? "bg-amber-500 text-slate-950 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><History className="h-4 w-4" />{language === "ar" ? "\u0627\u0644\u0633\u062c\u0644" : "Historique"}</button>
        </div>
        {activeTab === "upload" && <KycDocumentUpload />}
        {activeTab === "history" && (
          <section className="space-y-3">
            <h2 className="text-lg font-black">{language === "ar" ? "\u0633\u062c\u0644 \u0637\u0644\u0628\u0627\u062a\u0643" : "Historique de vos demandes"}</h2>
            {submissions.isLoading ? (<div className="rounded-2xl border p-5 text-muted-foreground">{t("loading")}</div>) : submissions.data?.length ? (
              <div className="space-y-3">
                {submissions.data.map((item) => {
                  const status = getKycStatusFromSubmission(item.status);
                  const config = KYC_STATUS_CONFIG[status];
                  const StatusIcon = config.icon;
                  return (
                    <article key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-all hover:shadow-sm">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10"><FileText className="h-5 w-5 text-amber-600" /></div>
                        <div className="min-w-0"><p className="truncate text-sm font-bold">{item.originalFileName}</p><p className="text-xs text-muted-foreground">{roleLabel(item.applicantRole)} &middot; {new Date(item.submittedAt).toLocaleDateString(language === "ar" ? "ar-MA" : "fr-MA")}</p></div>
                      </div>
                      <Badge variant="outline" className={`shrink-0 gap-1.5 text-xs font-semibold ${config.badgeClass}`}><StatusIcon className="h-3 w-3" />{config.label[lang]}</Badge>
                    </article>
                  );
                })}
              </div>
            ) : (<div className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">{language === "ar" ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u0637\u0644\u0628\u0627\u062a \u062a\u062d\u0642\u0642 \u0628\u0639\u062f." : "Aucune demande de v\u00e9rification pour le moment."}</div>)}
          </section>
        )}
      </div>
    </main>
  );
}
