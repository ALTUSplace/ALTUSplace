import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Car,
  Check,
  Eye,
  FileBadge,
  FileCheck2,
  FileText,
  Fuel,
  Gauge,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
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
  status: string;
  createdAt: string | Date | null;
  residency: string | null;
  drivingLicenseKey: string | null;
  drivingLicenseFileName: string | null;
  drivingLicenseMimeType: string | null;
  identityDocumentKey: string | null;
  identityDocumentFileName: string | null;
  identityDocumentMimeType: string | null;
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

export default function AgencyDashboard() {
  const { user } = useAuth();
  const bookings = trpc.bookings.ownerList.useQuery(undefined, { enabled: !!user });
  const overview = trpc.agency.overview.useQuery(undefined, { enabled: !!user });
  const fleet = trpc.listings.mine.useQuery(undefined, { enabled: !!user });
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
      closeCarForm();
      toast.success("تمت إضافة السيارة إلى الأسطول ونشرها بعد اجتياز فحص الصور.");
    },
    onError: (error) => toast.error(error.message),
  });
  const updateCar = trpc.listings.update.useMutation({
    onSuccess: () => {
      fleet.refetch();
      closeCarForm();
      toast.success("تم تحديث بيانات السيارة.");
    },
    onError: (error) => toast.error(error.message),
  });
  const setFleetStatus = trpc.listings.setFleetStatus.useMutation({
    onSuccess: () => {
      fleet.refetch();
      toast.success("تم تحديث حالة السيارة.");
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

  const closeCarForm = () => {
    setCarFormOpen(false);
    setEditingCar(null);
    setCarForm(emptyCarForm);
    setCarImageUrl("");
    setCarImageProof("");
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
            تتبّع طلبات الحجز وراجع وثائق المستأجر (البيرمي وCIN/جواز السفر)، وأدر أسطول سياراتك وأسعارها اليومية.
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
    </div>
  );
}