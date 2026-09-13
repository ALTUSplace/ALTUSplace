import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowLeft, Ban, BarChart3, Building2, CalendarDays, Check, CircleDollarSign, FileCheck2, Gauge, ListChecks, Loader2, LockKeyhole, Pencil, Plus, RefreshCw, Settings2, ShieldAlert, ShieldCheck, Trash2, TrendingUp, Users, WalletCards, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

const money = (value: number) => `${value.toLocaleString('fr-MA')} MAD`;
const statusLabel: Record<string, string> = { active: 'نشط', suspended: 'موقوف', banned: 'محظور' };
const roleLabel: Record<string, string> = { renter: 'مستأجر', owner: 'شريك/وكيل', admin: 'إدارة', user: 'مستخدم', SUPER_ADMIN: 'إدارة عليا' };
const bookingStatusLabel: Record<string, string> = { Pending: 'قيد الانتظار', Confirmed: 'مؤكد', Cancelled: 'ملغي' };
const typeOptions = [
  { value: 'سيارة / Car', label: 'سيارة' },
  { value: 'عقار / Property', label: 'عقار' },
  { value: 'شقة / Apartment', label: 'شقة' },
  { value: 'فيلا / Villa', label: 'فيلا' },
  { value: 'مكتب / Office', label: 'مكتب' },
];

type ListingForm = {
  title: string;
  category: string;
  city: string;
  pricePerDay: string;
  rooms: string;
  officeType: string;
  rentalPeriod: string;
  fuelType: string;
  transmission: string;
  description: string;
  imageUrl: string;
  amenities: string;
  isFeatured: boolean;
};

const emptyListingForm: ListingForm = {
  title: '',
  category: typeOptions[1].value,
  city: 'مراكش',
  pricePerDay: '',
  rooms: '',
  officeType: '',
  rentalPeriod: '',
  fuelType: '',
  transmission: '',
  description: '',
  imageUrl: '',
  amenities: '',
  isFeatured: false,
};

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const enabled = user?.role === 'admin';
  const overview = trpc.admin.overview.useQuery(undefined, { enabled });
  const users = trpc.admin.users.useQuery(undefined, { enabled });
  const listings = trpc.admin.listings.useQuery(undefined, { enabled });
  const bookings = trpc.admin.bookings.useQuery(undefined, { enabled, refetchInterval: 15_000 });
  const settings = trpc.admin.commissionSettings.useQuery(undefined, { enabled });
  const auditLogs = trpc.admin.auditLogs.useQuery(undefined, { enabled });
  const payments = trpc.admin.payments.useQuery(undefined, { enabled });
  const payouts = trpc.admin.payouts.useQuery(undefined, { enabled });
  const kyc = trpc.kyc.adminList.useQuery(undefined, { enabled });
  const [tab, setTab] = useState('overview');
  const [rate, setRate] = useState('10');
  const [platformForm, setPlatformForm] = useState({ platformName: 'ALTUSplace', contactEmail: '', contactPhone: '', maintenanceMode: false });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ListingForm>(emptyListingForm);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<ListingForm>(emptyListingForm);

  useEffect(() => { if (!loading && user && user.role !== 'admin') navigate('/'); }, [loading, user, navigate]);
  useEffect(() => { if (settings.data) { setRate(String(settings.data.commissionRateBasisPoints / 100)); setPlatformForm({ platformName: settings.data.platformName, contactEmail: settings.data.contactEmail || '', contactPhone: settings.data.contactPhone || '', maintenanceMode: settings.data.maintenanceMode }); } }, [settings.data]);

  const refresh = async () => { await Promise.all([overview.refetch(), users.refetch(), listings.refetch(), bookings.refetch(), auditLogs.refetch(), settings.refetch(), payments.refetch()]); };
  const notify = (message: string) => ({ onSuccess: async () => { toast.success(message); await refresh(); }, onError: (error: { message: string }) => { toast.error(error.message); } });
  const updateStatus = trpc.admin.updateUserStatus.useMutation(notify('تم تحديث حالة الحساب'));
  const updateUserRole = trpc.admin.updateUserRole.useMutation(notify('تم تحديث دور المستخدم'));
  const moderateListing = trpc.admin.moderateListing.useMutation(notify('تم تحديث الإعلان'));
  const updateListing = trpc.admin.updateListing.useMutation({ ...notify('تم حفظ تعديلات الإعلان'), onSuccess: async () => { setEditOpen(false); await refresh(); } });
  const createListing = trpc.admin.createListing.useMutation({ ...notify('تم إنشاء الإعلان'), onSuccess: async () => { setCreateOpen(false); await refresh(); } });
  const deleteListing = trpc.admin.deleteListing.useMutation(notify('تم حذف الإعلان'));
  const cancelBooking = trpc.admin.cancelBooking.useMutation(notify('تم إلغاء الحجز'));
  const updateCommission = trpc.admin.updateCommission.useMutation(notify('تم تحديث العمولة'));
  const updateSettings = trpc.admin.updatePlatformSettings.useMutation(notify('تم حفظ إعدادات المنصة'));
  const reviewKyc = trpc.kyc.review.useMutation(notify('تم تحديث طلب التحقق'));

  const openCreate = () => { setCreateForm(emptyListingForm); setCreateOpen(true); };
  const openEdit = (item: NonNullable<typeof listings.data>[number]) => {
    setEditForm({
      title: item.title || '',
      category: item.category || typeOptions[1].value,
      city: item.city || 'الدار البيضاء',
      pricePerDay: String(item.pricePerDay || ''),
      rooms: item.rooms != null ? String(item.rooms) : '',
      officeType: item.officeType || '',
      rentalPeriod: item.rentalPeriod || '',
      fuelType: item.fuelType || '',
      transmission: item.transmission || '',
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      amenities: (item.amenities || '').split(',').map((value) => value.trim()).filter(Boolean).join('، '),
      isFeatured: item.isFeatured,
    });
    setEditOpen(true);
  };
  const submitCreate = () => {
    const price = Number(createForm.pricePerDay);
    if (!createForm.title.trim() || createForm.title.trim().length < 2) return toast.error('أدخل عنواناً صالحاً');
    if (!Number.isFinite(price) || price <= 0) return toast.error('أدخل سعراً صحيحاً');
    createListing.mutate({
      title: createForm.title.trim(),
      category: createForm.category.trim(),
      city: createForm.city.trim() || 'الدار البيضاء',
      pricePerDay: Math.round(price),
      description: createForm.description.trim() || undefined,
      imageUrl: createForm.imageUrl.trim() || undefined,
      rooms: createForm.rooms.trim() ? Number(createForm.rooms) : undefined,
      officeType: createForm.officeType.trim() || undefined,
      rentalPeriod: (createForm.rentalPeriod || undefined) as 'daily' | 'monthly' | 'yearly' | undefined,
      fuelType: createForm.fuelType.trim() || undefined,
      transmission: createForm.transmission.trim() || undefined,
      amenities: createForm.amenities.split('،').map((value) => value.trim()).filter(Boolean).slice(0, 20),
      isFeatured: createForm.isFeatured,
    });
  };

  if (loading || !user) return <div className="grid min-h-screen place-items-center"><Loader2 className="animate-spin text-cyan-500" /></div>;
  if (!enabled) return null;
  const stats = overview.data;
  const pendingKyc = kyc.data?.filter(item => item.status === 'Pending').length || 0;
  const kpis: Array<[string, string | number, typeof CircleDollarSign, string]> = [['إيرادات المنصة', money(stats?.grossRevenue || 0), CircleDollarSign, 'text-[#3B82F6]'], ['عمولة مكتسبة', money(stats?.platformFees || 0), WalletCards, 'text-amber-600'], ['وكالات نشطة', stats?.activeAgencies || 0, Building2, 'text-sky-600'], ['إجمالي الحجوزات', stats?.bookings || 0, ListChecks, 'text-violet-600'], ['نمو المستخدمين', `+${stats?.userGrowth || 0}`, TrendingUp, 'text-rose-600']];

  return <main dir="rtl" className="min-h-screen bg-[#f4f7f6] px-4 py-5 text-slate-900 sm:px-6 lg:px-10">
    <div className="mx-auto max-w-[1440px] space-y-5">
      <header className="flex flex-col gap-5 rounded-2xl bg-[#102d2b] p-6 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-3 flex items-center gap-2 text-[#3B82F6]"><Gauge className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[0.2em]">ALTUSplace / CONTROL ROOM</span></div><h1 className="text-3xl font-black tracking-tight">مركز التحكم بالمنصة</h1><p className="mt-2 max-w-xl text-sm text-[#94A3B8]/70">إدارة الوكالات، المحتوى، الحجوزات، الأموال، والثقة من مساحة واحدة.</p></div><div className="flex flex-wrap gap-3">{user.role === 'SUPER_ADMIN' && <Link href="/admin/super"><Button className="w-fit bg-[#22d3ee] text-[#0b1220] hover:bg-[#67e8f9]"><Gauge className="ml-2 h-4 w-4" /> لوحة التمويل التنفيذية</Button></Link>}<Link href="/host"><Button variant="outline" className="w-fit border-white/20 bg-transparent text-white hover:bg-white/10"><ArrowLeft className="ml-2 h-4 w-4" /> لوحة الشريك</Button></Link></div></header>
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">{kpis.map(([label, value, Icon, color]) => <Card key={String(label)} className="border-0 shadow-sm"><CardContent className="p-4"><Icon className={`mb-4 h-5 w-5 ${color}`} /><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-[#102d2b]">{value}</p><p className="mt-1 text-[10px] text-slate-400">آخر 30 يوماً حسب المتاح</p></CardContent></Card>)}</section>
      <Tabs value={tab} onValueChange={setTab} dir="rtl"><TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-white p-1 shadow-sm"><Tab value="overview" icon={BarChart3}>نظرة عامة</Tab><Tab value="bookings" icon={CalendarDays}>الحجوزات</Tab><Tab value="users" icon={Users}>الوكالات والمستخدمون</Tab><Tab value="listings" icon={ListChecks}>المحتوى</Tab><Tab value="finance" icon={WalletCards}>المالية</Tab><Tab value="settings" icon={Settings2}>إعدادات المنصة</Tab><Tab value="audit" icon={LockKeyhole}>الأمان والتدقيق</Tab></TabsList>
        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="h-5 w-5 text-[#3B82F6]" />اتجاه الإيرادات</CardTitle></CardHeader><CardContent><div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={stats?.monthlyRevenue || []}><defs><linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} /><stop offset="100%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e5eeeb" /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} tickFormatter={value => `${value / 1000}k`} /><Tooltip formatter={(value: number) => [money(value), 'الإيرادات']} /><Area type="monotone" dataKey="revenue" stroke="#3B82F6" fill="url(#revenueFill)" strokeWidth={3} /></AreaChart></ResponsiveContainer></div></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-5 w-5 text-[#2563EB]" />آخر نشاط إداري</CardTitle></CardHeader><CardContent className="space-y-3">{auditLogs.data?.slice(0, 6).map(item => <ActivityRow key={item.id} action={item.action} detail={`${item.entityType}${item.entityId ? ` #${item.entityId}` : ''}`} date={item.createdAt} />) || <Empty text="لا توجد أحداث بعد." />}</CardContent></Card></TabsContent>
        <TabsContent value="bookings" className="mt-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-[#3B82F6]" />جدول الحجوزات <Badge variant="secondary">{bookings.data?.length || 0}</Badge><Button size="sm" variant="outline" className="mr-auto" onClick={() => bookings.refetch()}><RefreshCw className="ml-1 h-3 w-3" />تحديث مباشر</Button></CardTitle></CardHeader><CardContent className="space-y-3">{bookings.data?.map(item => <div key={item.id} className="flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-[#102d2b]">#{item.id} · {item.listingTitle || `الإعلان #${item.listingId}`}</p><BookingStatusBadge status={item.status} /></div><p className="mt-1 text-xs text-slate-500">العميل: {item.renterName || item.renterEmail || `مستخدم #?`}</p><p className="mt-1 text-xs text-slate-500"><span>{new Date(item.startDate).toLocaleDateString('ar-MA')} → {new Date(item.endDate).toLocaleDateString('ar-MA')}</span> · أُنشئ {new Date(item.createdAt).toLocaleDateString('ar-MA')}</p></div><div className="flex flex-wrap items-center gap-4"><div className="text-left"><p className="font-black text-[#102d2b]">{money(item.totalPrice)}</p><p className="text-[10px] text-slate-400">عمولة {money(item.commissionFee)}</p></div>{item.status === 'Pending' && <Button size="sm" variant="destructive" onClick={() => { if (window.confirm('هل تريد إلغاء هذا الحجز؟')) cancelBooking.mutate({ bookingId: item.id }); }}><X className="ml-1 h-3 w-3" />إلغاء</Button>}</div></div>) || <Empty text="لا توجد حجوزات." />}</CardContent></Card></TabsContent>
        <TabsContent value="users" className="mt-4 space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-[#3B82F6]" />دليل الوكالات والمستخدمين <Badge variant="secondary">{users.data?.length || 0}</Badge></CardTitle></CardHeader><CardContent className="space-y-2">{users.data?.map(item => <div key={item.id} className="flex flex-col gap-3 border-b py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-bold">{item.agencyName || item.name || 'بدون اسم'}</p><Badge variant="outline">{roleLabel[item.role] || item.role}</Badge></div><p className="text-xs text-slate-500">{item.email || 'بدون بريد'} {item.commercialRegister ? ` · RC ${item.commercialRegister}` : ''}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant={item.accountStatus === 'active' ? 'default' : item.accountStatus === 'banned' ? 'destructive' : 'secondary'}>{statusLabel[item.accountStatus]}</Badge>{item.kycVerificationStatus === 'verified' && <Badge className="bg-emerald-50 text-emerald-700"><ShieldCheck className="ml-1 h-3 w-3" />موثق</Badge>}<select value={item.role} onChange={event => updateUserRole.mutate({ userId: item.id, role: event.target.value as 'renter' | 'owner' | 'admin' | 'user' | 'SUPER_ADMIN' })} className="rounded-lg border px-2 py-1 text-xs" title="تغيير الدور"><option value="renter">مستأجر</option><option value="owner">شريك/وكيل</option><option value="admin">إدارة</option><option value="user">مستخدم</option></select>{item.accountStatus !== 'banned' && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ userId: item.id, status: item.accountStatus === 'suspended' ? 'active' : 'suspended' })}>{item.accountStatus === 'suspended' ? <><Check className="ml-1 h-3 w-3" />تفعيل</> : <><Ban className="ml-1 h-3 w-3" />إيقاف</>}</Button>}{item.accountStatus !== 'banned' && <Button size="sm" variant="destructive" onClick={() => updateStatus.mutate({ userId: item.id, status: 'banned' })}>حظر</Button>}</div></div>) || <Empty text="لا يوجد مستخدمون." />}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-amber-600" />طابور التحقق <Badge variant="secondary">{pendingKyc}</Badge></CardTitle></CardHeader><CardContent className="space-y-2">{kyc.data?.filter(item => item.status === 'Pending').slice(0, 20).map(item => <div key={item.id} className="flex flex-col gap-3 border-b py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-bold">طلب تحقق #{item.id}</p><p className="text-xs text-slate-500">{item.documentType} · {item.applicantRole} · {new Date(item.submittedAt).toLocaleDateString('ar-MA')}</p></div><div className="flex gap-2"><Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => reviewKyc.mutate({ id: item.id, status: 'Approved' })}><Check className="ml-1 h-3 w-3" />اعتماد</Button><Button size="sm" variant="destructive" onClick={() => reviewKyc.mutate({ id: item.id, status: 'Rejected', rejectionReason: 'مستند غير واضح' })}><X className="ml-1 h-3 w-3" />رفض</Button></div></div>) || <Empty text="لا توجد طلبات قيد المراجعة." />}</CardContent></Card></TabsContent>
        <TabsContent value="listings" className="mt-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-[#3B82F6]" />مراقبة كل الإعلانات <Badge variant="secondary">{listings.data?.length || 0}</Badge><Button size="sm" className="mr-auto gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={openCreate}><Plus className="h-4 w-4" />إضافة إعلان</Button></CardTitle></CardHeader><CardContent className="space-y-3">{listings.data?.map(item => <div key={item.id} className="rounded-xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><p className="font-bold text-[#102d2b]">{item.title}</p><p className="text-xs text-slate-500">{item.category} · {item.city} · {item.ownerName || `مالك #${item.ownerId}`} · {money(item.pricePerDay)}</p>{item.description && <p className="mt-1 line-clamp-1 text-xs text-slate-400">{item.description}</p>}</div><div className="flex flex-wrap items-center gap-2"><Badge variant={item.status === 'Rejected' ? 'destructive' : item.status === 'Published' ? 'default' : 'secondary'}>{item.status}</Badge>{item.isFeatured && <Badge className="bg-amber-50 text-amber-700">مميز</Badge>}<Button size="icon" variant="outline" title="تعديل كامل" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="outline" title="تمييز الإعلان" onClick={() => moderateListing.mutate({ listingId: item.id, status: item.status === 'Published' || item.status === 'Approved' ? item.status : 'Approved', isFeatured: !item.isFeatured })}><ShieldCheck className="h-4 w-4" /></Button><Button size="icon" variant="outline" title="نشر/رفض" onClick={() => moderateListing.mutate({ listingId: item.id, status: item.status === 'Published' ? 'Rejected' : 'Published' })}>{item.status === 'Published' ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}</Button><Button size="icon" variant="destructive" title="حذف الإعلان" onClick={() => { if (window.confirm(`حذف الإعلان «${item.title}» نهائياً؟`)) deleteListing.mutate({ listingId: item.id }); }}><Trash2 className="h-4 w-4" /></Button></div></div></div>) || <Empty text="لا توجد إعلانات." />}</CardContent></Card></TabsContent>
        <TabsContent value="finance" className="mt-4 grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-amber-600" />العمولة والتسويات</CardTitle></CardHeader><CardContent><form className="flex items-end gap-3" onSubmit={event => { event.preventDefault(); const value = Number(rate); if (value < 0 || value > 30) return toast.error('أدخل نسبة بين 0 و30'); updateCommission.mutate({ commissionRateBasisPoints: Math.round(value * 100) }); }}><label className="flex-1 text-sm font-semibold">نسبة العمولة (%)<input className="mt-2 w-full rounded-lg border p-3" type="number" min="0" max="30" step="0.1" value={rate} onChange={event => setRate(event.target.value)} /></label><Button type="submit">حفظ</Button></form><div className="mt-5 grid grid-cols-2 gap-3"><Metric label="إجمالي التحصيل" value={money(stats?.grossRevenue || 0)} /><Metric label="مستحقات الوكالات" value={money((stats?.grossRevenue || 0) - (stats?.platformFees || 0))} /><Metric label="المدفوعات" value={String(payments.data?.length || 0)} /><Metric label="طلبات السحب" value={String(payouts.data?.length || 0)} /></div></CardContent></Card><Card><CardHeader><CardTitle>آخر المعاملات</CardTitle></CardHeader><CardContent className="space-y-3">{payments.data?.slice(0, 8).map(item => <div key={item.id} className="flex items-center justify-between border-b pb-3 text-sm last:border-0"><span>{money(item.amount)}<small className="mr-2 block text-xs text-slate-500">#{item.bookingId} · {item.method}</small></span><Badge variant={item.status === 'Succeeded' ? 'default' : 'secondary'}>{item.status}</Badge></div>) || <Empty text="لا توجد معاملات." />}</CardContent></Card></TabsContent>
        <TabsContent value="settings" className="mt-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-[#3B82F6]" />هوية وتشغيل المنصة</CardTitle></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); updateSettings.mutate(platformForm); }}><Field label="اسم المنصة" value={platformForm.platformName} onChange={value => setPlatformForm({ ...platformForm, platformName: value })} /><Field label="بريد التواصل" value={platformForm.contactEmail} onChange={value => setPlatformForm({ ...platformForm, contactEmail: value })} type="email" /><Field label="هاتف التواصل" value={platformForm.contactPhone} onChange={value => setPlatformForm({ ...platformForm, contactPhone: value })} /><label className="flex items-center gap-3 rounded-lg border p-3 text-sm font-semibold"><input type="checkbox" checked={platformForm.maintenanceMode} onChange={event => setPlatformForm({ ...platformForm, maintenanceMode: event.target.checked })} />وضع الصيانة</label><Button className="w-fit sm:col-span-2" type="submit">حفظ الإعدادات</Button></form></CardContent></Card></TabsContent>
        <TabsContent value="audit" className="mt-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-[#3B82F6]" />سجل الأمان والتدقيق</CardTitle></CardHeader><CardContent className="space-y-1">{auditLogs.data?.map(item => <ActivityRow key={item.id} action={item.action} detail={`${item.entityType}${item.entityId ? ` #${item.entityId}` : ''} · بواسطة ${item.actorName || item.actorId}`} date={item.createdAt} />) || <Empty text="لا توجد أحداث تدقيق." />}</CardContent></Card></TabsContent>
      </Tabs>
    </div>

    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" dir="rtl"><DialogHeader><DialogTitle>تعديل الإعلان</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="العنوان" value={editForm.title} onChange={value => setEditForm({ ...editForm, title: value })} /><Field label="السعر اليومي/الليلي (درهم)" value={editForm.pricePerDay} onChange={value => setEditForm({ ...editForm, pricePerDay: value })} type="number" /><Field label="المدينة" value={editForm.city} onChange={value => setEditForm({ ...editForm, city: value })} /><SelectField label="نوع/فئة الإعلان" value={editForm.category} onChange={value => setEditForm({ ...editForm, category: value })} options={typeOptions.map(option => option.value)} /><Field label="الغرف (للشقق والفلل)" value={editForm.rooms} onChange={value => setEditForm({ ...editForm, rooms: value })} type="number" /><SelectField label="مدة الإيجار" value={editForm.rentalPeriod} onChange={value => setEditForm({ ...editForm, rentalPeriod: value })} options={['', 'daily', 'monthly', 'yearly']} /><Field label="نوع الوقود (للسيارات)" value={editForm.fuelType} onChange={value => setEditForm({ ...editForm, fuelType: value })} /><Field label="ناقل الحركة (للسيارات)" value={editForm.transmission} onChange={value => setEditForm({ ...editForm, transmission: value })} /><Field label="رابط الصورة" value={editForm.imageUrl} onChange={value => setEditForm({ ...editForm, imageUrl: value })} /><Field label="تجهيزات (مفصولة بفاصلة)" value={editForm.amenities} onChange={value => setEditForm({ ...editForm, amenities: value })} /><label className="flex items-center gap-3 rounded-lg border p-3 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={editForm.isFeatured} onChange={event => setEditForm({ ...editForm, isFeatured: event.target.checked })} /><span>Cالتوصية / Featured</span></label><label className="text-sm font-semibold sm:col-span-2">الوصف<textarea className="mt-2 w-full rounded-lg border p-3 font-normal" rows={4} value={editForm.description} onChange={event => setEditForm({ ...editForm, description: event.target.value })} /></label></div><DialogFooter><Button variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button><Button className="gap-1" onClick={() => {
  const target = listings.data?.find((item) => item.title === editForm.title);
  const id = target?.id;
  if (id == null) return toast.error('تعذر تحديد الإعلان المراد تعديله');
  updateListing.mutate({ listingId: id, title: editForm.title, pricePerDay: Math.round(Number(editForm.pricePerDay)), description: editForm.description.trim() || null, category: editForm.category.trim(), city: editForm.city.trim(), imageUrl: editForm.imageUrl.trim() || null, rooms: editForm.rooms.trim() ? Number(editForm.rooms) : null, officeType: editForm.officeType.trim() || null, rentalPeriod: (editForm.rentalPeriod || null) as 'daily' | 'monthly' | 'yearly' | null, fuelType: editForm.fuelType.trim() || null, transmission: editForm.transmission.trim() || null, amenities: editForm.amenities.split('،').map((value) => value.trim()).filter(Boolean).slice(0, 20), isFeatured: editForm.isFeatured });
}}><Check className="ml-1 h-4 w-4" />حفظ التعديلات</Button></DialogFooter></DialogContent>
    </Dialog>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" dir="rtl"><DialogHeader><DialogTitle>إضافة إعلان جديد</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="العنوان" value={createForm.title} onChange={value => setCreateForm({ ...createForm, title: value })} /><Field label="السعر اليومي/الليلي (درهم)" value={createForm.pricePerDay} onChange={value => setCreateForm({ ...createForm, pricePerDay: value })} type="number" /><Field label="المدينة" value={createForm.city} onChange={value => setCreateForm({ ...createForm, city: value })} /><SelectField label="نوع/فئة الإعلان" value={createForm.category} onChange={value => setCreateForm({ ...createForm, category: value })} options={typeOptions.map(option => option.value)} /><Field label="الغرف (للشقق والفلل)" value={createForm.rooms} onChange={value => setCreateForm({ ...createForm, rooms: value })} type="number" /><SelectField label="مدة الإيجار" value={createForm.rentalPeriod} onChange={value => setCreateForm({ ...createForm, rentalPeriod: value })} options={['', 'daily', 'monthly', 'yearly']} /><Field label="نوع الوقود (للسيارات)" value={createForm.fuelType} onChange={value => setCreateForm({ ...createForm, fuelType: value })} /><Field label="ناقل الحركة (للسيارات)" value={createForm.transmission} onChange={value => setCreateForm({ ...createForm, transmission: value })} /><Field label="رابط الصورة (اختياري)" value={createForm.imageUrl} onChange={value => setCreateForm({ ...createForm, imageUrl: value })} /><Field label="تجهيزات (مفصولة بفاصلة)" value={createForm.amenities} onChange={value => setCreateForm({ ...createForm, amenities: value })} /><label className="flex items-center gap-3 rounded-lg border p-3 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={createForm.isFeatured} onChange={event => setCreateForm({ ...createForm, isFeatured: event.target.checked })} /><span>إدراج ضمن المميزات (Featured)</span></label><label className="text-sm font-semibold sm:col-span-2">الوصف<textarea className="mt-2 w-full rounded-lg border p-3 font-normal" rows={4} value={createForm.description} onChange={event => setCreateForm({ ...createForm, description: event.target.value })} /></label></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button><Button className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={submitCreate}><Plus className="ml-1 h-4 w-4" />إنشاء الإعلان</Button></DialogFooter></DialogContent>
    </Dialog>
  </main>;
}

function Tab({ value, icon: Icon, children }: { value: string; icon: typeof Activity; children: ReactNode }) { return <TabsTrigger value={value} className="gap-2 text-slate-600 data-[state=active]:bg-[#102d2b] data-[state=active]:text-white"><Icon className="h-4 w-4" />{children}</TabsTrigger>; }
function Empty({ text }: { text: string }) { return <div className="grid min-h-24 place-items-center text-sm text-slate-400">{text}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-black text-[#102d2b]">{value}</p></div>; }
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="text-sm font-semibold">{label}<input className="mt-2 w-full rounded-lg border p-3 font-normal" type={type} value={value} onChange={event => onChange(event.target.value)} /></label>; }
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <label className="text-sm font-semibold">{label}<select className="mt-2 w-full rounded-lg border p-3 font-normal" value={value} onChange={event => onChange(event.target.value)}><option value="">—</option>{options.map(option => <option key={option} value={option}>{option || '—'}</option>)}</select></label>; }
function ActivityRow({ action, detail, date }: { action: string; detail: string; date: Date }) { return <div className="flex items-start gap-3 border-b py-3 last:border-0"><span className="mt-1 rounded-full bg-emerald-50 p-1.5 text-[#3B82F6]"><ShieldAlert className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{action}</p><p className="text-xs text-slate-500">{detail}</p></div><time className="whitespace-nowrap text-[10px] text-slate-400">{new Date(date).toLocaleDateString('ar-MA')}</time></div>; }
function BookingStatusBadge({ status }: { status: string }) { return <Badge variant={status === 'Cancelled' ? 'destructive' : status === 'Confirmed' ? 'default' : 'secondary'}>{bookingStatusLabel[status] || status}</Badge>; }