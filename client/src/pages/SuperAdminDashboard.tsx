import { useState } from 'react';
import { Link } from 'wouter';
import {
  Activity, Ban, Building2, Car, Check, Database, Frown, Gauge, LayoutDashboard, ListChecks,
  RefreshCw, Search, ShieldCheck, Smartphone, Users as UsersIcon, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { DashboardSkeleton } from '@/components/admin/skeletons';

type Section = 'overview' | 'moderation' | 'users' | 'health';

const NAV: Array<{ key: Section; label: string; icon: typeof Gauge }> = [
  { key: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
  { key: 'moderation', label: 'مراجعة الإعلانات', icon: ListChecks },
  { key: 'users', label: 'المستخدمون والأدوار', icon: UsersIcon },
  { key: 'health', label: 'صحة النظام', icon: Activity },
];

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'renter', label: 'مستأجر' },
  { value: 'owner', label: 'شريك/وكيل' },
  { value: 'admin', label: 'إدارة' },
  { value: 'user', label: 'مستخدم' },
  { value: 'SUPER_ADMIN', label: 'إدارة عليا' },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'active', label: 'نشط' },
  { value: 'suspended', label: 'موقوف' },
  { value: 'banned', label: 'محظور' },
];

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

function formatMAD(value: number) {
  return `${Number(value || 0).toLocaleString('fr-MA')} درهم`;
}

export default function SuperAdminDashboard() {
  const { user, loading } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [section, setSection] = useState<Section>('overview');

  const kpis = trpc.admin.super.overviewKpis.useQuery(undefined, {
    enabled: isSuperAdmin,
    refetchInterval: 30_000,
  });
  const queue = trpc.admin.super.moderationQueue.useQuery(undefined, {
    enabled: isSuperAdmin,
    refetchInterval: 30_000,
  });
  const health = trpc.admin.super.health.useQuery(undefined, {
    enabled: isSuperAdmin,
    refetchInterval: 30_000,
  });

  const [userQuery, setUserQuery] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userStatus, setUserStatus] = useState('');
  const users = trpc.admin.super.users.useQuery(
    {
      q: userQuery.trim() || undefined,
      role: (userRole || null) as 'renter' | 'owner' | 'admin' | 'user' | 'SUPER_ADMIN' | null,
      status: (userStatus || null) as 'active' | 'suspended' | 'banned' | null,
    },
    {
      enabled: isSuperAdmin,
      placeholderData: (prev) => prev,
    },
  );

  const moderate = trpc.admin.super.moderate.useMutation({
    onSuccess: () => {
      void kpis.refetch();
      void queue.refetch();
    },
  });
  const setRole = trpc.admin.super.setUserRole.useMutation({
    onSuccess: () => void users.refetch(),
  });
  const setStatus = trpc.admin.super.setUserStatus.useMutation({
    onSuccess: () => void users.refetch(),
  });

  if (loading) {
    return (
      <main dir="rtl" className="min-h-screen bg-[#0b1220] px-4 py-6 text-slate-100 dark:text-[#F1F1F3] sm:px-6 lg:px-10">
        <DashboardSkeleton />
      </main>
    );
  }

  if (!isSuperAdmin) {
    return (
      <main dir="rtl" className="grid min-h-screen place-items-center bg-[#0b1220] px-6 text-center">
        <div className="max-w-md space-y-3">
          <ShieldCheck className="mx-auto h-12 w-12 text-rose-500" />
          <h1 className="text-2xl font-black text-slate-100 dark:text-[#F1F1F3]">الوصول مقيّد</h1>
          <p className="text-sm text-slate-400 dark:text-[#B0B0B8]">هذه اللوحة متاحة حصرياً لحسابات SUPER_ADMIN.</p>
        </div>
      </main>
    );
  }

  const refresh = () => {
    kpis.refetch();
    queue.refetch();
    health.refetch();
    users.refetch();
  };

  return (
    <main dir="rtl" className="min-h-screen bg-[#0b1220] text-slate-100 dark:text-[#F1F1F3]">
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-l border-slate-800 dark:border-[#2C2C2E] bg-[#0d1728] p-4 md:flex">
          <div className="mb-5 flex items-center gap-2 px-2">
            <Gauge className="h-5 w-5 text-cyan-400" />
            <div>
              <p className="text-sm font-black text-white">ALTUSplace</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">Super Admin</p>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setSection(item.key)}
                  type="button"
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    active ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 dark:text-[#B0B0B8] hover:bg-slate-800/70 dark:hover:bg-[#2C2C2E]/70 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {item.key === 'moderation' && (queue.data?.length ?? 0) > 0 && (
                    <Badge variant="destructive" className="mr-auto">{queue.data!.length}</Badge>
                  )}
                </button>
              );
            })}
          </nav>
          <Link href="/admin/super" className="mb-2 text-center text-xs text-slate-500 hover:text-cyan-300">
            لوحة التمويل التنفيذية ←
          </Link>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-xs font-bold text-emerald-300">
            SUPER_ADMIN · RBAC نشط
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="space-y-5">
            <header className="rounded-2xl border border-slate-800 dark:border-[#2C2C2E] bg-gradient-to-br from-[#0e1a2e] to-[#111c33] p-6 shadow-xl">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="mb-3 flex items-center gap-2 text-cyan-400">
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-[0.25em]">ALTUSplace / SUPER ADMIN / OPS</span>
                  </div>
                  <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">لوحة التحكم الشاملة</h1>
                  <p className="mt-2 max-w-xl text-sm text-slate-400 dark:text-[#B0B0B8]">
                    مؤشرات الأداء، مراجعة الإعلانات، إدارة الأدوار، وصحة النظام في مكان واحد.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="border-slate-700 dark:border-[#48484D] bg-transparent text-slate-200 dark:text-[#E8E8EB] hover:bg-slate-800 dark:hover:bg-[#2C2C2E]" onClick={refresh}>
                    <RefreshCw className="ml-2 h-4 w-4" />
                    تحديث
                  </Button>
                  <Link href="/admin">
                    <Button className="bg-cyan-500 font-bold text-[#0b1220] hover:bg-cyan-400">
                      مركز التحكم
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 md:hidden">
                {NAV.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSection(item.key)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                        active ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800/70 dark:bg-[#2C2C2E]/70 text-slate-400 dark:text-[#B0B0B8]'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </header>

            {section === 'overview' && (
              <OverviewSection data={kpis.data} loading={kpis.isPending} onGoModeration={() => setSection('moderation')} />
            )}

            {section === 'moderation' && (
              <ModerationSection
                rows={queue.data ?? []}
                loading={queue.isPending}
                onDecision={({ listingId, action, reason }) =>
                  moderate.mutate(
                    { listingId, action, reason },
                    {
                      onSuccess: (res) => toast.success(res.status === 'Published' ? 'تم نشر الإعلان.' : 'تم رفض الإعلان.'),
                      onError: (err) => toast.error(err.message),
                    },
                  )
                }
              />
            )}

            {section === 'users' && (
              <UsersSection
                rows={users.data ?? []}
                loading={users.isPending}
                query={userQuery}
                onQuery={setUserQuery}
                role={userRole}
                onRole={setUserRole}
                status={userStatus}
                onStatus={setUserStatus}
                onSetRole={(userId, role) => setRole.mutate({ userId, role }, { onError: (err) => toast.error(err.message) })}
                onSetStatus={(userId, status) => setStatus.mutate({ userId, status }, { onError: (err) => toast.error(err.message) })}
              />
            )}

            {section === 'health' && <HealthSection data={health.data} loading={health.isPending} onRefresh={refresh} />}
          </div>
        </div>
      </div>
    </main>
  );
}

function KpiCard({ icon: Icon, label, value, tone, hint }: {
  icon: typeof Gauge;
  label: string;
  value: number;
  tone: string;
  hint?: string;
}) {
  return (
    <Card className="border-slate-800 dark:border-[#2C2C2E] bg-slate-900/70 dark:bg-[#1C1C1E]/70 shadow-lg shadow-black/20">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-400 dark:text-[#B0B0B8]">{label}</p>
          <Icon className={`h-5 w-5 ${tone}`} />
        </div>
        <p className="mt-2 text-3xl font-black text-white">{value.toLocaleString('fr-MA')}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function OverviewSection({ data, loading, onGoModeration }: {
  data?: { totalUsers: number; activeCars: number; activeRealEstate: number; pendingQueue: number };
  loading: boolean;
  onGoModeration: () => void;
}) {
  if (loading) {
    return <DashboardSkeleton />;
  }

  const kpiData = data ?? { totalUsers: 0, activeCars: 0, activeRealEstate: 0, pendingQueue: 0 };
  const { pendingQueue } = kpiData;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={UsersIcon} label="إجمالي المستخدمين" value={kpiData.totalUsers} tone="text-cyan-400" hint="جميع الأدوار" />
        <KpiCard icon={Car} label="سيارات نشطة" value={kpiData.activeCars} tone="text-emerald-400" hint="Published / Approved / Available" />
        <KpiCard icon={Building2} label="عقارات نشطة" value={kpiData.activeRealEstate} tone="text-amber-400" hint="Published / Approved / Available" />
        <Card className={`border-slate-800 dark:border-[#2C2C2E] bg-slate-900/70 dark:bg-[#1C1C1E]/70 shadow-lg shadow-black/20 ${pendingQueue > 0 ? 'ring-1 ring-rose-500/40' : ''}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-400 dark:text-[#B0B0B8]">الإعلانات قيد المراجعة</p>
              <ListChecks className="h-5 w-5 text-rose-400" />
            </div>
            <p className="mt-2 text-3xl font-black text-white">{pendingQueue.toLocaleString('fr-MA')}</p>
            <Button
              size="sm"
              variant={pendingQueue > 0 ? 'default' : 'outline'}
              className="mt-3 w-full bg-slate-700 dark:bg-[#48484D] text-white hover:bg-slate-600"
              onClick={onGoModeration}
            >
              <ListChecks className="ml-1.5 h-3.5 w-3.5" />
              فتح قائمة المراجعة
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="rounded-2xl border border-slate-800 dark:border-[#2C2C2E] bg-slate-900/70 dark:bg-[#1C1C1E]/70 p-5 text-sm text-slate-400 dark:text-[#B0B0B8] shadow-lg shadow-black/20">
        تتم تحديث البطاقات تلقائياً كل 30 ثانية أثناء فتح هذه اللوحة.
      </div>
    </>
  );
}

function ModerationSection({ rows, loading, onDecision }: {
  rows: Array<{
    id: number;
    title: string;
    category: string;
    status: string;
    pricePerDay: number | null;
    pricePerMonth: number | null;
    imageUrl: string | null;
    city: string | null;
    isFeatured: boolean;
    createdAt: string | Date;
    ownerName: string | null;
    ownerEmail: string | null;
    ownerAgencyName: string | null;
    ownerId: number;
  }>;
  loading: boolean;
  onDecision: (input: { listingId: number; action: 'approve' | 'reject'; reason?: string }) => void;
}) {
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (rows.length === 0) {
    return (
      <Card className="border-slate-800 dark:border-[#2C2C2E] bg-slate-900/70 dark:bg-[#1C1C1E]/70">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Frown className="h-10 w-10 text-slate-600" />
          <p className="font-bold text-slate-300 dark:text-[#D6D6DB]">قائمة المراجعة فارغة</p>
          <p className="max-w-sm text-sm text-slate-500">لا توجد إعلانات معلّقة بانتظار الموافقة حالياً.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-800 dark:border-[#2C2C2E] bg-slate-900/70 dark:bg-[#1C1C1E]/70 shadow-lg shadow-black/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100 dark:text-[#F1F1F3]">
          <ListChecks className="h-5 w-5 text-cyan-400" />
          قائمة المراجعة
          <Badge variant="destructive">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => {
          const price = row.category === 'car' ? `${formatMAD(row.pricePerDay ?? 0)}/يوم` : `${formatMAD(row.pricePerMonth ?? 0)}/شهر`;
          return (
            <div key={row.id} className="flex flex-col gap-3 rounded-xl border border-slate-800 dark:border-[#2C2C2E] bg-slate-950/50 dark:bg-[#111113]/50 p-4 sm:flex-row sm:items-center">
              <div className="grid h-20 w-36 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-800/60 dark:bg-[#2C2C2E]/60">
                {row.imageUrl ? (
                  <img src={row.imageUrl} alt={row.title} loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ) : (
                  <Car className="h-8 w-8 text-slate-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-bold text-white">{row.title}</p>
                  <Badge variant="outline">{row.category === 'car' ? 'سيارة' : 'عقار'}</Badge>
                  {row.isFeatured && <Badge variant="secondary">مميّز</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-400 dark:text-[#B0B0B8]">
                  {price} · {row.city || 'مدينة غير محددة'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {row.ownerAgencyName || row.ownerName || 'بدون اسم'} · {row.ownerEmail || 'بدون بريد'} · #{row.id}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 font-bold text-white hover:bg-emerald-500"
                  onClick={() => onDecision({ listingId: row.id, action: 'approve' })}
                >
                  <Check className="ml-1 h-4 w-4" />
                  نشر
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                  onClick={() => { setRejecting(row.id); setReason(''); }}
                >
                  <X className="ml-1 h-4 w-4" />
                  رفض
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={rejecting !== null} onOpenChange={(open) => { if (!open) setRejecting(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-slate-100 dark:text-[#F1F1F3]">رفض الإعلان #</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-400 dark:text-[#B0B0B8]">سيتم تخزين السبب في سجل التدقيق وإرساله للمالك عبر الإشعارات.</p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="سبب الرفض (مثال: صور غير واضحة، بيانات ناقصة)..."
              rows={4}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)}>إلغاء</Button>
            <Button
              className="bg-rose-600 font-bold text-white hover:bg-rose-500"
              disabled={!reason.trim()}
              onClick={() => {
                onDecision({ listingId: rejecting!, action: 'reject', reason: reason.trim() });
                setRejecting(null);
              }}
            >
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function UsersSection({ rows, loading, query, onQuery, role, onRole, status, onStatus, onSetRole, onSetStatus }: {
  rows: Array<{
    id: number;
    name: string | null;
    email: string | null;
    whatsappPhone: string | null;
    agencyPhone: string | null;
    agencyEmail: string | null;
    agencyName: string | null;
    commercialRegister: string | null;
    role: string;
    accountStatus: string;
    kycVerificationStatus: string | null;
    lastSignedIn: string | Date | null;
    createdAt: string | Date;
  }>;
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  role: string;
  onRole: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  onSetRole: (userId: number, role: 'renter' | 'owner' | 'admin' | 'user' | 'SUPER_ADMIN') => void;
  onSetStatus: (userId: number, status: 'active' | 'suspended' | 'banned') => void;
}) {
  return (
    <Card className="border-slate-800 dark:border-[#2C2C2E] bg-slate-900/70 dark:bg-[#1C1C1E]/70 shadow-lg shadow-black/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100 dark:text-[#F1F1F3]">
          <UsersIcon className="h-5 w-5 text-cyan-400" />
          إدارة المستخدمين والأدوار
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="بحث بالاسم، البريد، الوكالة، أو السجل التجاري..."
              className="pr-9 text-slate-200 dark:text-[#E8E8EB] placeholder:text-slate-500"
            />
          </div>
          <select
            value={role}
            onChange={(e) => onRole(e.target.value)}
            className="rounded-lg border border-slate-700 dark:border-[#48484D] bg-slate-900 dark:bg-[#1C1C1E] px-2 py-2 text-xs text-slate-200 dark:text-[#E8E8EB]"
          >
            <option value="">كل الأدوار</option>
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={status}
            onChange={(e) => onStatus(e.target.value)}
            className="rounded-lg border border-slate-700 dark:border-[#48484D] bg-slate-900 dark:bg-[#1C1C1E] px-2 py-2 text-xs text-slate-200 dark:text-[#E8E8EB]"
          >
            <option value="">كل الحالات</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <DashboardSkeleton />
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">لا توجد نتائج مطابقة.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((u) => (
              <div key={u.id} className="rounded-xl border border-slate-800 dark:border-[#2C2C2E] bg-slate-950/50 dark:bg-[#111113]/50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold text-white">{u.name || 'بدون اسم'}</p>
                      <Badge variant="outline">{roleLabel(u.role)}</Badge>
                      {u.kycVerificationStatus === 'verified' && (
                        <Badge className="bg-emerald-500/15 text-emerald-300"><ShieldCheck className="ml-1 h-3 w-3" />توثيق</Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {u.email || 'بدون بريد'}
                      {u.agencyName ? ` · ${u.agencyName}` : ''}
                      {u.commercialRegister ? ` · RC ${u.commercialRegister}` : ''}
                    </p>
                    {(u.whatsappPhone || u.agencyPhone) && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-600">
                        <Smartphone className="h-3 w-3" />
                        {[u.whatsappPhone, u.agencyPhone].filter(Boolean).join(' / ')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={u.accountStatus === 'active' ? 'default' : u.accountStatus === 'banned' ? 'destructive' : 'secondary'}
                    >
                      {STATUS_OPTIONS.find((o) => o.value === u.accountStatus)?.label ?? u.accountStatus}
                    </Badge>
                    <select
                      value={u.role}
                      onChange={(e) => onSetRole(u.id, e.target.value as 'renter' | 'owner' | 'admin' | 'user' | 'SUPER_ADMIN')}
                      className="rounded-lg border border-slate-700 dark:border-[#48484D] bg-slate-900 dark:bg-[#1C1C1E] px-2 py-1.5 text-xs text-slate-200 dark:text-[#E8E8EB]"
                      title="تغيير الدور"
                    >
                      {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {u.accountStatus !== 'banned' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-700 dark:border-[#48484D] text-slate-300 dark:text-[#D6D6DB] hover:bg-slate-800 dark:hover:bg-[#2C2C2E]"
                        onClick={() => onSetStatus(u.id, u.accountStatus === 'suspended' ? 'active' : 'suspended')}
                      >
                        {u.accountStatus === 'suspended' ? <><Check className="ml-1 h-3 w-3" />تفعيل</> : <><Ban className="ml-1 h-3 w-3" />إيقاف</>}
                      </Button>
                    )}
                    {u.accountStatus === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                        onClick={() => onSetStatus(u.id, 'banned')}
                      >
                        <Ban className="ml-1 h-3 w-3" />حظر
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-slate-600">
                  آخر دخول: {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString('fr-MA') : 'غير متوفر'} · تسجيل: {new Date(u.createdAt).toLocaleDateString('fr-MA')}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HealthSection({ data, loading, onRefresh }: {
  data?: {
    db: { ok: boolean; latencyMs: number | null };
    whatsapp: { status: string; configured: boolean; webhookConfigured: boolean; latencyMs: number; message: string };
    timestamp: string;
    uptimeSeconds: number;
  };
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card className="border-slate-800 dark:border-[#2C2C2E] bg-slate-900/70 dark:bg-[#1C1C1E]/70 shadow-lg shadow-black/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100 dark:text-[#F1F1F3]">
          <Activity className="h-5 w-5 text-cyan-400" />
          صحة النظام والمراسلة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 dark:border-[#2C2C2E] bg-slate-950/50 dark:bg-[#111113]/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-cyan-400" />
                    <p className="font-bold text-white">قاعدة البيانات</p>
                  </div>
                  <Badge variant={data?.db.ok ? 'default' : 'destructive'}>
                    {data?.db.ok ? 'متصلة' : 'غير متاحة'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-slate-400 dark:text-[#B0B0B8]">
                  كامون: {data?.db.latencyMs != null ? `${data.db.latencyMs} ms` : '—'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 dark:border-[#2C2C2E] bg-slate-950/50 dark:bg-[#111113]/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-emerald-400" />
                    <p className="font-bold text-white">WhatsApp Business API</p>
                  </div>
                  <Badge
                    variant={data?.whatsapp.status === 'connected' ? 'default' : data?.whatsapp.status === 'not_configured' ? 'secondary' : 'destructive'}
                  >
                    {data?.whatsapp.status === 'connected' ? 'متصل' : data?.whatsapp.status === 'not_configured' ? 'غير مكوّن' : 'خطأ'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-slate-400 dark:text-[#B0B0B8]">
                  {data?.whatsapp.status === 'connected'
                    ? `متصل عبر Graph API · ${data.whatsapp.latencyMs} ms`
                    : data?.whatsapp.status === 'error'
                      ? `فشل الاتصال: ${data.whatsapp.message || 'لا توجد تفاصيل'}`
                      : 'أضف WHATSAPP_ACCESS_TOKEN و WHATSAPP_PHONE_NUMBER_ID لتفعيل الإشعارات.'}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  ويب هوك الاستقبال: {data?.whatsapp.webhookConfigured ? 'مكوّن' : 'غير مكوّن (إرسال مباشر فقط)'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-slate-800 dark:border-[#2C2C2E] bg-slate-950/50 dark:bg-[#111113]/50 p-4 text-sm text-slate-400 dark:text-[#B0B0B8] sm:flex-row sm:items-center sm:justify-between">
              <p>
                عمر الخادم: <span className="font-bold text-slate-200 dark:text-[#E8E8EB]">{Math.floor((data?.uptimeSeconds ?? 0) / 60)} دقيقة</span>
              </p>
              <p>
                آخر فحص: <span className="font-mono text-xs text-slate-500">{data?.timestamp ? new Date(data.timestamp).toLocaleString('fr-MA') : '—'}</span>
              </p>
              <Button size="sm" variant="outline" className="border-slate-700 dark:border-[#48484D] text-slate-200 dark:text-[#E8E8EB] hover:bg-slate-800 dark:hover:bg-[#2C2C2E]" onClick={onRefresh}>
                <RefreshCw className="ml-1.5 h-3.5 w-3.5" />
                إعادة الفحص
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}