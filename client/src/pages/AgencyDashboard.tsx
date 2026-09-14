import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CalendarRange,
  Car,
  Check,
  CheckCircle2,
  Eye,
  FileBadge,
  FileCheck2,
  FileText,
  Fuel,
  Gauge,
  Home,
  BedDouble,
  Pencil,
  Plane,
  Plus,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  WalletCards,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AdvancedMediaUpload } from "@/components/AdvancedMediaUpload";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { isPropertyCategory } from "@/lib/categories";

const money = (value: number | string) => `${Number(value).toLocaleString("fr-MA")} درهم`;

const bookingStatusLabel: Record<string, string> = {
  Pending: "قيد الانتظار",
  Confirmed: "مؤكد",
  Cancelled: "ملغي",
};

const statusBadge = (status: string) => {
  const className =
    status === "Confirmed" ? "bg-emerald-600" : status === "Cancelled" ? "bg-red-600 text-white" : "bg-amber-500 text-white";
  return (
    <Badge className={className}>
      {bookingStatusLabel[status] || status}
    </Badge>
  );
};

const residencyBadge = (residency: string | null) => {
  if (residency === "resident") {
    return <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300">مقيم بالمغرب</Badge>;
  }
  if (residency === "foreigner") {
    return <Badge className="bg-sky-100 text-sky-800 border border-sky-300">أجنبي</Badge>;
  }
  return <span className="text-xs text-slate-400">—</span>;
};

type OwnerBookingRow = {
  id: number;
  renterId: number | null;
  listingId: number;
  startDate: string | Date;
  endDate: string | Date;
  totalPrice: number | string;
  commissionFee: number | string | null;
  netProfit: number | string | null;
  status: string;
  createdAt: string | Date | null;
  residency: string | null;
  drivingLicenseKey: string | null;
  drivingLicenseFileName: string | null;
  drivingLicenseMimeType: string | null;
  identityDocumentKey: string | null;
  identityDocumentFileName: string | null;
  identityDocumentMimeType: string | null;
  flightNumber: string | null;
  arrivalTime: string | Date | null;
  listingTitle: string | null;
  renterName: string | null;
  renterEmail: string | null;
};

const documentKindLabel = {
  drivingLicense: "رخصة السياقة (البيرمي)",
  identityDocument: "وثيقة الهوية",
} as const;

const CITIES = ["مراكش", "أغادير", "الدار البيضاء", "طنجة", "الرباط", "فاس"] as const;

const TRANSMISSION_OPTIONS = ["أوتوماتيك", "يدوي (عادي)"] as const;

const FUEL_OPTIONS = ["ديزل", "بنزين", "بنزين وديزل", "هجين", "كهربائي"] as const;

type FleetStatus = "Available" | "Booked" | "Maintenance";
type FleetServerStatus = "Available" | "Rented" | "Maintenance";

const fleetStatusLabel: Record<FleetStatus, string> = {
  Available: "متاحة",
  Booked: "محجوزة",
  Maintenance: "في الصيانة",
};

const toFleetStatus = (serverStatus: string): FleetStatus => {
  if (serverStatus === "Rented") return "Booked";
  if (serverStatus === "Maintenance") return "Maintenance";
  return "Available";
};

const toServerStatus = (status: FleetStatus): FleetServerStatus =>
  status === "Booked" ? "Rented" : status;

type FleetCar = {
  id: number;
  title: string | null;
  category: string;
  pricePerDay: number;
  imageUrl: string | null;
  status: string;
  city: string | null;
  fuelType: string | null;
  transmission: string | null;
  description: string | null;
  propertyType?: string | null;
  pricePerMonth?: number | null;
  rooms?: number | null;
  createdAt: string | Date | null;
};

type CarForm = {
  title: string;
  city: string;
  price: string;
  transmission: string;
  fuelType: string;
  description: string;
};

const emptyCarForm: CarForm = {
  title: "",
  city: "مراكش",
  price: "",
  transmission: "أوتوماتيك",
  fuelType: "ديزل",
  description: "",
};

const PROPERTY_TYPE_OPTIONS = ["شقة", "فيلا", "منزل", "مكتب", "محل تجاري", "أرض"] as const;

type PropertyForm = {
  title: string;
  city: string;
  price: string;
  monthlyPrice: string;
  propertyType: string;
  rooms: string;
  description: string;
};

const emptyPropertyForm: PropertyForm = {
  title: "",
  city: "مراكش",
  price: "",
  monthlyPrice: "",
  propertyType: "شقة",
  rooms: "",
  description: "",
};

function daysBetween(start: string | Date, end: string | Date): number {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function DocumentPreview({ src, mime, fileName }: { src: string; mime: string; fileName: string }) {
  const isImage = mime?.startsWith("image/");
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300" dir="ltr">
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{fileName}</span>
        </p>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <Eye className="h-3.5 w-3.5" />
          فتح في نافذة جديدة
        </a>
      </div>
      <div className="max-h-80 overflow-auto rounded-lg bg-white dark:bg-slate-950">
        {isImage ? (
          <img src={src} alt={fileName} className="mx-auto max-h-80 w-auto object-contain" />
        ) : (
          <iframe src={src} title={fileName} className="h-80 w-full" />
        )}
      </div>
    </div>
  );
}

function FinancialAnalytics({ bookings }: { bookings: OwnerBookingRow[] }) {
  const confirmed = bookings.filter((booking) => booking.status === "Confirmed");
  const pending = bookings.filter((booking) => booking.status === "Pending");
  const grossRevenue = confirmed.reduce((sum, booking) => sum + Number(booking.totalPrice ?? 0), 0);
  const netRevenue = confirmed.reduce((sum, booking) => sum + Number(booking.netProfit ?? 0), 0);
  const platformFees = Math.max(0, grossRevenue - netRevenue);
  const pendingEstimate = pending.reduce((sum, booking) => sum + Number(booking.totalPrice ?? 0), 0);
  const activeRentals = confirmed.filter((booking) => {
    const now = Date.now();
    return new Date(booking.startDate).getTime() <= now && now < new Date(booking.endDate).getTime();
  }).length;

  const monthly = useMemo(() => {
    const now = new Date();
    const series: { label: string; revenue: number; rentals: number }[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
      const monthConfirmed = confirmed.filter((booking) => {
        const start = new Date(booking.startDate);
        return start >= monthStart && start < nextMonth;
      });
      series.push({
        label: monthStart.toLocaleDateString("ar-MA", { month: "short", year: "2-digit" }),
        revenue: monthConfirmed.reduce((sum, booking) => sum + Number(booking.totalPrice ?? 0), 0),
        rentals: monthConfirmed.length,
      });
    }
    return series;
  }, [confirmed]);

  const breakdown = useMemo(() => {
    const total = bookings.length || 1;
    return [
      { key: "completed", label: "إيجارات مكتملة", count: confirmed.length, value: grossRevenue, pct: Math.round((confirmed.length / total) * 100), color: "bg-emerald-500" },
      { key: "pending", label: "طلبات قيد الانتظار", count: pending.length, value: pendingEstimate, pct: Math.round((pending.length / total) * 100), color: "bg-amber-400" },
    ];
  }, [bookings.length, confirmed.length, pending.length, grossRevenue, pendingEstimate]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: "إيرادات مؤكدة (إجمالي)", value: money(grossRevenue), icon: WalletCards, tone: "text-emerald-600" },
          { label: "صافي الإيرادات", value: money(netRevenue), icon: TrendingUp, tone: "text-[#102d2b]" },
          { label: "عمولات المنصة", value: money(platformFees), icon: BarChart3, tone: "text-sky-600" },
          { label: "حجوزات نشطة (جارية)", value: String(activeRentals), icon: Car, tone: "text-violet-600" },
          { label: "تقديرات قيد الانتظار", value: money(pendingEstimate), icon: CalendarDays, tone: "text-amber-600" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border bg-card p-4 shadow-sm">
            <Icon className={`h-5 w-5 ${tone}`} />
            <p className="mt-2 truncate text-sm font-semibold text-muted-foreground">{label}</p>
            <p className="truncate font-black text-lg">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#0e5b52]" />
            <div>
              <h3 className="font-bold">الإيرادات الشهرية (درهم)</h3>
              <p className="text-xs text-muted-foreground">آخر 6 أشهر حسب بداية فترة الحجز المؤكدة</p>
            </div>
          </div>
          {monthly.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(value: number) => `${Math.round(Number(value) / 1000)}k`} width={40} />
                  <Tooltip formatter={(value: number) => [money(Number(value)), "الإيرادات"]} cursor={{ fill: "rgba(16,45,43,0.06)" }} />
                  <Bar dataKey="revenue" fill="#0e5b52" radius={[6, 6, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
              لا توجد إيرادات مؤكدة بعد.
            </div>
          )}
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#0e5b52]" />
            <div>
              <h3 className="font-bold">مكتملة مقابل قيد الانتظار</h3>
              <p className="text-xs text-muted-foreground">تفصيل حسب حالة الطلب</p>
            </div>
          </div>
          <div className="space-y-4">
            {breakdown.map((item) => (
              <div key={item.key} className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-bold">{item.label}</span>
                  <span className="text-muted-foreground">{money(item.value)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{item.count} حجز</span>
                  <span>· {item.pct}%</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-dashed p-4 text-xs leading-relaxed text-muted-foreground">
              يؤكد فحص وثائق البيرمي وCIN قبل القبول، فيتقرر انتقال الحجز من «قيد الانتظار» إلى «مؤكد» وخضوعه لعمولة المنصة.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const WEEKDAY_SHORT = ["أح", "اث", "ثل", "أر", "خم", "جم", "سب"];

function ScheduleCalendar({ bookings, cars }: { bookings: OwnerBookingRow[]; cars: FleetCar[] }) {
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: Date[] = Array.from({ length: daysInMonth }, (_, index) => new Date(year, month, index + 1));

  const carTitleById = useMemo(() => {
    const map = new Map<number, string>();
    cars.forEach((car) => map.set(car.id, car.title ?? `سيارة ${car.id}`));
    return map;
  }, [cars]);

  const maintenanceIds = useMemo(
    () => new Set<number>(cars.filter((car) => toFleetStatus(car.status) === "Maintenance").map((car) => car.id)),
    [cars],
  );

  const activeBookings = useMemo(
    () => bookings.filter((booking) => booking.status === "Pending" || booking.status === "Confirmed"),
    [bookings],
  );

  const coverage = useMemo(() => {
    const map = new Map<number, Map<string, { count: number; confirmed: boolean }>>();
    for (const booking of activeBookings) {
      const listingId = booking.listingId;
      const from = midnight(new Date(booking.startDate));
      const to = midnight(new Date(booking.endDate));
      if (to <= from) continue;
      let day = from.getTime() > monthStart.getTime() ? from : monthStart;
      while (day < monthEnd && day < to) {
        const current = map.get(listingId);
        const perDate = current ?? new Map<string, { count: number; confirmed: boolean }>();
        const slot = perDate.get(dayKey(day)) ?? { count: 0, confirmed: false };
        slot.count += 1;
        if (booking.status === "Confirmed") slot.confirmed = true;
        perDate.set(dayKey(day), slot);
        map.set(listingId, perDate);
        day = new Date(day.getTime() + 86400000);
      }
    }
    return map;
  }, [activeBookings, monthStart, monthEnd]);

  const rows = useMemo(() => {
    const ids = new Set<number>(coverage.keys());
    maintenanceIds.forEach((id) => ids.add(id));
    return Array.from(ids)
      .map((id) => ({ id, title: carTitleById.get(id) ?? `سيارة #${id}` }))
      .sort((a, b) => a.title.localeCompare(b.title, "ar"));
  }, [coverage, carTitleById, maintenanceIds]);

  const today = midnight(new Date());
  const monthLabel = cursor.toLocaleDateString("ar-MA", { month: "long", year: "numeric" });
  const weekend = (date: Date) => date.getDay() === 5 || date.getDay() === 6;

  return (
    <div className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-[#0e5b52]" />
          <div>
            <h3 className="font-bold">جدول الحجوزات التفاعلي</h3>
            <p className="text-xs text-muted-foreground">مؤكد (أخضر) · قيد الانتظار (كهرماني) · تعارض محتمل (أحمر) · صيانة محجوبة (بنفسجي)</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            السابق
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>
            {monthLabel}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            التالي
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          لا توجد حجوزات نشطة في هذا الشهر.
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[1120px]">
            <div className="flex">
              <div className="w-40 shrink-0 px-2 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                السيارة / التاريخ
              </div>
              <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${daysInMonth}, minmax(0, 1fr))` }}>
                {days.map((date) => {
                  const isTodayHeader =
                    date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
                  return (
                    <div key={`h-${dayKey(date)}`} className="py-0.5 text-center">
                      <div className={`text-[11px] font-black ${weekend(date) ? "text-slate-400 dark:text-slate-600" : "text-slate-600 dark:text-slate-300"}`}>
                        {date.getDate()}
                      </div>
                      <div className={`text-[8px] leading-tight ${isTodayHeader ? "font-bold text-[#0e5b52]" : "text-slate-300 dark:text-slate-600"}`}>
                        {WEEKDAY_SHORT[date.getDay()]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-1 divide-y rounded-xl border">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center">
                  <div className="w-40 shrink-0 truncate px-2 py-2 text-xs font-bold">{row.title}</div>
                  <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${daysInMonth}, minmax(0, 1fr))` }}>
                    {days.map((date) => {
                      const slot = coverage.get(row.id)?.get(dayKey(date));
                      const isToday = dayKey(date) === dayKey(today);
                      const isWeekend = weekend(date);
                      let cellClass = "bg-slate-50 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400";
                      let titleText = "";
                      const isMaintenance = maintenanceIds.has(row.id);
                      if (isMaintenance) {
                        cellClass = "bg-violet-200/80 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200";
                        titleText = "في الصيانة — الفترة محجوبة تلقائياً";
                      } else if (slot) {
                        const activeList = activeBookings.filter(
                          (booking) =>
                            booking.listingId === row.id &&
                            date >= midnight(new Date(booking.startDate)) &&
                            date < midnight(new Date(booking.endDate)),
                        );
                        titleText = activeList
                          .map((booking) => `BK-${booking.id} · ${booking.status === "Confirmed" ? "مؤكد" : "قيد الانتظار"} · ${new Date(booking.startDate).toLocaleDateString("ar-MA")} → ${new Date(booking.endDate).toLocaleDateString("ar-MA")}`)
                          .join("\n");
                        if (slot.count >= 2) {
                          cellClass = "bg-rose-500 text-white font-black ring-2 ring-rose-300";
                        } else if (slot.confirmed) {
                          cellClass = "bg-emerald-500 text-white";
                        } else {
                          cellClass = "bg-amber-400 text-white";
                        }
                      }
                      if (isWeekend && !slot && !isMaintenance) cellClass = "bg-slate-100/60 text-slate-300 dark:bg-slate-800/60 dark:text-slate-600";
                      if (isToday) cellClass += " ring-2 ring-inset ring-[#0e5b52]/60";
                      return (
                        <div
                          key={dayKey(date)}
                          title={titleText || undefined}
                          className={`m-0.5 flex h-7 items-center justify-center rounded-md text-[10px] font-semibold transition ${cellClass}`}
                        >
                          {date.getDate()}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-emerald-500" /> مؤكد</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-amber-400" /> قيد الانتظار</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-rose-500" /> تعارض (تداخل)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-violet-400" /> في الصيانة (محجوب)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded border-2 border-[#0e5b52]/50" /> اليوم</span>
      </div>
    </div>
  );
}

type ActivityItem = {
  id: number;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  beforeData: string | null;
  afterData: string | null;
  createdAt: string | Date | null;
};

const activityMeta: Record<string, { label: string; icon: typeof Activity; cls: string }> = {
  "booking.approved": { label: "قبول الحجز", icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700" },
  "booking.rejected": { label: "رفض الحجز", icon: XCircle, cls: "bg-red-100 text-red-700" },
  "listing.price_changed": { label: "تغيير سعر السيارة", icon: TrendingUp, cls: "bg-amber-100 text-amber-700" },
  "listing.updated": { label: "تحديث بيانات السيارة", icon: Pencil, cls: "bg-slate-100 text-slate-700" },
  "listing.created": { label: "إضافة سيارة جديدة", icon: Car, cls: "bg-emerald-100 text-emerald-700" },
  "listing.availability.updated": { label: "تحديث حالة التوفر", icon: Wrench, cls: "bg-sky-100 text-sky-700" },
  "listing.fleet_status.updated": { label: "تحديث حالة السيارة", icon: Wrench, cls: "bg-violet-100 text-violet-700" },
  "listing.resubmitted": { label: "إعادة إرسال إعلان", icon: RefreshCw, cls: "bg-amber-100 text-amber-700" },
  "listing.moderated": { label: "مراجعة الإعلان", icon: ShieldCheck, cls: "bg-slate-100 text-slate-700" },
  "agency.settings.updated": { label: "تحديث بيانات الوكالة", icon: Building2, cls: "bg-slate-100 text-slate-700" },
};

function ActivityLog({ items }: { items: ActivityItem[] }) {
  const describe = (item: ActivityItem) => {
    if (item.action === "booking.approved" || item.action === "booking.rejected") {
      const after = item.afterData ? (() => { try { return JSON.parse(item.afterData) as { listingTitle?: string }; } catch { return {} as { listingTitle?: string }; } })() : null;
      return `الحجز #${item.entityId ?? ""}${after?.listingTitle ? ` · ${after.listingTitle}` : ""}`;
    }
    if (item.action === "listing.price_changed") {
      let before: number | undefined;
      let after: number | undefined;
      try { before = item.beforeData ? (JSON.parse(item.beforeData) as { pricePerDay?: number }).pricePerDay : undefined; } catch { /* ignore */ }
      try { after = item.afterData ? (JSON.parse(item.afterData) as { pricePerDay?: number }).pricePerDay : undefined; } catch { /* ignore */ }
      if (before !== undefined && after !== undefined && before !== after) {
        return `الإعلان #${item.entityId ?? ""} · ${money(before)} → ${money(after)}`;
      }
      return `الإعلان #${item.entityId ?? ""}`;
    }
    return `${item.entityType}${item.entityId ? ` #${item.entityId}` : ""}`;
  };

  return (
    <div className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5 text-[#0e5b52]" />
        <div>
          <h3 className="font-bold">سجل نشاط الوكالة</h3>
          <p className="text-xs text-muted-foreground">قرارات الحجوزات وتغييرات الأسعار ومراجعات الوثائق</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          لا توجد أحداث بعد — ستبدأ الأحداث بالظهور هنا عند قبول الحجوزات أو تعديل الأسعار.
        </div>
      ) : (
        <ul className="max-h-[560px] space-y-2 overflow-y-auto pe-1">
          {items.slice(0, 40).map((item) => {
            const meta = activityMeta[item.action] ?? { label: item.action, icon: Activity, cls: "bg-slate-100 text-slate-700" };
            const Icon = meta.icon;
            return (
              <li key={item.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${meta.cls}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold">{meta.label}</p>
                    <time className="text-[11px] text-muted-foreground">{new Date(item.createdAt ?? 0).toLocaleString("ar-MA")}</time>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{describe(item)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function AgencyDashboard() {
  const { user } = useAuth();
  const bookings = trpc.bookings.ownerList.useQuery(undefined, { enabled: !!user });
  const overview = trpc.agency.overview.useQuery(undefined, { enabled: !!user });
  const fleet = trpc.listings.mine.useQuery(undefined, { enabled: !!user });
  const activity = trpc.agency.recentActivity.useQuery(undefined, { enabled: !!user });
  const updateStatus = trpc.bookings.ownerUpdateStatus.useMutation({
    onSuccess: () => {
      bookings.refetch();
      toast.success("تم تحديث حالة الحجز.");
    },
    onError: (error) => toast.error(error.message),
  });
  const createCar = trpc.listings.create.useMutation({
    onSuccess: () => {
      fleet.refetch();
      closeActiveForm();
      toast.success("تم نشر الإعلان بعد اجتياز فحص الصور.");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateCar = trpc.listings.update.useMutation({
    onSuccess: () => {
      fleet.refetch();
      closeActiveForm();
      toast.success("تم تحديث بيانات الإعلان.");
    },
    onError: (error) => toast.error(error.message),
  });
  const setFleetStatus = trpc.listings.setFleetStatus.useMutation({
    onSuccess: () => {
      fleet.refetch();
      toast.success("تم تحديث حالة الإعلان.");
    },
    onError: (error) => toast.error(error.message),
  });
  const generateContract = trpc.rentalContracts.createForBooking.useMutation({
    onSuccess: (result) => {
      if (result.pdfUrl) window.open(result.pdfUrl, "_blank", "noopener,noreferrer");
      toast.success("تم توليد عقد كراء السيارة (Contrat de Location) وحفظه في التخزين الآمن.");
    },
    onError: (error) => toast.error(error.message),
  });

  const [docBooking, setDocBooking] = useState<OwnerBookingRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "Pending" | "Confirmed" | "Cancelled">("all");

  const [carFormOpen, setCarFormOpen] = useState(false);
  const [editingCar, setEditingCar] = useState<FleetCar | null>(null);
  const [carForm, setCarForm] = useState<CarForm>(emptyCarForm);
  const [carImageUrl, setCarImageUrl] = useState("");
  const [carImageProof, setCarImageProof] = useState("");

  const [propertyFormOpen, setPropertyFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<FleetCar | null>(null);
  const [propertyForm, setPropertyForm] = useState<PropertyForm>(emptyPropertyForm);
  const [propertyImageUrl, setPropertyImageUrl] = useState("");
  const [propertyImageProof, setPropertyImageProof] = useState("");

  const closeCarForm = () => {
    setCarFormOpen(false);
    setEditingCar(null);
    setCarForm(emptyCarForm);
    setCarImageUrl("");
    setCarImageProof("");
  };

  const closePropertyForm = () => {
    setPropertyFormOpen(false);
    setEditingProperty(null);
    setPropertyForm(emptyPropertyForm);
    setPropertyImageUrl("");
    setPropertyImageProof("");
  };

  const closeActiveForm = () => {
    closeCarForm();
    closePropertyForm();
  };

  const rows: OwnerBookingRow[] = useMemo(() => bookings.data ?? [], [bookings.data]);
  const filtered = useMemo(
    () => (statusFilter === "all" ? rows : rows.filter((booking) => booking.status === statusFilter)),
    [rows, statusFilter],
  );

  const pendingCount = rows.filter((booking) => booking.status === "Pending").length;
  const activeCount = rows.filter((booking) => booking.status === "Pending" || booking.status === "Confirmed").length;
  const confirmedRevenue = rows
    .filter((booking) => booking.status === "Confirmed")
    .reduce((sum, booking) => sum + Number(booking.totalPrice ?? 0), 0);
  const docsCount = rows.filter((booking) => booking.drivingLicenseKey && booking.identityDocumentKey).length;

  const cars: FleetCar[] = useMemo(
    () => (fleet.data ?? []).filter((car) => car.category === "car" || car.category.includes("سيارة")).map((car) => ({ ...car })),
    [fleet.data],
  );
  const properties: FleetCar[] = useMemo(
    () => (fleet.data ?? []).filter((item) => isPropertyCategory(item.category)).map((item) => ({ ...item })),
    [fleet.data],
  );
  const propertyCounts = useMemo(() => {
    const counts = { available: 0, rented: 0, maintenance: 0 };
    for (const property of properties) {
      if (property.status === "Maintenance") counts.maintenance += 1;
      else if (property.status === "Rented") counts.rented += 1;
      else counts.available += 1;
    }
    return counts;
  }, [properties]);
  const propertyAvgDaily = useMemo(
    () => (properties.length ? Math.round(properties.reduce((sum, property) => sum + Number(property.pricePerDay ?? 0), 0) / properties.length) : 0),
    [properties],
  );
  const propertyAvgMonthly = useMemo(
    () => {
      const withMonthly = properties.filter((property) => Number(property.pricePerMonth) > 0);
      return withMonthly.length ? Math.round(withMonthly.reduce((sum, property) => sum + Number(property.pricePerMonth), 0) / withMonthly.length) : 0;
    },
    [properties],
  );
  const fleetCounts = useMemo(() => {
    const counts = { available: 0, booked: 0, maintenance: 0 };
    for (const car of cars) {
      const status = toFleetStatus(car.status);
      if (status === "Maintenance") counts.maintenance += 1;
      else if (status === "Booked") counts.booked += 1;
      else counts.available += 1;
    }
    return counts;
  }, [cars]);
  const avgPrice = useMemo(
    () => (cars.length ? Math.round(cars.reduce((sum, car) => sum + Number(car.pricePerDay ?? 0), 0) / cars.length) : 0),
    [cars],
  );

  const isOwner = user?.role === "owner" || user?.role === "admin" || user?.role === "SUPER_ADMIN";
  if (user && !isOwner) {
    return (
      <div className="container py-24 text-center space-y-4">
        <h1 className="text-2xl font-bold">هذه اللوحة مخصصة لوكالات التأجير</h1>
        <p className="text-sm text-muted-foreground">تسجيل الدخول بحساب وكالة للاطلاع على الحجوزات والوثائق.</p>
        <Link href="/my-bookings">
          <Button className="mt-2">الانتقال إلى حجوزاتي</Button>
        </Link>
      </div>
    );
  }

  const confirm = (bookingId: number) => {
    if (!window.confirm("هل تؤكد هذا الحجز بعد فحص وثائق المستأجر؟")) return;
    updateStatus.mutate({ bookingId, status: "Confirmed" });
  };
  const decline = (bookingId: number) => {
    if (!window.confirm("هل تريد رفض هذا الحجز؟")) return;
    updateStatus.mutate({ bookingId, status: "Cancelled" });
  };

  const openDocsEnabled = !!docBooking && (docBooking.drivingLicenseKey || docBooking.identityDocumentKey);

  const openAddCar = () => {
    setEditingCar(null);
    setCarForm(emptyCarForm);
    setCarImageUrl("");
    setCarImageProof("");
    setCarFormOpen(true);
  };

  const openEditCar = (car: FleetCar) => {
    setEditingCar(car);
    setCarForm({
      title: car.title ?? "",
      city: (CITIES as readonly string[]).includes(car.city ?? "") ? (car.city as string) : "مراكش",
      price: String(car.pricePerDay ?? ""),
      transmission: car.transmission ?? "أوتوماتيك",
      fuelType: car.fuelType ?? "ديزل",
      description: car.description ?? "",
    });
    setCarImageUrl("");
    setCarImageProof("");
    setCarFormOpen(true);
  };

  const submitCar = (event: React.FormEvent) => {
    event.preventDefault();
    const numericPrice = Number(carForm.price);
    if (!carForm.title.trim()) {
      toast.error("يرجى إدخال موديل السيارة (مثال: Renault Clio).");
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      toast.error("يرجى إدخال سعر يومي بالدرهم أكبر من صفر.");
      return;
    }
    if (editingCar) {
      updateCar.mutate({
        id: editingCar.id,
        title: carForm.title.trim(),
        city: carForm.city,
        pricePerDay: numericPrice,
        description: carForm.description.trim() || undefined,
        transmission: carForm.transmission,
        fuelType: carForm.fuelType,
        ...(carImageUrl && carImageProof ? { imageUrl: carImageUrl, imageVerificationProof: carImageProof } : {}),
      });
      return;
    }
    if (!carImageUrl || !carImageProof) {
      toast.error("يرجى رفع صورة أصلية للسيارة واجتياز الفحص قبل إضافتها.");
      return;
    }
    createCar.mutate({
      title: carForm.title.trim(),
      category: "car",
      city: carForm.city,
      pricePerDay: numericPrice,
      description: carForm.description.trim() || undefined,
      fuelType: carForm.fuelType,
      transmission: carForm.transmission,
      imageUrl: carImageUrl,
      imageVerificationProof: carImageProof,
    });
  };

  const changeCarStatus = (car: FleetCar, next: FleetStatus) => {
    if (next === toFleetStatus(car.status)) return;
    setFleetStatus.mutate({ listingId: car.id, status: toServerStatus(next) });
  };

  const openAddProperty = () => {
    setEditingProperty(null);
    setPropertyForm(emptyPropertyForm);
    setPropertyImageUrl("");
    setPropertyImageProof("");
    setPropertyFormOpen(true);
  };

  const openEditProperty = (property: FleetCar) => {
    setEditingProperty(property);
    setPropertyForm({
      title: property.title ?? "",
      city: (CITIES as readonly string[]).includes(property.city ?? "") ? (property.city as string) : "مراكش",
      price: String(property.pricePerDay ?? ""),
      monthlyPrice: String(property.pricePerMonth ?? ""),
      propertyType: property.propertyType ?? "شقة",
      rooms: String(property.rooms ?? ""),
      description: property.description ?? "",
    });
    setPropertyImageUrl("");
    setPropertyImageProof("");
    setPropertyFormOpen(true);
  };

  const submitProperty = (event: React.FormEvent) => {
    event.preventDefault();
    const numericPrice = Number(propertyForm.price);
    const numericMonthly = propertyForm.monthlyPrice.trim() ? Number(propertyForm.monthlyPrice) : 0;
    if (!propertyForm.title.trim()) {
      toast.error("يرجى إدخال عنوان العقار (مثال: شقة فاخرة بحي المعاريف).");
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      toast.error("يرجى إدخال سعر يومي بالدرهم أكبر من صفر.");
      return;
    }
    if (propertyForm.monthlyPrice.trim() && (!Number.isFinite(numericMonthly) || numericMonthly <= 0)) {
      toast.error("يرجى إدخال سعر شهري صحيح بالدرهم.");
      return;
    }
    const roomsCount = Number(propertyForm.rooms) || 0;
    if (propertyForm.rooms.trim() && (!Number.isInteger(roomsCount) || roomsCount < 0)) {
      toast.error("يرجى إدخال عدد غرف صحيح.");
      return;
    }
    if (editingProperty) {
      updateCar.mutate({
        id: editingProperty.id,
        title: propertyForm.title.trim(),
        city: propertyForm.city,
        pricePerDay: numericPrice,
        pricePerMonth: numericMonthly > 0 ? numericMonthly : null,
        propertyType: propertyForm.propertyType,
        rooms: propertyForm.rooms.trim() ? roomsCount : undefined,
        description: propertyForm.description.trim() || undefined,
        ...(propertyImageUrl && propertyImageProof ? { imageUrl: propertyImageUrl, imageVerificationProof: propertyImageProof } : {}),
      });
      return;
    }
    if (!propertyImageUrl || !propertyImageProof) {
      toast.error("يرجى رفع صورة أصلية للعقار واجتياز الفحص قبل إضافته.");
      return;
    }
    createCar.mutate({
      title: propertyForm.title.trim(),
      category: "property",
      city: propertyForm.city,
      pricePerDay: numericPrice,
      pricePerMonth: numericMonthly > 0 ? numericMonthly : undefined,
      propertyType: propertyForm.propertyType,
      rooms: propertyForm.rooms.trim() ? roomsCount : undefined,
      description: propertyForm.description.trim() || undefined,
      imageUrl: propertyImageUrl,
      imageVerificationProof: propertyImageProof,
    });
  };

  const changePropertyStatus = (property: FleetCar, next: FleetStatus) => {
    if (next === toFleetStatus(property.status)) return;
    setFleetStatus.mutate({ listingId: property.id, status: toServerStatus(next) });
  };

  const propertyBusy = createCar.isPending || updateCar.isPending;
  const carBusy = createCar.isPending || updateCar.isPending;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 rounded-3xl bg-[#102d2b] p-6 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-amber-400">
            <Building2 className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">ALTUSplace / AGENCY DESK</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">لوحة وكالة التأجير</h1>
          <p className="mt-2 max-w-xl text-sm text-emerald-100/70">
            تتبّع طلبات الحجز وراجع وثائق المستأجر (البيرمي وCIN/جواز السفر)، وأدر أسطول سياراتك وعقاراتك وأسعارها اليومية والشهرية.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-white/25 bg-transparent text-white hover:bg-white/10"
            onClick={() => {
              bookings.refetch();
              fleet.refetch();
            }}
          >
            <RefreshCw className="ml-2 h-4 w-4" />
            تحديث
          </Button>
          <Link href="/host">
            <Button variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10">
              <ArrowRight className="ml-2 h-4 w-4" />
              لوحة المكاتب
            </Button>
          </Link>
        </div>
      </header>

      <Tabs defaultValue="bookings" dir="rtl">
        <TabsList className="w-full justify-start rounded-2xl border bg-card p-1 sm:w-auto">
          <TabsTrigger value="bookings">الحجوزات والتحقق من الوثائق</TabsTrigger>
          <TabsTrigger value="fleet">الأسطول والأسعار</TabsTrigger>
          <TabsTrigger value="properties">العقارات</TabsTrigger>
          <TabsTrigger value="insights">التحليلات والتقارير</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "حجوزات قيد الانتظار", value: String(pendingCount), icon: CalendarDays, tone: "text-amber-600" },
              { label: "طلبات نشطة", value: String(activeCount), icon: ShieldCheck, tone: "text-sky-600" },
              { label: "إيرادات مؤكدة", value: money(confirmedRevenue), icon: WalletCards, tone: "text-emerald-600" },
              { label: "حجوزات مع وثائق", value: String(docsCount), icon: FileCheck2, tone: "text-violet-600" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="rounded-2xl border bg-card p-4 shadow-sm">
                <Icon className={`h-5 w-5 ${tone}`} />
                <p className="mt-2 truncate text-sm font-semibold text-muted-foreground">{label}</p>
                <p className="truncate font-black text-lg">{value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">طلبات الحجز والوثائق</h2>
                <p className="text-sm text-muted-foreground">
                  {overview.data?.totalListings ?? 0} إعلاناً · {rows.length} طلباً إجمالاً
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "Pending", "Confirmed", "Cancelled"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={statusFilter === value ? "default" : "outline"}
                    onClick={() => setStatusFilter(value)}
                  >
                    {value === "all" ? "الكل" : bookingStatusLabel[value]}
                  </Button>
                ))}
              </div>
            </div>

            {bookings.isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">جاري تحميل الحجوزات...</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
                لا توجد حجوزات {statusFilter !== "all" ? "بهذه الحالة" : ""} حالياً.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-right text-sm">
                  <thead>
                    <tr className="border-b text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5">الطلب</th>
                      <th className="px-3 py-2.5">العميل</th>
                      <th className="px-3 py-2.5">الإعلان</th>
                      <th className="px-3 py-2.5">المدة</th>
                      <th className="px-3 py-2.5">الإقامة</th>
                      <th className="px-3 py-2.5">الإجمالي</th>
                      <th className="px-3 py-2.5">الحالة</th>
                      <th className="px-3 py-2.5">الوثائق</th>
                      <th className="px-3 py-2.5">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((booking) => (
                      <tr key={booking.id} className="align-middle hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <td className="px-3 py-3 font-mono font-bold">BK-{booking.id}</td>
                        <td className="px-3 py-3">
                          <p className="font-bold">{booking.renterName ?? "مستأجر"}</p>
                          {booking.renterEmail && (
                            <p className="text-[11px] text-muted-foreground" dir="ltr">
                              {booking.renterEmail}
                            </p>
                          )}
                          {booking.flightNumber && (
                            <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                              <Plane className="h-3 w-3" />
                              {booking.flightNumber}
                              {booking.arrivalTime
                                ? ` · ${new Date(booking.arrivalTime).toLocaleString("ar-MA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
                                : ""}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <p className="max-w-48 truncate font-semibold">{booking.listingTitle ?? `الإعلان #${booking.listingId}`}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium">
                            {new Date(booking.startDate).toLocaleDateString("ar-MA")} ←{" "}
                            {new Date(booking.endDate).toLocaleDateString("ar-MA")}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {daysBetween(booking.startDate, booking.endDate)} يوم
                          </p>
                        </td>
                        <td className="px-3 py-3">{residencyBadge(booking.residency)}</td>
                        <td className="px-3 py-3 font-bold">{money(booking.totalPrice)}</td>
                        <td className="px-3 py-3">{statusBadge(booking.status)}</td>
                        <td className="px-3 py-3">
                          {booking.drivingLicenseKey ? (
                            <Button size="sm" variant="outline" onClick={() => setDocBooking(booking)}>
                              <Eye className="ml-1 h-3.5 w-3.5" />
                              عرض الوثائق
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">غير مرفقة</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {booking.status === "Pending" ? (
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => confirm(booking.id)} disabled={updateStatus.isPending}>
                                <Check className="ml-1 h-4 w-4" />
                                قبول
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => decline(booking.id)} disabled={updateStatus.isPending}>
                                <X className="ml-1 h-4 w-4" />
                                رفض
                              </Button>
                            </div>
                          ) : booking.status === "Confirmed" ? (
                            <Button size="sm" variant="outline" onClick={() => generateContract.mutate({ bookingId: booking.id })} disabled={generateContract.isPending}>
                              <FileText className="ml-1 h-3.5 w-3.5" />
                              عقد PDF
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="fleet" className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "إجمالي السيارات", value: String(cars.length), icon: Car, tone: "text-[#102d2b]" },
              { label: "متاحة الآن", value: String(fleetCounts.available), icon: ShieldCheck, tone: "text-emerald-600" },
              { label: "محجوزة", value: String(fleetCounts.booked), icon: CalendarDays, tone: "text-sky-600" },
              { label: "في الصيانة", value: String(fleetCounts.maintenance), icon: Wrench, tone: "text-amber-600" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="rounded-2xl border bg-card p-4 shadow-sm">
                <Icon className={`h-5 w-5 ${tone}`} />
                <p className="mt-2 truncate text-sm font-semibold text-muted-foreground">{label}</p>
                <p className="truncate font-black text-lg">{value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">الأسطول والأسعار اليومية</h2>
                <p className="text-sm text-muted-foreground">
                  {cars.length} سيارة · متوسط السعر <span className="font-bold text-foreground">{money(avgPrice)}</span> في اليوم
                </p>
              </div>
              <Button type="button" onClick={openAddCar}>
                <Plus className="ml-1 h-4 w-4" />
                إضافة سيارة
              </Button>
            </div>

            {fleet.isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">جاري تحميل الأسطول...</div>
            ) : cars.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
                أضف سيارتك الأولى (Renault Clio، Dacia Sandero، ...) لتظهر في إعلانات تأجير السيارات.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-right text-sm">
                  <thead>
                    <tr className="border-b text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5">السيارة</th>
                      <th className="px-3 py-2.5">الموديل</th>
                      <th className="px-3 py-2.5">المدينة</th>
                      <th className="px-3 py-2.5">ناقل الحركة</th>
                      <th className="px-3 py-2.5">الوقود</th>
                      <th className="px-3 py-2.5">السعر / يوم</th>
                      <th className="px-3 py-2.5">الحالة</th>
                      <th className="px-3 py-2.5">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cars.map((car) => {
                      const status = toFleetStatus(car.status);
                      return (
                        <tr key={car.id} className="align-middle hover:bg-slate-50 dark:hover:bg-slate-900/40">
                          <td className="px-3 py-3">
                            {car.imageUrl ? (
                              <img
                                src={car.imageUrl}
                                alt={car.title ?? `سيارة ${car.id}`}
                                className="h-12 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                              />
                            ) : (
                              <div className="flex h-12 w-16 items-center justify-center rounded-lg border border-dashed text-slate-300">
                                <Car className="h-5 w-5" />
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <p className="max-w-56 truncate font-bold">{car.title}</p>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{car.city}</td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Gauge className="h-3.5 w-3.5" />
                              {car.transmission}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Fuel className="h-3.5 w-3.5" />
                              {car.fuelType}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-bold">{money(car.pricePerDay)}</td>
                          <td className="px-3 py-3">
                            {status === "Booked" ? (
                              <Badge className="bg-sky-600">{fleetStatusLabel[status]}</Badge>
                            ) : status === "Maintenance" ? (
                              <Badge className="bg-amber-500 text-white">{fleetStatusLabel[status]}</Badge>
                            ) : (
                              <Badge className="bg-emerald-600">{fleetStatusLabel[status]}</Badge>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                aria-label="حالة السيارة"
                                value={status}
                                onChange={(event) => changeCarStatus(car, event.target.value as FleetStatus)}
                                className="rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold"
                                disabled={setFleetStatus.isPending}
                              >
                                {(Object.keys(fleetStatusLabel) as FleetStatus[]).map((option) => (
                                  <option key={option} value={option}>
                                    {fleetStatusLabel[option]}
                                  </option>
                                ))}
                              </select>
                              <Button size="sm" variant="outline" onClick={() => openEditCar(car)}>
                                <Pencil className="ml-1 h-3.5 w-3.5" />
                                تعديل
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="properties" className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "إجمالي العقارات", value: String(properties.length), icon: Home, tone: "text-[#102d2b]" },
              { label: "متاحة الآن", value: String(propertyCounts.available), icon: ShieldCheck, tone: "text-emerald-600" },
              { label: "مؤجّرة", value: String(propertyCounts.rented), icon: CalendarDays, tone: "text-sky-600" },
              { label: "في الصيانة", value: String(propertyCounts.maintenance), icon: Wrench, tone: "text-amber-600" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="rounded-2xl border bg-card p-4 shadow-sm">
                <Icon className={`h-5 w-5 ${tone}`} />
                <p className="mt-2 truncate text-sm font-semibold text-muted-foreground">{label}</p>
                <p className="truncate font-black text-lg">{value}</p>
              </div>
            ))}
          </div>

          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">العقارات وأسعار الكراء</h2>
                <p className="text-sm text-muted-foreground">
                  {properties.length} عقار · متوسط السعر اليومي {money(propertyAvgDaily)}
                  {propertyAvgMonthly > 0 ? ` · متوسط شهري ${money(propertyAvgMonthly)}` : ""}
                </p>
              </div>
              <Button type="button" onClick={openAddProperty}>
                <Plus className="ml-1 h-4 w-4" />
                إضافة عقار
              </Button>
            </div>

            {fleet.isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">جاري تحميل العقارات...</div>
            ) : properties.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
                أضف أول عقار (شقة في مراكش، فيلا في الرباط، مكتب في كازابلانكا، ...) ليظهر في إعلانات العقارات.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-right text-sm">
                  <thead>
                    <tr className="border-b text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5">العقار</th>
                      <th className="px-3 py-2.5">النوع</th>
                      <th className="px-3 py-2.5">المدينة</th>
                      <th className="px-3 py-2.5">الغرف</th>
                      <th className="px-3 py-2.5">السعر / يوم</th>
                      <th className="px-3 py-2.5">السعر / شهر</th>
                      <th className="px-3 py-2.5">الحالة</th>
                      <th className="px-3 py-2.5">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {properties.map((property) => {
                      const status = toFleetStatus(property.status);
                      return (
                        <tr key={property.id} className="align-middle hover:bg-slate-50 dark:hover:bg-slate-900/40">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-3">
                              {property.imageUrl ? (
                                <img
                                  src={property.imageUrl}
                                  alt={property.title ?? `عقار ${property.id}`}
                                  className="h-12 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                                />
                              ) : (
                                <div className="flex h-12 w-16 items-center justify-center rounded-lg border border-dashed text-slate-300">
                                  <Home className="h-5 w-5" />
                                </div>
                              )}
                              <p className="max-w-56 truncate font-bold">{property.title}</p>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{property.propertyType ?? property.category}</td>
                          <td className="px-3 py-3 text-muted-foreground">{property.city}</td>
                          <td className="px-3 py-3">
                            {property.rooms && property.rooms > 0 ? (
                              <span className="inline-flex items-center gap-1 text-muted-foreground">
                                <BedDouble className="h-3.5 w-3.5" />
                                {property.rooms}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-bold">{money(property.pricePerDay)}</td>
                          <td className="px-3 py-3 font-bold">{Number(property.pricePerMonth) > 0 ? money(property.pricePerMonth ?? 0) : <span className="text-slate-400">—</span>}</td>
                          <td className="px-3 py-3">
                            {status === "Booked" ? (
                              <Badge className="bg-sky-600">{property.status === "Rented" ? "مؤجَّر" : fleetStatusLabel[status]}</Badge>
                            ) : status === "Maintenance" ? (
                              <Badge className="bg-amber-500 text-white">في الصيانة</Badge>
                            ) : (
                              <Badge className="bg-emerald-600">متاح</Badge>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                aria-label="حالة العقار"
                                value={status}
                                onChange={(event) => changePropertyStatus(property, event.target.value as FleetStatus)}
                                className="rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold"
                                disabled={setFleetStatus.isPending}
                              >
                                {(Object.keys(fleetStatusLabel) as FleetStatus[]).map((option) => (
                                  <option key={option} value={option}>
                                    {fleetStatusLabel[option]}
                                  </option>
                                ))}
                              </select>
                              <Button size="sm" variant="outline" onClick={() => openEditProperty(property)}>
                                <Pencil className="ml-1 h-3.5 w-3.5" />
                                تعديل
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <FinancialAnalytics bookings={rows} />
          <ScheduleCalendar bookings={rows} cars={cars} />
          <ActivityLog items={activity.data ?? []} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!docBooking} onOpenChange={(open) => !open && setDocBooking(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileBadge className="h-5 w-5 text-amber-500" />
              وثائق الطلب #{docBooking?.id}
            </DialogTitle>
          </DialogHeader>

          {docBooking && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{docBooking.listingTitle ?? `إعلان #${docBooking.listingId}`}</Badge>
                {residencyBadge(docBooking.residency)}
                {statusBadge(docBooking.status)}
              </div>
              <p className="text-sm text-muted-foreground">
                العميل: <span className="font-bold text-foreground">{docBooking.renterName ?? "مستأجر"}</span>
                {docBooking.renterEmail ? ` (${docBooking.renterEmail})` : ""} · من{" "}
                {new Date(docBooking.startDate).toLocaleDateString("ar-MA")} إلى{" "}
                {new Date(docBooking.endDate).toLocaleDateString("ar-MA")} · {money(docBooking.totalPrice)}
              </p>

              {docBooking.flightNumber && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                  <Plane className="h-4 w-4" />
                  <span className="font-bold">استلام من المطار:</span>
                  <span className="font-mono font-bold" dir="ltr">{docBooking.flightNumber}</span>
                  {docBooking.arrivalTime && (
                    <span>
                      الوصول {new Date(docBooking.arrivalTime).toLocaleString("ar-MA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              )}

              {openDocsEnabled ? (
                <>
                  {docBooking.drivingLicenseKey && (
                    <DocumentPreview
                      src={`/manus-storage/${docBooking.drivingLicenseKey}`}
                      mime={docBooking.drivingLicenseMimeType ?? ""}
                      fileName={docBooking.drivingLicenseFileName ?? documentKindLabel.drivingLicense}
                    />
                  )}
                  {docBooking.identityDocumentKey && (
                    <DocumentPreview
                      src={`/manus-storage/${docBooking.identityDocumentKey}`}
                      mime={docBooking.identityDocumentMimeType ?? ""}
                      fileName={docBooking.identityDocumentFileName ?? documentKindLabel.identityDocument}
                    />
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  لم تُرفق وثائق لهذا الطلب — رفعت في النسخ السابقة أو عبر رسالة الواتساب.
                </div>
              )}

              {docBooking.status === "Pending" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <p className="font-bold">التحقق قبل التسليم</p>
                  <p className="mt-1">
                    تأكد من تطابق الاسم والصورة في البيرمي مع وثيقة الهوية (CIN للمقيمين / جواز السفر للأجانب) قبل تأكيد
                    الحجز. تأكيد الحجز يغلق توثّر السيارة تلقائياً في المواعيد المحددة.
                  </p>
                </div>
              )}

              {docBooking.status === "Pending" && (
                <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
                  <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => decline(docBooking.id)} disabled={updateStatus.isPending}>
                    <X className="ml-1 h-4 w-4" />
                    رفض الطلب
                  </Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => confirm(docBooking.id)} disabled={updateStatus.isPending}>
                    <Check className="ml-1 h-4 w-4" />
                    قبول وتأكيد الحجز
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={carFormOpen} onOpenChange={(open) => !open && closeCarForm()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5 text-amber-500" />
              {editingCar ? "تعديل السيارة" : "إضافة سيارة إلى الأسطول"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={submitCar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-bold">موديل السيارة <span className="text-red-500">*</span></span>
                <input
                  type="text"
                  required
                  placeholder="مثال: Renault Clio 2024 أو Dacia Sandero"
                  value={carForm.title}
                  onChange={(event) => setCarForm({ ...carForm, title: event.target.value })}
                  className="w-full rounded-xl border bg-background p-3 text-sm"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold">المدينة</span>
                <select
                  value={carForm.city}
                  onChange={(event) => setCarForm({ ...carForm, city: event.target.value })}
                  className="w-full rounded-xl border bg-background p-3 text-sm"
                >
                  {CITIES.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-xs font-bold">السعر اليومي (درهم) <span className="text-red-500">*</span></span>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="مثال: 400"
                  value={carForm.price}
                  onChange={(event) => setCarForm({ ...carForm, price: event.target.value })}
                  className="w-full rounded-xl border bg-background p-3 text-sm"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold">ناقل الحركة</span>
                <select
                  value={carForm.transmission}
                  onChange={(event) => setCarForm({ ...carForm, transmission: event.target.value })}
                  className="w-full rounded-xl border bg-background p-3 text-sm"
                >
                  {TRANSMISSION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold">نوع الوقود</span>
                <select
                  value={carForm.fuelType}
                  onChange={(event) => setCarForm({ ...carForm, fuelType: event.target.value })}
                  className="w-full rounded-xl border bg-background p-3 text-sm"
                >
                  {FUEL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-bold">وصف قصير (اختياري)</span>
              <textarea
                rows={2}
                placeholder="مثال: سيارة اقتصادية مكيفة مع فحص وصيانة دورية."
                value={carForm.description}
                onChange={(event) => setCarForm({ ...carForm, description: event.target.value })}
                className="w-full rounded-xl border bg-background p-3 text-sm"
              />
            </label>

            {editingCar ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-muted-foreground dark:border-slate-700 dark:bg-slate-900/40">
                  <Car className="h-4 w-4" />
                  الصورة الحالية: {editingCar.imageUrl ? "مرفوعة سابقاً" : "بدون صورة"} — ارفع صورة جديدة فقط إذا أردت إعادة فحصها وتغييرها.
                </div>
                <AdvancedMediaUpload
                  onImagesUploaded={(images) => {
                    const first = images[0];
                    if (first) {
                      setCarImageUrl(first.url);
                      setCarImageProof(first.verificationProof);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <span className="text-xs font-bold">صورة السيارة الرئيسية <span className="text-red-500">*</span></span>
                <AdvancedMediaUpload
                  onImagesUploaded={(images) => {
                    const first = images[0];
                    if (first) {
                      setCarImageUrl(first.url);
                      setCarImageProof(first.verificationProof);
                    }
                  }}
                />
              </div>
            )}

            <DialogFooter className="flex-wrap gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={closeCarForm}>
                إلغاء
              </Button>
              <Button type="submit" disabled={carBusy} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {carBusy ? "جارٍ الحفظ..." : editingCar ? "حفظ التعديلات" : "فحص الصور وإضافة السيارة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={propertyFormOpen} onOpenChange={(open) => !open && closePropertyForm()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Home className="h-5 w-5 text-amber-500" />
              {editingProperty ? "تعديل العقار" : "إضافة عقار جديد"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitProperty} className="space-y-4">
            <label className="space-y-1.5">
              <span className="text-xs font-bold">عنوان العقار <span className="text-red-500">*</span></span>
              <input
                type="text"
                required
                placeholder="مثال: شقة فاخرة قرب جامع الفنا"
                value={propertyForm.title}
                onChange={(event) => setPropertyForm({ ...propertyForm, title: event.target.value })}
                className="w-full rounded-xl border bg-background p-3 text-sm"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-bold">المدينة</span>
                <select
                  value={propertyForm.city}
                  onChange={(event) => setPropertyForm({ ...propertyForm, city: event.target.value })}
                  className="w-full rounded-xl border bg-background p-3 text-sm"
                >
                  {CITIES.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold">نوع العقار</span>
                <select
                  value={propertyForm.propertyType}
                  onChange={(event) => setPropertyForm({ ...propertyForm, propertyType: event.target.value })}
                  className="w-full rounded-xl border bg-background p-3 text-sm"
                >
                  {PROPERTY_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-xs font-bold">السعر اليومي (درهم) <span className="text-red-500">*</span></span>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="مثال: 300"
                  value={propertyForm.price}
                  onChange={(event) => setPropertyForm({ ...propertyForm, price: event.target.value })}
                  className="w-full rounded-xl border bg-background p-3 text-sm"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold">السعر الشهري (درهم)</span>
                <input
                  type="number"
                  min="1"
                  placeholder="مثال: 9000"
                  value={propertyForm.monthlyPrice}
                  onChange={(event) => setPropertyForm({ ...propertyForm, monthlyPrice: event.target.value })}
                  className="w-full rounded-xl border bg-background p-3 text-sm"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold">عدد الغرف</span>
                <input
                  type="number"
                  min="0"
                  placeholder="مثال: 3"
                  value={propertyForm.rooms}
                  onChange={(event) => setPropertyForm({ ...propertyForm, rooms: event.target.value })}
                  className="w-full rounded-xl border bg-background p-3 text-sm"
                />
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-bold">وصف قصير (اختياري)</span>
              <textarea
                rows={2}
                placeholder="مثال: شقة مفروشة بتكييف وواي فاي، قريبة من المواصلات."
                value={propertyForm.description}
                onChange={(event) => setPropertyForm({ ...propertyForm, description: event.target.value })}
                className="w-full rounded-xl border bg-background p-3 text-sm"
              />
            </label>

            {editingProperty ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-muted-foreground dark:border-slate-700 dark:bg-slate-900/40">
                  <Home className="h-4 w-4" />
                  الصورة الحالية: {editingProperty.imageUrl ? "مرفوعة سابقاً" : "بدون صورة"} — ارفع صورة جديدة فقط إذا أردت إعادة فحصها وتغييرها.
                </div>
                <AdvancedMediaUpload
                  onImagesUploaded={(images) => {
                    const first = images[0];
                    if (first) {
                      setPropertyImageUrl(first.url);
                      setPropertyImageProof(first.verificationProof);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <span className="text-xs font-bold">صورة العقار الرئيسية <span className="text-red-500">*</span></span>
                <AdvancedMediaUpload
                  onImagesUploaded={(images) => {
                    const first = images[0];
                    if (first) {
                      setPropertyImageUrl(first.url);
                      setPropertyImageProof(first.verificationProof);
                    }
                  }}
                />
              </div>
            )}

            <DialogFooter className="flex-wrap gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={closePropertyForm}>
                إلغاء
              </Button>
              <Button type="submit" disabled={propertyBusy} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {propertyBusy ? "جارٍ الحفظ..." : editingProperty ? "حفظ التعديلات" : "فحص الصور وإضافة العقار"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}