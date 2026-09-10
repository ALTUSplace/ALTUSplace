import { Gauge, LayoutDashboard, ShieldCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import MetricCards from "@/components/admin/MetricCards";
import RevenueChart from "@/components/admin/RevenueChart";
import EscrowLedgerTable from "@/components/admin/EscrowLedgerTable";
import CommissionController from "@/components/admin/CommissionController";
import { DashboardSkeleton } from "@/components/admin/skeletons";

export default function SuperDashboard() {
  const { user, loading } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const overview = trpc.admin.super.financialOverview.useQuery(undefined, { enabled: isSuperAdmin });
  const series = trpc.admin.super.revenueSeries.useQuery(undefined, { enabled: isSuperAdmin });
  const ledger = trpc.admin.super.escrowLedger.useQuery(undefined, { enabled: isSuperAdmin });
  const commission = trpc.admin.super.getCommission.useQuery(undefined, { enabled: isSuperAdmin });
  const users = trpc.admin.users.useQuery(undefined, { enabled: isSuperAdmin });

  const refresh = () => {
    overview.refetch();
    series.refetch();
    ledger.refetch();
    commission.refetch();
    users.refetch();
  };

  if (loading) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#0b1220] px-4 py-6 text-slate-100 sm:px-6 lg:px-10">
        <DashboardSkeleton />
      </main>
    );
  }

  if (!isSuperAdmin) {
    return (
      <main dir="rtl" className="grid min-h-screen place-items-center bg-[#0b1220] px-6 text-center">
        <div className="max-w-md space-y-3">
          <ShieldCheck className="mx-auto h-12 w-12 text-rose-500" />
          <h1 className="text-2xl font-black text-slate-100">الوصول مقيّد</h1>
          <p className="text-sm text-slate-400">هذه اللوحة متاحة حصرياً لحسابات SUPER_ADMIN.</p>
        </div>
      </main>
    );
  }

  const waiting = overview.isPending || series.isPending;
  const overviewData = overview.data!;
  const seriesData = series.data ?? [];

  return (
    <main dir="rtl" className="min-h-screen bg-[#0b1220] px-4 py-6 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col gap-5 rounded-2xl border border-slate-800 bg-gradient-to-br from-[#0e1a2e] to-[#111c33] p-6 shadow-xl sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-cyan-400">
              <Gauge className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-[0.25em]">ALTUSplace / SUPER DASHBOARD / EXECUTIVE</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">لوحة القيادة التنفيذية للتمويل</h1>
            <p className="mt-2 flex max-w-xl items-center gap-2 text-sm text-slate-400">
              <LayoutDashboard className="h-3.5 w-3.5 text-emerald-400" />
              التحليلات المالية، التحكم الديناميكي بالعمولة، ومراقبة الإسكرو عبر Stripe Connect.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
            SUPER_ADMIN · RBAC نشط
          </div>
        </header>

        {waiting ? (
          <DashboardSkeleton />
        ) : (
          <>
            <MetricCards data={overviewData} />

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20 xl:col-span-2">
                {series.isPending ? (
                  <div className="h-72 animate-pulse rounded-xl bg-slate-800/50" />
                ) : (
                  <RevenueChart data={seriesData} />
                )}
              </section>
              <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20">
                {commission.isPending ? (
                  <div className="h-72 animate-pulse rounded-xl bg-slate-800/50" />
                ) : (
                  <CommissionController
                    global={commission.data!.global}
                    tiers={commission.data!.tiers}
                    tierDistribution={commission.data!.tierDistribution}
                    vendors={(users.data ?? []).map((user) => ({ id: user.id, name: user.name, agencyName: user.agencyName, vendorTier: user.vendorTier ?? "bronze" }))}
                    onChanged={refresh}
                  />
                )}
              </section>
            </div>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20">
              {ledger.isPending ? (
                <TableSkeletonBlock />
              ) : (
                <EscrowLedgerTable rows={ledger.data ?? []} onChanged={refresh} />
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function TableSkeletonBlock() {
  return (
    <div>
      <div className="mb-4 h-5 w-1/3 animate-pulse rounded bg-slate-800/60" />
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <div className="flex gap-6 border-b border-slate-800 bg-slate-900/60 px-4 py-3">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-4 flex-1 animate-pulse rounded bg-slate-800/60" />)}
        </div>
        {Array.from({ length: 6 }).map((_, row) => (
          <div key={row} className="flex gap-6 border-b border-slate-800/70 px-4 py-4 last:border-0">
            {Array.from({ length: 8 }).map((_, col) => <div key={col} className="h-4 flex-1 animate-pulse rounded bg-slate-800/50" />)}
          </div>
        ))}
      </div>
    </div>
  );
}