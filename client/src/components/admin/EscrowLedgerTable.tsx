import { useState } from "react";
import { Lock, Scale, Send, ShieldCheck, Timer } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export type EscrowRow = {
  id: number;
  bookingId: number;
  guestId: number | null;
  guestName: string | null;
  vendorId: number | null;
  vendorName: string | null;
  listingTitle: string | null;
  listingCategory: string;
  totalPaid: number;
  platformCut: number;
  vendorPayoutShare: number;
  releaseDate: Date;
  stripeTransferStatus: "pending" | "sent" | "held" | "failed" | "released";
  stripeTransferId: string | null;
  status: "held" | "releasable" | "released" | "frozen" | "mediated";
  mediationNote: string | null;
};

const money = (value: number) => new Intl.NumberFormat("fr-MA").format(Math.round(value));
const date = (value: Date) => new Date(value).toLocaleDateString("fr-MA");
const categoryLabel = (value: string) => (value === "real_estate" ? "عقار / Property" : value === "car" ? "سيارة / Car" : value);

const STATUS_STYLES: Record<EscrowRow["status"], { label: string; className: string }> = {
  held: { label: "محجوز", className: "bg-slate-700/50 text-slate-300" },
  releasable: { label: "قابل للتحويل", className: "bg-cyan-500/15 text-cyan-300" },
  released: { label: "محرَّر", className: "bg-emerald-500/15 text-emerald-300" },
  frozen: { label: "مجمَّد", className: "bg-amber-500/15 text-amber-300" },
  mediated: { label: "تسوية نزاع", className: "bg-violet-500/15 text-violet-300" },
};

const TRANSFER_STYLES: Record<EscrowRow["stripeTransferStatus"], { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-slate-800 text-slate-400" },
  sent: { label: "Sent", className: "bg-sky-500/15 text-sky-300" },
  held: { label: "Held", className: "bg-amber-500/15 text-amber-300" },
  failed: { label: "Failed", className: "bg-rose-500/15 text-rose-300" },
  released: { label: "Released", className: "bg-emerald-500/15 text-emerald-300" },
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}

export default function EscrowLedgerTable({ rows, onChanged }: { rows: EscrowRow[]; onChanged: () => void }) {
  const [mediateRow, setMediateRow] = useState<number | null>(null);
  const [mediateResolution, setMediateResolution] = useState<"release_to_vendor" | "refund_to_guest">("release_to_vendor");
  const [mediateNote, setMediateNote] = useState("");

  const refresh = () => { onChanged(); };
  const freeze = trpc.admin.super.forceHoldPayout.useMutation({
    onSuccess: async (res) => { toast.success(res.message); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const release = trpc.admin.super.releaseEscrow.useMutation({
    onSuccess: async (res) => { toast.success(res.message); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const mediate = trpc.admin.super.mediateDispute.useMutation({
    onSuccess: async (res) => { toast.success(res.message); setMediateRow(null); setMediateNote(""); await refresh(); },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">مراقب الإسكرو والمدفوعات</h2>
          <p className="text-xs text-slate-500">Multi-Vendor Escrow & Ledger Monitor — Stripe Connect split payments</p>
        </div>
        <Badge className="bg-cyan-500/15 text-cyan-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          {rows.length} معاملة إسكرو
        </Badge>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Booking ID</th>
              <th className="px-4 py-3">الضيف / Guest</th>
              <th className="px-4 py-3">المزوّد / Vendor</th>
              <th className="px-4 py-3">الفئة</th>
              <th className="px-4 py-3">Total Paid</th>
              <th className="px-4 py-3">Platform Cut</th>
              <th className="px-4 py-3">Vendor Payout</th>
              <th className="px-4 py-3">Escrow Release</th>
              <th className="px-4 py-3">Stripe Transfer</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row
                key={row.id}
                row={row}
                mediateRow={mediateRow}
                setMediateRow={setMediateRow}
                mediateResolution={mediateResolution}
                setMediateResolution={setMediateResolution}
                mediateNote={mediateNote}
                setMediateNote={setMediateNote}
                onFreeze={() => freeze.mutate({ escrowId: row.id })}
                onRelease={() => release.mutate({ escrowId: row.id })}
                onMediate={() => mediate.mutate({ escrowId: row.id, resolution: mediateResolution, mediationNote: mediateNote })}
                busy={freeze.isPending || release.isPending || mediate.isPending}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">لا توجد معاملات إسكرو بعد.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  row,
  mediateRow,
  setMediateRow,
  mediateResolution,
  setMediateResolution,
  mediateNote,
  setMediateNote,
  onFreeze,
  onRelease,
  onMediate,
  busy,
}: {
  row: EscrowRow;
  mediateRow: number | null;
  setMediateRow: (id: number | null) => void;
  mediateResolution: "release_to_vendor" | "refund_to_guest";
  setMediateResolution: (v: "release_to_vendor" | "refund_to_guest") => void;
  mediateNote: string;
  setMediateNote: (v: string) => void;
  onFreeze: () => void;
  onRelease: () => void;
  onMediate: () => void;
  busy: boolean;
}) {
  const status = STATUS_STYLES[row.status];
  const transfer = TRANSFER_STYLES[row.stripeTransferStatus];
  const mutable = row.status === "held" || row.status === "releasable";
  const expanded = mediateRow === row.id;

  return (
    <>
      <tr className="border-b border-slate-800/70 text-slate-300 last:border-0 hover:bg-slate-800/20">
        <td className="px-4 py-3 font-mono text-xs font-semibold text-cyan-300">#{row.bookingId}</td>
        <td className="px-4 py-3">{row.guestName ?? `ضيف #${row.guestId ?? ""}`}</td>
        <td className="px-4 py-3">{row.vendorName ?? `مزوّد #${row.vendorId ?? ""}`}</td>
        <td className="px-4 py-3"><span className="text-xs">{categoryLabel(row.listingCategory)}</span></td>
        <td className="px-4 py-3 font-semibold text-slate-100">{money(row.totalPaid)} MAD</td>
        <td className="px-4 py-3 text-rose-300">{money(row.platformCut)} MAD</td>
        <td className="px-4 py-3 font-semibold text-emerald-300">{money(row.vendorPayoutShare)} MAD</td>
        <td className="px-4 py-3 text-xs"><span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5 text-slate-500" />{date(row.releaseDate)}</span></td>
        <td className="px-4 py-3"><div className="flex flex-col gap-1"><Badge className={transfer.className}>{transfer.label}</Badge>{row.stripeTransferId && <span className="max-w-[140px] truncate font-mono text-[10px] text-slate-500" title={row.stripeTransferId}>{row.stripeTransferId}</span>}</div></td>
        <td className="px-4 py-3"><Badge className={status.className}>{status.label}</Badge></td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {mutable && (
              <>
                <button type="button" disabled={busy} onClick={onFreeze} title="Freeze / Force Hold" className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
                  <Lock className="h-3 w-3" />Freeze
                </button>
                <button type="button" disabled={busy} onClick={onRelease} title="Release payout" className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                  <Send className="h-3 w-3" />Release
                </button>
              </>
            )}
            {(mutable || row.status === "frozen") && (
              <button
                type="button"
                disabled={busy}
                onClick={() => { setMediateRow(expanded ? null : row.id); setMediateNote(row.mediationNote ?? ""); }}
                title="Manually Mediate Dispute"
                className="flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-50"
              >
                <Scale className="h-3 w-3" />Mediate
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-800/70 bg-slate-900/40">
          <td colSpan={11} className="px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <label className="flex-1 text-xs font-semibold text-slate-400">
                ملاحظة التسوية / Mediation Note
                <textarea
                  value={mediateNote}
                  onChange={(event) => setMediateNote(event.target.value)}
                  rows={2}
                  className="mt-1.5 w-full resize-none rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-500"
                  placeholder="يسجّل قرار الوساطة وتفاصيله (2-2000 حرفاً)..."
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || mediateNote.trim().length < 2}
                  onClick={() => setMediateResolution("release_to_vendor")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${mediateResolution === "release_to_vendor" ? "bg-emerald-500 text-slate-950" : "border border-slate-700 text-slate-300 hover:border-emerald-500/40"}`}
                >
                  Release to Vendor
                </button>
                <button
                  type="button"
                  disabled={busy || mediateNote.trim().length < 2}
                  onClick={() => setMediateResolution("refund_to_guest")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${mediateResolution === "refund_to_guest" ? "bg-rose-500 text-white" : "border border-slate-700 text-slate-300 hover:border-rose-500/40"}`}
                >
                  Refund to Guest
                </button>
                <button type="button" disabled={busy || mediateNote.trim().length < 2} onClick={onMediate} className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-bold text-white hover:bg-violet-400 disabled:opacity-50">
                  تأكيد التسوية
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}