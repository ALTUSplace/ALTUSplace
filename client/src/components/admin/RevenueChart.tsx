import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, Car, Layers } from "lucide-react";
import { useToken } from "@/lib/designTokens";

export type RevenuePoint = {
  key: string;
  label: string;
  gbv: number;
  net: number;
  refunds: number;
  propertyGbv: number;
  carGbv: number;
  propertyNet: number;
  carNet: number;
};

type Filter = "all" | "properties" | "cars";
const money = (value: number) => new Intl.NumberFormat("fr-MA").format(Math.round(value));

const FILTERS: Array<{ key: Filter; label: string; icon: typeof Layers }> = [
  { key: "all", label: "الكل", icon: Layers },
  { key: "properties", label: "العقارات", icon: Building2 },
  { key: "cars", label: "تأجير السيارات", icon: Car },
];

export default function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  // Recharts writes colour to SVG attributes, which cannot evaluate var(), so the
  // series/axis colours are resolved from the CSS tokens at render time. The
  // tooltip is an always-dark surface, so it uses the brand-panel family rather
  // than theme-dependent surfaces.
  const accent = useToken("--accent-primary");
  const success = useToken("--accent-green");
  const axisInk = useToken("--ink-tertiary");
  const gridLine = useToken("--border-default");
  const panel = useToken("--brand-panel");
  const panelLine = useToken("--brand-panel-line");
  const panelInk = useToken("--brand-panel-ink");
  const panelInkMuted = useToken("--brand-panel-ink-2");

  const rows = data.map((point) => {
    const gbv = filter === "properties" ? point.propertyGbv : filter === "cars" ? point.carGbv : point.gbv;
    const net = filter === "properties" ? point.propertyNet : filter === "cars" ? point.carNet : point.net;
    return { month: point.label, gbv, net };
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100 dark:text-[#F1F1F3]">تحليلات الإيرادات</h2>
          <p className="text-xs text-slate-500">Gross Booking Value (GBV) مقابل صافي إيرادات المنصة — آخر 12 شهراً</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-800/80 dark:bg-[#2C2C2E]/80 p-1">
          {FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${filter === key ? "bg-cyan-500 text-slate-950" : "text-slate-400 dark:text-[#B0B0B8] hover:text-slate-200"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72" role="img" aria-label="Revenue chart filtered by asset category">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
            <defs>
              <linearGradient id="gbvFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={gridLine} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: axisInk, fontSize: 11 }} />
            <YAxis yAxisId="gbv" tickLine={false} axisLine={false} tick={{ fill: axisInk, fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <YAxis yAxisId="net" orientation="right" tickLine={false} axisLine={false} tick={{ fill: success, fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip
              contentStyle={{ background: panel, border: `1px solid ${panelLine}`, borderRadius: 12, fontSize: 12, color: panelInk }}
              labelStyle={{ color: panelInkMuted }}
              formatter={(value: number | Array<number>, name: string) => [`${money(Number(value))} MAD`, name === "net" ? "صافي إيرادات المنصة" : "GBV"]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value: string) => <span className="text-ink-tertiary">{value === "net" ? "صافي الإيرادات" : "إجمالي قيمة الحجوزات"}</span>} />
            <Bar yAxisId="gbv" dataKey="gbv" name="GBV" fill="url(#gbvFill)" radius={[6, 6, 0, 0]} maxBarSize={38} />
            <Line yAxisId="net" dataKey="net" name="net" stroke={success} strokeWidth={2.5} dot={false} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}