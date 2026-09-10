import { useEffect, useState } from "react";
import { BadgeDollarSign, Check, Layers, Medal, PencilRuler } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export type CommissionGlobal = { mode: "percent" | "flat"; percentBasisPoints: number; flatAmount: number };
export type CommissionTier = CommissionGlobal & { tier: string; active: boolean };
export type VendorForTier = { id: number; name: string | null; agencyName: string | null; vendorTier: string };

const TIER_META: Record<string, { label: string; en: string; color: string }> = {
  bronze: { label: "برونزية", en: "Bronze", color: "text-amber-500" },
  silver: { label: "فضية", en: "Silver", color: "text-slate-300" },
  gold: { label: "ذهبية", en: "Gold", color: "text-yellow-300" },
};

function draftFrom(mode: "percent" | "flat", percentBasisPoints: number, flatAmount: number) {
  return { mode, percent: mode === "percent" ? percentBasisPoints / 100 : percentBasisPoints / 100, flat: flatAmount };
}

export default function CommissionController({
  global,
  tiers,
  tierDistribution,
  vendors,
  onChanged,
}: {
  global: CommissionGlobal;
  tiers: CommissionTier[];
  tierDistribution: Record<string, number>;
  vendors: VendorForTier[];
  onChanged: () => void;
}) {
  const [globalDraft, setGlobalDraft] = useState(draftFrom(global.mode, global.percentBasisPoints, global.flatAmount));
  const [tierDrafts, setTierDrafts] = useState<Record<string, ReturnType<typeof draftFrom>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    setGlobalDraft(draftFrom(global.mode, global.percentBasisPoints, global.flatAmount));
    setTierDrafts(Object.fromEntries(tiers.map((t) => [t.tier, draftFrom(t.mode, t.percentBasisPoints, t.flatAmount)])));
  }, [global, tiers]);

  const refresh = async () => { setSaving(null); onChanged(); };
  const updateGlobal = trpc.admin.super.updateGlobalCommission.useMutation({
    onSuccess: async () => { toast.success("تم تحديث العمولة العامة — تسري على الحجوزات الجديدة فوراً"); await refresh(); },
    onError: (error) => { setSaving(null); toast.error(error.message); },
  });
  const updateTier = trpc.admin.super.updateTierCommission.useMutation({
    onSuccess: async () => { toast.success("تم تحديث عمولة المستوى — تسري فوراً"); await refresh(); },
    onError: (error) => { setSaving(null); toast.error(error.message); },
  });
  const assignTier = trpc.admin.super.updateVendorTier.useMutation({
    onSuccess: async () => { toast.success("تم تحديث مستوى المزوّد"); await refresh(); },
    onError: (error) => toast.error(error.message),
  });

  const saveGlobal = () => {
    setSaving("global");
    updateGlobal.mutate({ mode: globalDraft.mode, percentBasisPoints: Math.round(globalDraft.percent * 100), flatAmount: Math.round(globalDraft.flat) });
  };
  const saveTier = (tier: string) => {
    const draft = tierDrafts[tier];
    if (!draft) return;
    setSaving(tier);
    updateTier.mutate({ tier: tier as "bronze" | "silver" | "gold", mode: draft.mode, percentBasisPoints: Math.round(draft.percent * 100), flatAmount: Math.round(draft.flat) });
  };

  const owners = vendors.filter((v) => v.vendorTier).slice(0, 50);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">وحدة التحكم بالعمولة</h2>
          <p className="text-xs text-slate-500">Dynamic Platform Commission Controller — يطبق فوراً على الحجز التالي دون إعادة تشغيل</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300"><BadgeDollarSign className="h-3.5 w-3.5" /> Live recalculation</span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-200"><PencilRuler className="h-4 w-4 text-cyan-400" /> النسبة العامة للمنصة / Global Base</div>
          <RateEditor draft={globalDraft} onChange={(next) => setGlobalDraft(next)} />
          <button type="button" onClick={saveGlobal} disabled={saving === "global"} className="mt-3 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
            {saving === "global" ? "جارٍ الحفظ..." : "حفظ العمولة العامة"}
          </button>
          <p className="mt-2 text-[10px] text-slate-500">تُستخدم عندما لا يوجد تجاوز لمستوى المزوّد (Bronze = 10%، Silver = 8%، Gold = 6% افتراضياً).</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-200"><Layers className="h-4 w-4 text-violet-400" /> مستويات المزوّدين / Vendor Tiers</div>
          <div className="space-y-3">
            {tiers.map((tier) => {
              const draft = tierDrafts[tier.tier];
              const meta = TIER_META[tier.tier];
              if (!draft) return null;
              return (
                <div key={tier.tier} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-200"><Medal className={`h-4 w-4 ${meta?.color ?? "text-slate-400"}`} /> {meta?.label ?? tier.tier} <span className="text-[10px] font-medium text-slate-500">({meta?.en ?? ""})</span></span>
                    <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      {tier.active ? <span className="inline-flex items-center gap-0.5 text-emerald-300"><Check className="h-3 w-3" />override</span> : <span className="text-slate-500">global</span>}
                      <span className="rounded-full bg-slate-800 px-1.5 py-0.5">{tierDistribution[tier.tier] ?? 0} مزوّد</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-1 gap-2">
                      <RateEditor compact draft={draft} onChange={(next) => setTierDrafts((prev) => ({ ...prev, [tier.tier]: next }))} />
                    </div>
                    <button type="button" onClick={() => saveTier(tier.tier)} disabled={saving === tier.tier} className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold text-white hover:bg-violet-400 disabled:opacity-50">
                      {saving === tier.tier ? "..." : "حفظ"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-200"><Medal className="h-4 w-4 text-amber-300" /> تعيين مستوى المزوّدين ({owners.length})</h3>
        <div className="flex flex-wrap gap-2">
          {owners.map((vendor) => (
            <div key={vendor.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
              <span className="max-w-[140px] truncate text-xs text-slate-200">{vendor.agencyName || vendor.name || `#${vendor.id}`}</span>
              <select
                value={vendor.vendorTier}
                onChange={(event) => assignTier.mutate({ userId: vendor.id, tier: event.target.value as "bronze" | "silver" | "gold" })}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none"
              >
                <option value="bronze">Bronze</option>
                <option value="silver">Silver</option>
                <option value="gold">Gold</option>
              </select>
            </div>
          ))}
          {owners.length === 0 && <p className="text-xs text-slate-500">لا يوجد مزوّدون بعد لتحديد مستوياتهم.</p>}
        </div>
      </div>
    </div>
  );
}

function RateEditor({ draft, onChange, compact = false }: { draft: { mode: "percent" | "flat"; percent: number; flat: number }; onChange: (next: { mode: "percent" | "flat"; percent: number; flat: number }) => void; compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-end gap-2 ${compact ? "" : ""}`}>
      <label className="text-[11px] font-semibold text-slate-400">
        {compact ? "النمط" : "نوع الرسوم"}
        <select value={draft.mode} onChange={(event) => onChange({ ...draft, mode: event.target.value as "percent" | "flat" })} className="mt-0.5 block rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none">
          <option value="percent">Percent %</option>
          <option value="flat">Flat فمبلغ</option>
        </select>
      </label>
      {draft.mode === "percent" ? (
        <label className="text-[11px] font-semibold text-slate-400">
          النسبة %
          <input type="number" min={0} max={100} step={0.1} value={String(draft.percent)} onChange={(event) => onChange({ ...draft, percent: Number(event.target.value) })} className="mt-0.5 block w-20 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 outline-none" />
        </label>
      ) : (
        <label className="text-[11px] font-semibold text-slate-400">
          المبلغ (MAD)
          <input type="number" min={0} step={1} value={String(Math.round(draft.flat))} onChange={(event) => onChange({ ...draft, flat: Number(event.target.value) })} className="mt-0.5 block w-24 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 outline-none" />
        </label>
      )}
    </div>
  );
}