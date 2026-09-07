import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Bell, CheckCircle2, Clock3, Loader2, Mail, Settings, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Language, useLanguage } from "@/contexts/LanguageContext";
import { startLogin } from "@/const";
import { toast } from "sonner";

type Filter = "all" | "unread";

function notificationTime(value: Date | string, language: Language) {
  return new Date(value).toLocaleString(language === "ar" ? "ar-MA" : language === "fr" ? "fr-MA" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function NotificationsPage() {
  const { isAuthenticated } = useAuth();
  const { language, direction } = useLanguage();
  const [filter, setFilter] = useState<Filter>("all");
  const utils = trpc.useUtils();
  const notificationsQuery = trpc.notifications.list.useQuery({ unreadOnly: false }, {
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const unreadQuery = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.notifications.list.invalidate(),
        utils.notifications.unreadCount.invalidate(),
      ]);
    },
    onError: () => toast.error(language === "ar" ? "تعذر تحديث الإشعار" : "Impossible de mettre à jour la notification"),
  });
  const markAllMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.notifications.list.invalidate(),
        utils.notifications.unreadCount.invalidate(),
      ]);
      toast.success(language === "ar" ? "تم تحديد الكل كمقروء" : "Toutes les notifications sont marquées comme lues");
    },
    onError: () => toast.error(language === "ar" ? "تعذر تحديث الإشعارات" : "Impossible de mettre à jour les notifications"),
  });

  const notifications = notificationsQuery.data ?? [];
  const filteredNotifications = useMemo(
    () => filter === "unread" ? notifications.filter((item) => item.readAt === null) : notifications,
    [filter, notifications],
  );

  if (!isAuthenticated) {
    return (
      <main className="min-h-[70vh] bg-background px-4 py-16 text-foreground" dir={direction}>
        <section className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <Bell className="mx-auto mb-4 h-10 w-10 text-amber-600" />
          <h1 className="text-2xl font-black">{language === "ar" ? "مركز الإشعارات" : "Centre de notifications"}</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {language === "ar" ? "سجّل الدخول لمتابعة الحجوزات وتنبيهات العقود." : "Connectez-vous pour suivre vos réservations et les alertes de bail."}
          </p>
          <Button onClick={() => startLogin()} className="mt-6 bg-amber-500 text-white hover:bg-amber-600">
            {language === "ar" ? "تسجيل الدخول" : "Se connecter"}
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12" dir={direction}>
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[#0B0F15] p-6 text-white shadow-xl sm:p-8">
          <div className="absolute -left-16 -top-20 h-48 w-48 rounded-full bg-amber-500/20 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
                <Bell className="h-4 w-4" />
                {language === "ar" ? "تنبيهات B2-Rent" : "Alertes B2-Rent"}
              </div>
              <h1 className="text-2xl font-black sm:text-3xl">
                {language === "ar" ? "إشعاراتك في مكان واحد" : "Toutes vos notifications au même endroit"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/75">
                {language === "ar" ? "ستظهر هنا تحديثات الحجوزات، قبول الطلبات، وتذكيرات عقود الكراء قبل 48 ساعة." : "Retrouvez ici les mises à jour de réservation, les décisions des propriétaires et les rappels de bail 48 heures à l’avance."}
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
              <span className="text-3xl font-black text-amber-300">{unreadQuery.data ?? 0}</span>
              <span className="max-w-24 text-xs font-bold leading-5 text-white/80">{language === "ar" ? "غير مقروءة" : "non lues"}</span>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-black"><CheckCircle2 className="h-5 w-5 text-emerald-600" />{language === "ar" ? "داخل المنصة" : "Dans l’application"}</div>
            <p className="text-xs leading-6 text-muted-foreground">{language === "ar" ? "مفعّلة فورياً للحجوزات والعقود." : "Activées instantanément pour réservations et baux."}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-black"><Mail className="h-5 w-5 text-blue-600" />{language === "ar" ? "البريد الإلكتروني" : "E-mail"}</div>
            <p className="text-xs leading-6 text-muted-foreground">{language === "ar" ? "جاهز للتفعيل عند إضافة مفتاح مزود البريد." : "Prêt à être activé après l’ajout de la clé du fournisseur."}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-black"><ShieldCheck className="h-5 w-5 text-amber-600" />{language === "ar" ? "الخصوصية" : "Confidentialité"}</div>
            <p className="text-xs leading-6 text-muted-foreground">{language === "ar" ? "كل مستخدم يرى إشعاراته فقط." : "Chaque utilisateur ne voit que ses propres alertes."}</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-black">{language === "ar" ? "سجل الإشعارات" : "Historique des notifications"}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{language === "ar" ? `${notifications.length} إشعار محفوظ` : `${notifications.length} notification(s)`}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border border-border bg-muted p-1">
                <button type="button" onClick={() => setFilter("all")} className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === "all" ? "bg-amber-500 text-white" : "text-muted-foreground"}`}>{language === "ar" ? "الكل" : "Toutes"}</button>
                <button type="button" onClick={() => setFilter("unread")} className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === "unread" ? "bg-amber-500 text-white" : "text-muted-foreground"}`}>{language === "ar" ? `غير المقروءة (${unreadQuery.data ?? 0})` : `Non lues (${unreadQuery.data ?? 0})`}</button>
              </div>
              <Button variant="outline" disabled={markAllMutation.isPending || (unreadQuery.data ?? 0) === 0} onClick={() => markAllMutation.mutate()} className="text-xs">
                {markAllMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {language === "ar" ? "تعليم الكل كمقروء" : "Tout marquer comme lu"}
              </Button>
            </div>
          </div>

          <div className="space-y-3 pt-5">
            {notificationsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{language === "ar" ? "جاري تحميل الإشعارات..." : "Chargement des notifications…"}</div>
            ) : notificationsQuery.isError ? (
              <div className="py-12 text-center text-sm text-rose-600">{language === "ar" ? "تعذر تحميل الإشعارات. أعد المحاولة لاحقاً." : "Impossible de charger les notifications. Réessayez plus tard."}</div>
            ) : filteredNotifications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">{filter === "unread" ? (language === "ar" ? "لا توجد إشعارات غير مقروءة." : "Aucune notification non lue.") : (language === "ar" ? "لا توجد إشعارات بعد." : "Aucune notification pour le moment.")}</div>
            ) : filteredNotifications.map((item) => {
              const unread = item.readAt === null;
              return (
                <article key={item.id} className={`flex flex-col gap-4 rounded-2xl border p-4 transition-colors sm:flex-row sm:items-start sm:justify-between sm:p-5 ${unread ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-background"}`}>
                  <div className="flex min-w-0 gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${unread ? "bg-amber-500/15 text-amber-700" : "bg-muted text-muted-foreground"}`}><Bell className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-black">{item.title}</h3>{unread && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">{language === "ar" ? "جديد" : "Nouveau"}</span>}</div>
                      <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">{item.message}</p>
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{notificationTime(item.createdAt, language)}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                    {item.href && <Link href={item.href} className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline">{language === "ar" ? "فتح" : "Ouvrir"}<ArrowUpRight className="h-3.5 w-3.5" /></Link>}
                    {unread && <Button size="sm" variant="outline" disabled={markReadMutation.isPending} onClick={() => markReadMutation.mutate({ notificationId: item.id })} className="text-xs">{language === "ar" ? "قراءة" : "Lire"}</Button>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <Link href="/support-tickets" className="flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"><Settings className="h-4 w-4" />{language === "ar" ? "تحتاج مساعدة في إشعار؟ تواصل مع الدعم" : "Besoin d’aide ? Contacter le support"}</Link>
      </div>
    </main>
  );
}
