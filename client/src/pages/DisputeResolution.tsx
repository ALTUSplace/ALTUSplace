import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, Clock, MessageSquare, PlusCircle, Paperclip, Upload, X, Check, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useLanguage } from "@/contexts/LanguageContext";

type DisputeStatus = 'Open' | 'UnderReview' | 'Resolved' | 'Rejected';
type DisputeAttachment = { id: number; name: string; mimeType: string; size: number; url: string };
type Dispute = {
  id: number;
  bookingId: number;
  type: string;
  description: string;
  status: DisputeStatus;
  resolutionNote: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  attachments: DisputeAttachment[];
};

type UploadableFile = { name: string; mimeType: string; contentBase64: string };

const stages = [
  { label: 'تقديم الشكوى', desc: 'تم استلام الطلب' },
  { label: 'مراجعة الوسيط', desc: 'تدقيق المستندات' },
  { label: 'فحص الأدلة', desc: 'دراسة المرفقات' },
  { label: 'التسوية النهائية', desc: 'إغلاق النزاع' },
];

const statusLabel: Record<DisputeStatus, string> = {
  Open: 'جديد قيد المعالجة',
  UnderReview: 'قيد المراجعة',
  Resolved: 'تم الحل',
  Rejected: 'مرفوض',
};

const formatDate = (value: Date | string) => new Intl.DateTimeFormat('ar-MA', { dateStyle: 'medium' }).format(new Date(value));
const parseBookingId = (value: string) => {
  const match = value.trim().match(/(\d+)$/);
  return match ? Number(match[1]) : NaN;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error(`تعذر قراءة الملف ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function DisputeResolution() {
  const { direction } = useLanguage();
  const utils = trpc.useUtils();
  const disputesQuery = trpc.disputes.listMine.useQuery();
  const createDispute = trpc.disputes.create.useMutation({
    onSuccess: async () => {
      await utils.disputes.listMine.invalidate();
      setIsOpenModal(false);
      setNewBookingRef('');
      setNewDescription('');
      setSelectedFiles([]);
      toast.success('تم فتح النزاع بنجاح وإرسال الأدلة إلى لجنة الوساطة');
    },
    onError: (error) => toast.error(error.message || 'تعذر فتح النزاع حالياً.'),
  });

  const [isOpenModal, setIsOpenModal] = useState(false);
  const [newBookingRef, setNewBookingRef] = useState('');
  const [newType, setNewType] = useState('مشكلة في تسليم السيارة (تأخير/حالة)');
  const [newDescription, setNewDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    if (incoming.length === 0) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const invalid = incoming.find((file) => !allowed.includes(file.type));
    if (invalid) {
      toast.error(`نوع الملف غير مدعوم: ${invalid.name}`);
      event.target.value = '';
      return;
    }
    const combinedSize = [...selectedFiles, ...incoming].reduce((total, file) => total + file.size, 0);
    if (combinedSize > 10 * 1024 * 1024) {
      toast.error('إجمالي المرفقات يجب ألا يتجاوز 10 ميجابايت.');
      event.target.value = '';
      return;
    }
    if (selectedFiles.length + incoming.length > 5) {
      toast.error('يمكن إرفاق 5 ملفات كحد أقصى.');
      event.target.value = '';
      return;
    }
    setSelectedFiles((current) => [...current, ...incoming]);
    event.target.value = '';
  };

  const removeFile = (index: number) => setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));

  const handleCreateDispute = async (event: React.FormEvent) => {
    event.preventDefault();
    const bookingId = parseBookingId(newBookingRef);
    if (!Number.isInteger(bookingId) || bookingId <= 0 || !newDescription.trim()) {
      toast.error('أدخل رقم حجز صحيحاً مثل BK-123 واكتب وصفاً واضحاً للنزاع.');
      return;
    }
    try {
      const attachments: UploadableFile[] = await Promise.all(selectedFiles.map(async (file) => ({ name: file.name, mimeType: file.type, contentBase64: await fileToBase64(file) })));
      createDispute.mutate({ bookingId, type: newType, description: newDescription.trim(), attachments });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تجهيز المرفقات.');
    }
  };

  const disputes = (disputesQuery.data ?? []) as Dispute[];

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8" dir={direction}>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-amber-600 font-semibold mb-1"><ShieldAlert className="w-5 h-5" /><span>مركز حل النزاعات والوساطة القانونية</span></div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">نظام تسوية النزاعات الشفاف</h1>
            <p className="text-slate-600 mt-1 text-sm">كل طلب مرتبط بحجز حقيقي، وتُحفظ المرفقات في التخزين الآمن مع عزل بيانات المستخدم.</p>
          </div>
          <Dialog open={isOpenModal} onOpenChange={setIsOpenModal}>
            <DialogTrigger asChild>
              <Button className="bg-[#0B0F19] hover:bg-[#0B0F19]/90 text-white gap-2 font-medium shadow-md"><PlusCircle className="w-4 h-4" /> فتح نزاع جديد وإرفاق أدلة</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="text-slate-900 text-xl font-bold">تقديم طلب نزاع أو شكوى رسمية</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateDispute} className="space-y-4 pt-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">رقم الحجز</label>
                  <Input placeholder="مثال: BK-123" value={newBookingRef} onChange={(event) => setNewBookingRef(event.target.value)} required />
                  <p className="mt-1 text-xs text-slate-500">استخدم رقم الحجز الظاهر في صفحة حجوزاتي.</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">نوع النزاع</label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger><SelectValue placeholder="اختر نوع المشكلة" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="مشكلة في تسليم السيارة (تأخير/حالة)">مشكلة في تسليم السيارة (تأخير/حالة)</SelectItem>
                      <SelectItem value="مخالفة شروط العقد الإيجاري">مخالفة شروط العقد الإيجاري</SelectItem>
                      <SelectItem value="طلب استرداد تأمين / ضمان">طلب استرداد تأمين / ضمان</SelectItem>
                      <SelectItem value="إلغاء حجز غير مبرر">إلغاء حجز غير مبرر</SelectItem>
                      <SelectItem value="مشكلة مالية أو استرداد أموال">مشكلة مالية أو استرداد أموال</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">وصف تفصيلي للمشكلة والحل المطلوب</label>
                  <Textarea placeholder="اكتب تفاصيل النزاع بدقة وأرفق الأدلة إن وجدت..." rows={4} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} maxLength={5000} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center justify-between"><span>رفع المرفقات والأدلة</span><span className="text-xs text-slate-400">10MB / 5 ملفات</span></label>
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-amber-500 transition-colors bg-slate-50 cursor-pointer relative">
                    <input type="file" multiple accept="image/jpeg,image/png,image/webp,.pdf,.doc,.docx" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    <div className="flex flex-col items-center justify-center space-y-2"><Upload className="w-8 h-8 text-amber-600" /><p className="text-sm font-medium text-slate-700">اضغط لرفع الملفات أو اسحبها هنا</p><p className="text-xs text-slate-500">PNG, JPG, WEBP, PDF, DOC, DOCX</p></div>
                  </div>
                  {selectedFiles.length > 0 && <div className="space-y-2 mt-2"><p className="text-xs font-semibold text-slate-600">الملفات المرفقة ({selectedFiles.length}):</p><div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">{selectedFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between bg-slate-100 px-3 py-1.5 rounded-lg text-xs text-slate-700"><span className="truncate max-w-[260px] flex items-center gap-1.5 font-medium"><Paperclip className="w-3.5 h-3.5 text-slate-500" />{file.name}</span><button type="button" onClick={() => removeFile(index)} className="text-red-500 hover:text-red-700 p-1" aria-label={`حذف ${file.name}`}><X className="w-3.5 h-3.5" /></button></div>)}</div></div>}
                </div>
                <DialogFooter className="pt-2"><Button type="submit" disabled={createDispute.isPending} className="w-full bg-[#0B0F19] hover:bg-[#0B0F19]/90 disabled:opacity-60 text-white font-medium">{createDispute.isPending ? 'جاري إرسال الطلب والأدلة...' : 'إرسال الشكوى والأدلة وتفعيل لجنة الوساطة'}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={selectedDispute !== null} onOpenChange={(open) => { if (!open) setSelectedDispute(null); }}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-slate-900 text-xl font-bold">
                  تفاصيل النزاع {selectedDispute ? `DSP-${selectedDispute.id}` : ''}
                </DialogTitle>
              </DialogHeader>
              {selectedDispute && (
                <div className="space-y-4 pt-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={selectedDispute.status === 'Resolved' ? 'bg-emerald-600' : selectedDispute.status === 'Rejected' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}>
                      {statusLabel[selectedDispute.status]}
                    </Badge>
                    <span className="text-slate-500">الحجز: BK-{selectedDispute.bookingId}</span>
                    <span className="text-slate-500">آخر تحديث: {formatDate(selectedDispute.updatedAt)}</span>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
                    <p className="font-semibold text-slate-900">{selectedDispute.type}</p>
                    <p className="leading-7 text-slate-700 whitespace-pre-wrap">{selectedDispute.description}</p>
                  </div>
                  {selectedDispute.resolutionNote ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                      <p className="font-semibold mb-1">ملاحظة لجنة الوساطة</p>
                      <p className="leading-7 whitespace-pre-wrap">{selectedDispute.resolutionNote}</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                      لا توجد ملاحظة نهائية من لجنة الوساطة بعد. سيظهر الرد هنا بعد تحديث الطلب من الإدارة.
                    </div>
                  )}
                  {selectedDispute.attachments.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-semibold text-slate-800">المرفقات والأدلة</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedDispute.attachments.map((file) => (
                          <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                            <Paperclip className="w-3.5 h-3.5 text-amber-600" />
                            <span className="max-w-[220px] truncate">{file.name}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedDispute(null)}>إغلاق</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
          <h2 className="text-xl font-bold text-slate-900 border-b pb-3">سجل النزاعات والطلبات النشطة</h2>
          {disputesQuery.isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center text-slate-500">جاري تحميل النزاعات...</div>
          ) : disputesQuery.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-700"><AlertCircle className="mx-auto mb-3 h-7 w-7" /><p>تعذر تحميل النزاعات حالياً. حاول مرة أخرى.</p><Button variant="outline" onClick={() => disputesQuery.refetch()} className="mt-4 border-red-300 text-red-700 hover:bg-red-100">إعادة المحاولة</Button></div>
          ) : disputes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">لا توجد نزاعات مرتبطة بحجوزاتك. يمكنك فتح طلب جديد عند الحاجة.</div>
          ) : (
            <div className="space-y-6">
              {disputes.map((dispute) => {
                const step = dispute.status === 'Resolved' || dispute.status === 'Rejected' ? 4 : dispute.status === 'UnderReview' ? 2 : 1;
                return <Card key={dispute.id} className="border-slate-200 bg-slate-50/50 shadow-none"><CardHeader className="pb-3"><div className="flex flex-col md:flex-row md:items-center justify-between gap-3"><div className="space-y-1.5"><div className="flex items-center gap-3 flex-wrap"><span className="font-mono font-bold text-slate-900 text-sm bg-slate-200 px-2.5 py-1 rounded-md">DSP-{dispute.id}</span><span className="text-sm text-slate-500 font-medium">الحجز: BK-{dispute.bookingId}</span><Badge variant={dispute.status === 'Resolved' ? 'default' : 'secondary'} className={dispute.status === 'Resolved' ? 'bg-emerald-600' : dispute.status === 'Rejected' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}>{statusLabel[dispute.status]}</Badge></div><CardTitle className="text-base text-slate-800">{dispute.type}</CardTitle></div><span className="text-xs text-slate-500">{formatDate(dispute.createdAt)}</span></div></CardHeader><CardContent className="space-y-5"><p className="text-sm text-slate-600">{dispute.description}</p><div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3"><div className="flex justify-between items-center text-xs font-semibold text-slate-700"><span>مراحل معالجة النزاع والوساطة</span><span className="text-amber-600 font-bold">المرحلة {step} من 4</span></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{stages.map((stage, index) => { const stepNumber = index + 1; const completed = stepNumber < step; const current = stepNumber === step; return <div key={stage.label} className="relative flex flex-col items-center text-center"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-1.5 ${completed ? 'bg-emerald-600 text-white' : current ? 'bg-amber-500 text-white ring-4 ring-amber-100' : 'bg-slate-200 text-slate-500'}`}>{completed ? <Check className="w-4 h-4" /> : stepNumber}</div><span className={`text-xs font-bold ${current ? 'text-amber-700' : completed ? 'text-emerald-700' : 'text-slate-600'}`}>{stage.label}</span><span className="text-[10px] text-slate-400">{stage.desc}</span></div>; })}</div></div>{dispute.resolutionNote && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><strong>ملاحظة لجنة الوساطة:</strong> {dispute.resolutionNote}</div>}{dispute.attachments.length > 0 && <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60"><span className="text-xs text-slate-500 flex items-center gap-1 font-medium"><Paperclip className="w-3.5 h-3.5" /> المرفقات والأدلة:</span>{dispute.attachments.map((file) => <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:border-amber-400"><Paperclip className="w-3.5 h-3.5 text-amber-600" />{file.name}<ExternalLink className="w-3 h-3" /></a>)}</div>}<div className="flex items-center gap-2 text-xs text-slate-500"><Clock className="w-4 h-4" />آخر تحديث: {formatDate(dispute.updatedAt)}</div><Button variant="outline" size="sm" className="gap-1.5 text-slate-700" onClick={() => setSelectedDispute(dispute)} aria-label={`عرض تفاصيل النزاع DSP-${dispute.id}`}><MessageSquare className="w-4 h-4 text-blue-600" /> عرض تفاصيل التحقيق</Button></CardContent></Card>;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
