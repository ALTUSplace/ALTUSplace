import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  Building2,
  CircleDollarSign,
  FileCheck2,
  ListChecks,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { trpcUnbatched as trpc } from "@/lib/trpcUnbatched";
import { useAuth } from "@/_core/hooks/useAuth";
import { useDocumentTitle } from "@/lib/seo";
import { RejectReasonDialog } from "@/components/moderation/RejectReasonDialog";
import {
  QUEUE_KINDS,
  compareByOldestFirst,
  countFor,
  formatSubmitted,
  isActionable,
  kindBadge,
  kindLabel,
  queueItemMeta,
  queueItemTitle,
  totalPending,
  type QueueItemLike,
  type QueueKind,
} from "@/lib/moderationQueue";

/**
 * Unified moderation queue.
 *
 * Replaces four separate admin tabs that each hid pending work behind their own
 * client-side filter, and each derived its pending badge from a list the server
 * had already capped. Two known gaps are stated on screen rather than papered
 * over, because both are things an admin would otherwise assume work:
 *
 *  1. KYC documents are NOT viewable here. `kyc_submissions` stores a Supabase
 *     storage key, not a URL, and rendering one would mean minting a signed URL
 *     per queue row. The card shows the metadata an admin needs to decide, which
 *     is exactly what the old tab showed -- this page does not make document
 *     review possible, it only makes the pending list legible.
 *  2. Refunds are display-only. No button here moves money.
 *
 * NOT covered by tests: this repo has no DOM and no React-testing library, so
 * nothing verifies that the dialog opens, that buttons disable, or that the list
 * refetches. What IS tested are the pure helpers in @/lib/moderationQueue.
 */
const PAGE_LIMIT = 25;

type PendingDecision =
  | { kind: "listing"; item: QueueItemLike; title: string; subject: string }
  | { kind: "kyc"; item: QueueItemLike; title: string; subject: string }
  | { kind: "partner"; item: QueueItemLike; title: string; subject: string };

export default function AdminModeration() {
  useDocumentTitle("قائمة الإشراف | ALTUSplace");
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const enabled = user?.role === "admin" || user?.role === "SUPER_ADMIN";

  // Empty means "all kinds". The server does the same default, so an
  // unfiltered load is one query, not four client-side merges.
  const [kinds, setKinds] = useState<QueueKind[]>([]);
  const input = useMemo(
    () => (kinds.length ? { kinds, limit: PAGE_LIMIT } : { limit: PAGE_LIMIT }),
    [kinds],
  );
  const queue = trpc.admin.moderationQueue.useQuery(input, { enabled });

  const [decision, setDecision] = useState<PendingDecision | null>(null);

  const notify = (message: string) => ({
    onSuccess: async () => {
      toast.success(message);
      await queue.refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message);
    },
  });

  const moderateListing = trpc.admin.moderateListing.useMutation(notify("تم تحديث الإعلان"));
  const reviewKyc = trpc.kyc.review.useMutation(notify("تم تحديث طلب التحقق"));
  const reviewPartnerApp = trpc.admin.reviewPartnerApplication.useMutation(
    notify("تم تحديث حالة الطلب"),
  );

  const busy = moderateListing.isPending || reviewKyc.isPending || reviewPartnerApp.isPending;
  const counts = queue.data?.counts;
  const items = useMemo(
    () => [...(queue.data?.items ?? [])].sort(compareByOldestFirst),
    [queue.data?.items],
  );

  const openReject = (kind: QueueItemLike, label: string) => {
    if (!isActionable(kind.kind)) return;
    if (kind.kind === "listing") {
      setDecision({ kind: "listing", item: kind, title: `رفض الإعلان #${String(kind.id ?? "?")}`, subject: label });
    } else if (kind.kind === "kyc") {
      setDecision({ kind: "kyc", item: kind, title: `رفض طلب التحقق #${String(kind.id ?? "?")}`, subject: label });
    } else if (kind.kind === "partner") {
      setDecision({ kind: "partner", item: kind, title: `رفض طلب الشراكة #${String(kind.id ?? "?")}`, subject: label });
    }
  };

  /**
   * Every rejection carries the reason into the audit log. The server re-checks
   * this with a `.refine()` on each input, so a caller that forgets -- or a
   * crafted request that skips this component entirely -- is rejected there, not
   * here.
   */
  const confirmReject = (reason: string) => {
    if (!decision) return;
    if (decision.kind === "listing") {
      moderateListing.mutate({
        listingId: Number(decision.item.id),
        status: "Rejected",
        reason,
      });
    } else if (decision.kind === "kyc") {
      reviewKyc.mutate({
        id: Number(decision.item.id),
        status: "Rejected",
        rejectionReason: reason,
      });
    } else {
      reviewPartnerApp.mutate({
        id: Number(decision.item.id),
        decision: "rejected",
        adminNote: reason,
      });
    }
    setDecision(null);
  };

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="animate-spin text-cyan-500" />
      </div>
    );
  }
  if (!enabled) return null;

  const toggleKind = (kind: QueueKind) => {
    setKinds((current) =>
      current.includes(kind) ? current.filter((value) => value !== kind) : [...current, kind],
    );
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f7f6] px-4 py-5 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1440px] space-y-5">
        <header className="flex flex-col gap-4 rounded-2xl bg-brand-panel p-6 text-brand-panel-ink shadow-xl sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-accent-clay">
              <Inbox className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.2em]">
                ALTUSplace / MODERATION QUEUE
              </span>
            </div>
            <h1 className="text-3xl font-black tracking-tight">قائمة الإشراف</h1>
            <p className="mt-2 max-w-2xl text-sm text-brand-panel-ink/70">
              كل ما ينتظر قراراً في مكان واحد، الأقدم أولاً.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="w-fit border-white/20 bg-transparent text-white hover:bg-white/10"
              onClick={() => queue.refetch()}
            >
              <RefreshCw className="ms-2 h-4 w-4" />
              تحديث
            </Button>
            <Link href="/admin">
              <Button className="w-fit bg-white/10 text-white hover:bg-white/20">
                <ArrowLeft className="ms-2 h-4 w-4" />
                لوحة الإدارة
              </Button>
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {QUEUE_KINDS.map((kind) => {
            const count = countFor(counts, kind);
            const active = kinds.length === 0 || kinds.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => toggleKind(kind)}
                aria-pressed={kinds.includes(kind)}
                className={`rounded-xl border p-4 text-start transition ${active ? "border-transparent bg-white shadow-sm" : "border-dashed border-slate-300 bg-transparent opacity-60"}`}
              >
                <p className="text-xs text-slate-500">{kindLabel(kind)}</p>
                <p className="mt-1 text-2xl font-black text-ink-primary">{count}</p>
                <p className="mt-1 text-[10px] text-ink-secondary">
                  {kinds.includes(kind) ? "مُفعّل" : "اضغط للتصفية"}
                </p>
              </button>
            );
          })}
        </section>

        {kinds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>مُصفّى على:</span>
            {kinds.map((kind) => (
              <Badge key={kind} variant="secondary">
                {kindLabel(kind)}
              </Badge>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setKinds([])}>
              عرض الكل
            </Button>
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              <Inbox className="h-5 w-5 text-accent-clay" />
              الطلبات المعلّقة
              <Badge variant="secondary">{totalPending(counts)}</Badge>
              <span className="me-auto text-xs font-normal text-slate-500">
                الأقدم أولاً · يُعرض أحدث {PAGE_LIMIT} طلباً كحد أقصى
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.length === 0 ? (
              <div className="grid min-h-24 place-items-center text-sm text-ink-secondary">
                {queue.isLoading ? "جارٍ التحميل..." : "لا توجد طلبات معلّقة."}
              </div>
            ) : (
              items.map((item) => (
                <QueueRow
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  disabled={busy}
                  onReject={(label) => openReject(item, label)}
                  onApprove={() => approve(item, {
                    moderateListing,
                    reviewKyc,
                    reviewPartnerApp,
                  })}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <RejectReasonDialog
        open={decision !== null}
        title={decision?.title ?? ""}
        subject={decision?.subject}
        pending={busy}
        onCancel={() => setDecision(null)}
        onConfirm={confirmReject}
      />
    </div>
  );
}

/**
 * Approve path. Each kind maps to its own mutation because the three procedures
 * were written independently and take differently named fields; unifying them
 * server-side is out of scope here.
 */
function approve(
  item: QueueItemLike,
  mutations: {
    moderateListing: { mutate: (input: { listingId: number; status: "Published" }) => void };
    reviewKyc: { mutate: (input: { id: number; status: "Approved" }) => void };
    reviewPartnerApp: { mutate: (input: { id: number; decision: "approved" }) => void };
  },
) {
  const id = Number(item.id);
  if (item.kind === "listing") mutations.moderateListing.mutate({ listingId: id, status: "Published" });
  else if (item.kind === "kyc") mutations.reviewKyc.mutate({ id, status: "Approved" });
  else if (item.kind === "partner") mutations.reviewPartnerApp.mutate({ id, decision: "approved" });
}

const KIND_ICON: Record<string, typeof ListChecks> = {
  listing: ListChecks,
  kyc: FileCheck2,
  partner: Building2,
  refund: CircleDollarSign,
};

function QueueRow({
  item,
  disabled,
  onReject,
  onApprove,
}: {
  item: QueueItemLike;
  disabled: boolean;
  onReject: (label: string) => void;
  onApprove: () => void;
}) {
  const Icon = KIND_ICON[item.kind] ?? Inbox;
  const label = queueItemTitle(item);
  const actionable = isActionable(item.kind);

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 rounded-full bg-emerald-50 p-2 text-accent-clay">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-ink-primary">{label}</p>
            <Badge variant="outline">{kindBadge(item.kind)}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">{queueItemMeta(item)}</p>
          <p className="mt-1 text-[10px] text-ink-secondary">
            مُرسل {formatSubmitted(item.submittedAt)}
          </p>
          <KindNote kind={item.kind} />
        </div>
      </div>

      {actionable ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={disabled} onClick={onApprove}>
            <ShieldCheck className="ms-1 h-3.5 w-3.5" />
            قبول
          </Button>
          <Button size="sm" variant="destructive" disabled={disabled} onClick={() => onReject(label)}>
            رفض
          </Button>
        </div>
      ) : (
        <Badge variant="secondary" className="shrink-0">
          عرض فقط
        </Badge>
      )}
    </div>
  );
}

/**
 * Per-kind honesty note. Each of these is a real limitation of this page, stated
 * where the admin is looking rather than only in the pull request.
 */
function KindNote({ kind }: { kind: string }) {
  if (kind === "kyc") {
    return (
      <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
        المستند غير قابل للعرض من هنا — هذه الصفحة تعرض البيانات الوصفية فقط. راجع
        طلب التحقق في تبويب طلبات الشركاء بلوحة الإدارة.
      </p>
    );
  }
  if (kind === "refund") {
    return (
      <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
        للعرض فقط. الترديد على المعاملات يتم من صفحة طلبات الاسترداد في لوحة الإدارة.
      </p>
    );
  }
  return null;
}