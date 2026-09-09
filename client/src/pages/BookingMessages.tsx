import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowRight, Loader2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function BookingMessages() {
  const params = useParams<{ bookingId: string }>();
  const bookingId = Number(params.bookingId);
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const messages = trpc.messages.listByBooking.useQuery(
    { bookingId },
    { enabled: Number.isInteger(bookingId) && bookingId > 0, refetchInterval: 15000 },
  );
  const utils = trpc.useUtils();
  const send = trpc.messages.send.useMutation({
    onSuccess: async () => {
      setBody("");
      await utils.messages.listByBooking.invalidate({ bookingId });
      toast.success("تم إرسال الرسالة.");
    },
    onError: (error) => toast.error(error.message),
  });
  const markRead = trpc.messages.markRead.useMutation();

  const unreadIds = useMemo(
    () => (messages.data ?? []).filter((message) => message.recipientId === user?.id && !message.readAt).map((message) => message.id),
    [messages.data, user?.id],
  );

  useEffect(() => {
    unreadIds.forEach((messageId) => markRead.mutate({ messageId }));
  }, [unreadIds.join(",")]);

  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return <div className="mx-auto min-h-[60vh] max-w-xl p-6 text-center">رقم الحجز غير صحيح.</div>;
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-600">ALTUSplace Morocco</p>
            <h1 className="mt-1 text-2xl font-black text-[#0B0F19]">مراسلات الحجز #{bookingId}</h1>
            <p className="mt-1 text-sm text-slate-500">تواصل مع الطرف الآخر داخل المنصة واحتفظ بسجل واضح للمحادثة.</p>
          </div>
          <Link href="/my-bookings"><Button variant="outline"><ArrowRight className="ml-2 h-4 w-4" /> حجوزاتي</Button></Link>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2 text-[#0B0F19]"><MessageCircle className="h-5 w-5 text-amber-600" /> المحادثة</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[55vh] min-h-[220px] space-y-3 overflow-y-auto rounded-xl bg-slate-100 p-3">
              {messages.isLoading ? <div className="grid min-h-[200px] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div> : messages.isError ? <p className="p-6 text-center text-sm text-red-600">تعذر تحميل الرسائل أو لا تملك صلاحية الوصول لهذا الحجز.</p> : messages.data?.length ? messages.data.map((message) => {
                const mine = message.senderId === user?.id;
                return <div key={message.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${mine ? "bg-[#0B0F19] text-white" : "bg-white text-slate-800 shadow-sm"}`}><p className="mb-1 text-[11px] font-bold opacity-70">{mine ? "أنت" : message.senderName || "الطرف الآخر"}</p><p className="whitespace-pre-wrap break-words">{message.body}</p><p className="mt-2 text-[10px] opacity-60">{new Date(message.createdAt).toLocaleString("fr-MA")}</p></div></div>;
              }) : <div className="grid min-h-[200px] place-items-center text-center text-sm text-slate-500">لا توجد رسائل بعد. ابدأ التواصل حول تفاصيل الحجز.</div>}
            </div>
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (body.trim()) send.mutate({ bookingId, body: body.trim() }); }}>
              <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="اكتب رسالتك هنا..." maxLength={2000} rows={4} disabled={send.isPending} />
              <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">لا تشارك بيانات البطاقة أو كلمات المرور داخل المحادثة.</span><Button type="submit" disabled={send.isPending || !body.trim()} className="bg-amber-500 text-slate-950 hover:bg-amber-400"><Send className="ml-2 h-4 w-4" /> {send.isPending ? "جارٍ الإرسال..." : "إرسال"}</Button></div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
