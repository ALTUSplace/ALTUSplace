import { CircleDollarSign, Landmark, RotateCcw, Wallet } from "lucide-react";

const money = (value: number) => new Intl.NumberFormat("fr-MA").format(Math.round(value));

export type FinancialOverview = {
  grossBookingValue: number;
  netPlatformRevenue: number;
  activeEscrowBalance: number;
  totalRefundedVolume: number;
  confirmedBookings: number;
  activeEscrowEntries: number;
  propertyGbv: number;
  carGbv: number;
  propertyNet: number;
  carNet: number;
};

export default function MetricCards({ data }: { data: FinancialOverview }) {
  const cards = [
    {
      label: "إجمالي قيمة الحجوزات",
      en: "Gross Booking Value",
      value: `${money(data.grossBookingValue)} MAD`,
      sub: `${data.confirmedBookings} حجز مؤكّد`,
      icon: Wallet,
      accent: "text-cyan-400",
      ring: "ring-cyan-400/30",
    },
    {
      label: "صافي إيرادات المنصة",
      en: "Net Platform Revenue",
      value: `${money(data.netPlatformRevenue)} MAD`,
      sub: `عقارات ${money(data.propertyNet)} · سيارات ${money(data.carNet)}`,
      icon: CircleDollarSign,
      accent: "text-emerald-400",
      ring: "ring-emerald-400/30",
    },
    {
      label: "رصيد الإسكرو النشط",
      en: "Active Escrow Balance",
      value: `${money(data.activeEscrowBalance)} MAD`,
      sub: `${data.activeEscrowEntries} عملية قيد الحجز`,
      icon: Landmark,
      accent: "text-violet-400",
      ring: "ring-violet-400/30",
    },
    {
      label: "حجم الاستردادات",
      en: "Total Refunded Volume",
      value: `${money(data.totalRefundedVolume)} MAD`,
      sub: "طلبات موافق عليها / مدفوعة",
      icon: RotateCcw,
      accent: "text-rose-400",
      ring: "ring-rose-400/30",
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.en} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20 ring-1 ring-inset ring-transparent transition hover:border-slate-700">
          <div className="mb-4 flex items-center justify-between">
            <span className={`grid h-10 w-10 place-items-center rounded-xl bg-slate-800/80 ring-1 ${card.ring}`}>
              <card.icon className={`h-5 w-5 ${card.accent}`} />
            </span>
            <span className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{card.en}</span>
          </div>
          <p className="text-sm text-slate-400">{card.label}</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-slate-100">{card.value}</p>
          <p className="mt-2 text-[11px] text-slate-500">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}