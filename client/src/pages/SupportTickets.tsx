import { useState } from 'react';
import { Headphones, Plus, MessageSquare, CheckCircle2, Clock, Send, AlertCircle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useLanguage } from "@/contexts/LanguageContext";

type TicketStatus = 'Open' | 'InProgress' | 'Resolved';
type Ticket = {
  id: number;
  subject: string;
  category: string;
  description: string;
  status: TicketStatus;
  lastResponse: string | null;
  respondedAt: Date | string | null;
  createdAt: Date | string;
};

const statusLabel: Record<TicketStatus, string> = {
  Open: 'مفتوحة',
  InProgress: 'قيد المعالجة',
  Resolved: 'محلولة',
};

const formatDate = (value: Date | string) =>
  new Intl.DateTimeFormat('ar-MA', { dateStyle: 'medium' }).format(new Date(value));

export default function SupportTickets() {
  const { direction } = useLanguage();
  const utils = trpc.useUtils();
  const ticketsQuery = trpc.supportTickets.list.useQuery();
  const createTicket = trpc.supportTickets.create.useMutation({
    onSuccess: async () => {
      await utils.supportTickets.list.invalidate();
      setNewSubject('');
      setNewDescription('');
      setIsCreating(false);
      toast.success('تم فتح تذكرة الدعم بنجاح وتم إشعار فريق العمل');
    },
    onError: (error) => toast.error(error.message || 'تعذر فتح التذكرة حالياً.'),
  });

  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState('الحجوزات والمدفوعات');
  const [newDescription, setNewDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateTicket = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newSubject.trim() || !newDescription.trim()) {
      toast.error('يرجى ملء كافة الحقول المطلوبة لفتح التذكرة');
      return;
    }
    createTicket.mutate({
      subject: newSubject.trim(),
      category: newCategory,
      description: newDescription.trim(),
    });
  };

  const tickets = (ticketsQuery.data ?? []) as Ticket[];

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4" dir={direction}>
      <div className="container mx-auto max-w-5xl space-y-8">
        <div className="bg-slate-950 border border-slate-800 p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-400">
              <Headphones className="w-8 h-8" />
            </div>
            <div>
              <span className="text-amber-500 text-xs font-extrabold uppercase tracking-widest">الدعم الفني المباشر</span>
              <h1 className="text-2xl md:text-3xl font-black text-white">مركز تذاكر الاستفسارات والمساعدة</h1>
              <p className="mt-2 text-xs text-slate-400">تذاكرك محفوظة في حسابك ويمكن لفريق الإدارة متابعة حالتها والرد عليها.</p>
            </div>
          </div>
          <Button
            onClick={() => setIsCreating((open) => !open)}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-6 py-3 rounded-2xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" /> {isCreating ? 'إغلاق النموذج' : 'فتح تذكرة دعم جديدة'}
          </Button>
        </div>

        {isCreating && (
          <form onSubmit={handleCreateTicket} className="bg-slate-950 border border-slate-800 p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-4">
              <MessageSquare className="w-5 h-5 text-amber-400" />
              تقديم استفسار أو مشكلة جديدة لفريق الدعم
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <label className="space-y-2">
                <span className="text-xs font-bold text-slate-300">موضوع التذكرة</span>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(event) => setNewSubject(event.target.value)}
                  placeholder="أدخل عنواناً مختصراً للمشكلة أو الاستفسار"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  maxLength={255}
                  required
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold text-slate-300">قسم التذكرة</span>
                <select
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="الحجوزات والمدفوعات">الحجوزات والمدفوعات</option>
                  <option value="العقود الرقمية والتوقيع">العقود الرقمية والتوقيع</option>
                  <option value="الشركاء والأرباح">الشركاء والأرباح</option>
                  <option value="مشاكل تقنية في المنصة">مشاكل تقنية في المنصة</option>
                </select>
              </label>
            </div>
            <label className="space-y-2 block">
              <span className="text-xs font-bold text-slate-300">وصف التفاصيل</span>
              <textarea
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                rows={4}
                placeholder="اشرح استفسارك بالتفصيل وسيقوم فريقنا بالرد عبر هذه التذكرة..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-xs text-white focus:outline-none focus:border-amber-500"
                maxLength={5000}
                required
              />
            </label>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsCreating(false)} className="border-slate-700 text-slate-300 hover:bg-slate-900 text-xs px-6 py-2.5 rounded-xl">
                إلغاء
              </Button>
              <Button type="submit" disabled={createTicket.isPending} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 font-bold text-xs px-6 py-2.5 rounded-xl shadow-lg">
                {createTicket.isPending ? 'جاري الإرسال...' : <><Send className="w-4 h-4 ml-2 inline-block" /> إرسال التذكرة</>}
              </Button>
            </div>
          </form>
        )}

        <div className="bg-slate-950 border border-slate-800 p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <HelpCircle className="w-6 h-6 text-amber-400" />
            سجل التذاكر السابقة والاستجابات ({tickets.length})
          </h2>

          {ticketsQuery.isLoading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">جاري تحميل تذاكرك...</div>
          ) : ticketsQuery.isError ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-8 text-center text-red-200">
              <AlertCircle className="mx-auto mb-3 h-7 w-7" />
              <p>تعذر تحميل التذاكر حالياً. تحقق من تسجيل الدخول وحاول مرة أخرى.</p>
              <Button variant="outline" onClick={() => ticketsQuery.refetch()} className="mt-4 border-red-400/40 text-red-100 hover:bg-red-900/40">إعادة المحاولة</Button>
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-10 text-center text-slate-400">لا توجد تذاكر مرتبطة بحسابك. افتح تذكرة جديدة عند الحاجة.</div>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <article key={ticket.id} className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-2xl space-y-3 shadow-lg">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="bg-amber-500/20 text-amber-400 font-mono text-xs font-bold px-3 py-1 rounded-xl border border-amber-500/30 shrink-0">TCK-{ticket.id}</span>
                      <h3 className="text-sm font-extrabold text-white truncate">{ticket.subject}</h3>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] bg-slate-800 text-slate-300 px-3 py-1 rounded-full">{ticket.category}</span>
                      <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold ${ticket.status === 'Resolved' ? 'bg-emerald-500/20 text-emerald-400' : ticket.status === 'InProgress' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {ticket.status === 'Resolved' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                        {statusLabel[ticket.status]}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 leading-6">{ticket.description}</p>
                  <div className="text-xs text-slate-300 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 flex items-start gap-3">
                    <MessageSquare className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold text-slate-400 block mb-1">{ticket.lastResponse ? `آخر رد من الدعم (${formatDate(ticket.respondedAt ?? ticket.createdAt)}):` : `تم فتح التذكرة في ${formatDate(ticket.createdAt)}:`}</span>
                      <p>{ticket.lastResponse || 'تم استلام طلبكم وسيقوم فريق الدعم بالرد عليه.'}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
