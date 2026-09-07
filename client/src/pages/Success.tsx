import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Home, Download, Edit3, Eraser, Check, Stamp, FileCheck, X, Receipt, CreditCard, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useRef, useState, useEffect } from 'react';
import { playSuccessSound } from '@/lib/sound';
import { trpc } from '@/lib/trpc';
import { cancellationRefundPolicy } from '@/lib/legalDisclosure';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { PaymentStatusBadge, PaymentMethodBadge, TransactionReference } from '@/components/PaymentStatusBadge';

export default function Success() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const bookingId = Number(searchParams.get('bookingId') || 0);
  const voucherCode = searchParams.get('voucherCode') || '';
  const contractType = searchParams.get('contractType') as 'commercial' | 'professional' | null;
  const language = searchParams.get('language') === 'ar' ? 'ar' : 'fr';
  const bookingQuery = trpc.bookings.getById.useQuery(
    { bookingId },
    { enabled: bookingId > 0, retry: false, refetchInterval: bookingId > 0 ? 15000 : false },
  );
  const booking = bookingQuery.data;
  const bookingRef = booking ? `ALT-${booking.id}` : (bookingId > 0 ? `ALT-${bookingId}` : 'ALT-PENDING');
  const name = 'المستأجر';
  const phone = booking?.ownerWhatsApp || 'غير متوفر';
  const bookingStatus = booking?.status ?? 'Pending';
  const isPending = !booking || bookingStatus !== 'Confirmed';
  const start = booking ? new Date(booking.startDate).toISOString().slice(0, 10) : 'غير محدد';
  const end = booking ? new Date(booking.endDate).toISOString().slice(0, 10) : 'غير محدد';
  const startTimestamp = booking ? new Date(booking.startDate).getTime() : Number.NaN;
  const endTimestamp = booking ? new Date(booking.endDate).getTime() : Number.NaN;
  const calculatedDays = Number.isFinite(startTimestamp) && Number.isFinite(endTimestamp) && endTimestamp > startTimestamp
    ? Math.ceil((endTimestamp - startTimestamp) / (1000 * 60 * 60 * 24))
    : 0;
  const days = String(calculatedDays || 0);
  const premises = booking?.listingTitle || 'المحل موضوع الحجز';
  const city = booking?.listingCity || 'المغرب';
  const landlordName = booking?.ownerName || 'المالك / الشركة المؤجرة';
  const monthlyRent = booking?.totalPrice || 0;
  const canContactAgency = bookingStatus === 'Confirmed' && Boolean(booking?.ownerWhatsApp);

  const handleWhatsappContact = () => {
    if (!canContactAgency || !booking?.ownerWhatsApp) {
      toast.info('لا يتوفر رقم واتساب مؤكد للوكالة في بيانات هذا الحجز.');
      return;
    }
    const message = language === 'ar'
      ? `مرحباً، أود التواصل بخصوص الحجز ${bookingRef} — ${premises}.`
      : `Bonjour, je souhaite échanger au sujet de la réservation ${bookingRef} — ${premises}.`;
    window.open(buildWhatsAppUrl(booking.ownerWhatsApp, message), '_blank', 'noopener,noreferrer');
  };

  const handleEmailContact = () => {
    if (isPending) {
      toast.info('ستتوفر رسالة البريد بعد اعتماد الحجز وإتاحة العقد.');
      return;
    }
    if (!hasSigned) {
      toast.error('يرجى توقيع العقد أولاً قبل فتح رسالة البريد الإلكتروني.');
      return;
    }
    const subject = `ALTUSplace — عقد الحجز ${bookingRef}`;
    const body = `مرحباً، أرفق لكم عقد الحجز ${bookingRef} الذي تم تنزيله من منصة ALTUSplace.`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    toast.success('تم فتح تطبيق البريد لإرفاق ملف العقد وإرساله.');
  };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [includeOfficialStamp, setIncludeOfficialStamp] = useState(true);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [commercialContractUrl, setCommercialContractUrl] = useState<string | null>(null);
  const [commercialContractReference, setCommercialContractReference] = useState<string | null>(null);
  const [isCommercialContractGenerating, setIsCommercialContractGenerating] = useState(false);
  const createLeaseMutation = trpc.commercialLeaseContracts.create.useMutation();
  const invoiceQuery = trpc.invoices.getByBooking.useQuery({ bookingId }, { enabled: bookingId > 0, retry: false });
  const invoice = invoiceQuery.data;
  const total = invoice ? String(invoice.total) : '—';

  const handleInvoiceDownload = async () => {
    if (!invoice) {
      toast.info('لم يتم تحميل الفاتورة بعد. يرجى الانتظار أو فتح صفحة حجوزاتك.');
      return;
    }
    setIsGeneratingPDF(true);
    try {
      const { generateInvoicePdf } = await import('@/lib/invoicePdf');
      const blob = generateInvoicePdf({
        ...invoice,
        cancellationPolicy: cancellationRefundPolicy.fr.points[0],
        refundPolicy: cancellationRefundPolicy.fr.points[1],
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.invoiceNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('تم تنزيل الفاتورة الإلكترونية بصيغة PDF.');
    } catch {
      toast.error('تعذر إنشاء الفاتورة حالياً. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  useEffect(() => {
    playSuccessSound();
    if (!bookingId || !contractType || isPending) return;
    let active = true;
    setIsCommercialContractGenerating(true);
    createLeaseMutation.mutate({
      bookingId,
      leaseType: contractType,
      language,
    }, {
      onSuccess: (result) => {
        if (!active) return;
        if (result.pdfUrl) setCommercialContractUrl(result.pdfUrl);
        setCommercialContractReference(result.reference);
        setIsCommercialContractGenerating(false);
        toast.success('تم إنشاء عقد الكراء التجاري/المهني تلقائياً وهو جاهز للتحميل.');
      },
      onError: (error) => {
        if (!active) return;
        setIsCommercialContractGenerating(false);
        toast.error(error.message || 'تعذر إنشاء عقد الكراء تلقائياً.');
      },
    });
    return () => { active = false; };
  }, [bookingId, contractType, isPending, booking?.status]);


  useEffect(() => {
    playSuccessSound();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSigned(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureDataUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
    setSignatureDataUrl(null);
  };

  const handleDownloadPDF = () => {
    if (isPending) {
      toast.info('سيصبح العقد والتنزيل متاحين بعد اعتماد المالك للحجز.');
      return;
    }
    if (!hasSigned) {
      toast.error('يرجى توقيع العقد في المربع المخصص قبل تنزيله.');
      return;
    }
    setIsGeneratingPDF(true);
    setTimeout(async () => {
      try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF();
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("ALTUSPLACE - Digital Rental Contract", 105, 20, { align: "center" });
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text("Official Car Rental Agreement in Morocco", 105, 28, { align: "center" });
      
      doc.line(20, 35, 190, 35);

      doc.setFont("helvetica", "bold");
      doc.text("Contract Reference:", 20, 48);
      doc.setFont("helvetica", "normal");
      doc.text(bookingRef, 70, 48);

      doc.setFont("helvetica", "bold");
      doc.text("Customer Name:", 20, 58);
      doc.setFont("helvetica", "normal");
      doc.text(name, 70, 58);

      doc.setFont("helvetica", "bold");
      doc.text("Phone Number:", 20, 68);
      doc.setFont("helvetica", "normal");
      doc.text(phone, 70, 68);

      doc.setFont("helvetica", "bold");
      doc.text("Rental Period:", 20, 78);
      doc.setFont("helvetica", "normal");
      doc.text(`${start} to ${end} (${days} Days)`, 70, 78);

      doc.setFont("helvetica", "bold");
      doc.text("Total Amount:", 20, 88);
      doc.setFont("helvetica", "normal");
      doc.text(`${total} MAD (Cash or Card at pickup)`, 70, 88);

      doc.line(20, 100, 190, 100);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Terms & Conditions Summary:", 20, 112);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const terms = [
        "1. Driver must hold a valid driver's license for at least 2 years.",
        "2. Fuel policy: Return with the same fuel level as received.",
        "3. Comprehensive insurance covers all authorized drivers as per contract.",
        "4. Free cancellation up to 24 hours before pickup time.",
        "5. For assistance, contact the agency WhatsApp directly."
      ];
      
      let y = 120;
      terms.forEach(term => {
        doc.text(term, 20, y);
        y += 7;
      });

      doc.setFont("helvetica", "bold");
      doc.text("Agency Stamp & Signature", 30, 175);
      doc.text("Customer Signature", 140, 175);

      if (includeOfficialStamp) {
        doc.setDrawColor(217, 119, 6);
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(25, 180, 45, 25, 3, 3, 'FD');
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(180, 83, 9);
        doc.text("ALTUSPLACE OFFICIAL", 47, 188, { align: "center" });
        doc.text("VERIFIED AGENCY", 47, 195, { align: "center" });
        doc.text("MOROCCO", 47, 201, { align: "center" });
        doc.setTextColor(0, 0, 0);
      }

      if (signatureDataUrl) {
        doc.addImage(signatureDataUrl, 'PNG', 135, 180, 50, 20);
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.text("(Electronically Agreed)", 140, 190);
      }

        doc.save(`ALTUSplace-Contract-${bookingRef}.pdf`);
        toast.success('تم تحميل عقد الإيجار الرقمي بنجاح!');
        setShowDownloadModal(true); // إظهار نافذة التأكيد المرئية المنبثقة
      } catch (error) {
        console.error("PDF generation error:", error);
        toast.error('حدث خطأ أثناء توليد ملف PDF. يرجى المحاولة مرة أخرى.');
      } finally {
        setIsGeneratingPDF(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-12 px-4 relative">
      {voucherCode && !isPending && (
        <div className="mx-auto mb-6 max-w-4xl rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-right shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-bold text-emerald-900">تذكرة الوصول الذكي جاهزة</p><p className="mt-1 text-sm text-emerald-800">تم إصدار Voucher برمز QR بعد نجاح الدفع. احتفظ به لإبراز تفاصيل الحجز عند الوصول.</p><p className="mt-2 font-mono text-sm font-bold text-emerald-900">{voucherCode}</p></div>
            <Button onClick={() => setLocation(`/voucher/${voucherCode}`)} className="bg-emerald-700 text-white hover:bg-emerald-800">فتح التذكرة الذكية</Button>
          </div>
        </div>
      )}
      <div className="container mx-auto px-4 max-w-2xl text-center space-y-8">
        <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl shadow-2xl space-y-6">
          <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">{isPending ? 'تم إرسال طلب الحجز' : 'تم تأكيد الحجز'}</span>
            <h1 className="text-2xl font-extrabold text-white">شكراً لك، {name}!</h1>
            <p className="text-slate-400 text-xs max-w-md mx-auto">
              رقم مرجع الحجز الخاص بك هو <span className="text-amber-400 font-bold">{bookingRef}</span>. {isPending ? 'الطلب الآن قيد مراجعة المالك، وسيصلك إشعار عند القبول أو الرفض.' : 'يمكنك توقيع العقد وتنزيل مستندات الحجز.'}
            </p>
          </div>

          {/* Booking & Payment Status Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <PaymentStatusBadge 
              status={searchParams.get('paymentStatus') as any || (isPending ? 'Pending' : 'Succeeded')} 
              type="payment"
              size="md"
            />
            <PaymentStatusBadge status={bookingStatus} type="booking" size="md" />
            {searchParams.get('invoiceStatus') && (
              <PaymentStatusBadge status={searchParams.get('invoiceStatus') as any} type="invoice" size="md" />
            )}
          </div>

          {isPending && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl text-right text-xs text-amber-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>الحالة الحالية: <strong className="text-amber-300">قيد موافقة المالك</strong>. لا يتم إنشاء عقد الكراء أو اعتباره نهائياً قبل اعتماد الطلب.</span>
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl text-right space-y-3 text-xs">
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">الرقم المرجعي:</span>
              <span className="font-bold text-white">{bookingRef}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-400">فترة الإيجار:</span>
              <span className="font-bold text-white">{start} إلى {end} ({days} أيام)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">المبلغ الإجمالي:</span>
              <span className="font-bold text-amber-400">{total} درهم</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-amber-500/30 p-5 rounded-2xl text-right space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Receipt className="w-5 h-5 text-amber-400" /><span className="font-bold text-white">الفاتورة الإلكترونية</span></div>
              {invoice && (
                <PaymentStatusBadge 
                  status={invoice.paymentStatus as any} 
                  type="payment" 
                  size="sm" 
                />
              )}
            </div>
            {invoiceQuery.isLoading ? <p className="text-xs text-slate-400">جاري التحقق من الفاتورة المحفوظة...</p> : invoice ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs"><div><span className="text-slate-400 block">رقم الفاتورة</span><strong className="text-white">{invoice.invoiceNumber}</strong></div><div><span className="text-slate-400 block">حالة الدفع</span><strong className="text-white">{invoice.paymentStatus}</strong></div><div><span className="text-slate-400 block">TVA</span><strong className="text-white">{invoice.vatAmount} {invoice.currency}</strong></div><div><span className="text-slate-400 block">الإجمالي الخادمي</span><strong className="text-amber-300">{invoice.total} {invoice.currency}</strong></div></div>
                <Button type="button" onClick={handleInvoiceDownload} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"><Download className="w-4 h-4 ml-2" /> تنزيل الفاتورة PDF</Button>
              </>
            ) : <p className="text-xs text-slate-400">{invoiceQuery.isError ? 'تعذر التحقق من الفاتورة لهذا الحجز. يمكنك مراجعة صفحة حجوزاتك.' : `تم تسجيل الدفع، رقم المبلغ المرجعي ${booking?.totalPrice ?? 0} درهم، وسيظهر المستند بعد اكتمال الحفظ.`}</p>}
          </div>

          {!isPending && (
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Stamp className="w-5 h-5 text-amber-400" />
                <div className="text-right">
                  <div className="text-xs font-bold text-white">إدراج الختم الرقمي الرسمي للوكالة</div>
                  <div className="text-[10px] text-slate-400">يثبت المصداقية القانونية والاعتماد الرسمي للوكالة</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={includeOfficialStamp}
                onChange={(e) => setIncludeOfficialStamp(e.target.checked)}
                className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
              />
            </div>
          )}

          {!isPending && (
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3 text-right">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-amber-400" /> التوقيع الإلكتروني (ارسم توقيعك في المربع أدناه):
                </label>
                {hasSigned && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                    <Check className="w-3 h-3" /> تم التوقيع بنجاح
                  </span>
                )}
              </div>

              <div className="bg-white rounded-xl overflow-hidden border border-slate-700 relative shadow-inner cursor-crosshair">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={160}
                  className="w-full h-36 touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                {!hasSigned && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-xs">
                    ارسم توقيعك هنا بالإصبع أو الفأرة
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  {hasSigned ? 'التوقيع جاهز للاعتماد في العقد' : 'يرجى رسم التوقيع أعلاه'}
                </span>
                <button
                  onClick={clearSignature}
                  type="button"
                  className="bg-slate-800 hover:bg-slate-700 text-amber-400 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-amber-500/20"
                >
                  <Eraser className="w-3.5 h-3.5" /> مسح وإعادة المحاولة
                </button>
              </div>
            </div>
          )}

          {contractType && isPending && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-right space-y-2">
              <div className="flex items-center gap-3">
                <FileCheck className="h-6 w-6 text-amber-400" />
                <div>
                  <h2 className="text-sm font-bold text-white">عقد الكراء جاهز بعد الاعتماد</h2>
                  <p className="text-[11px] text-slate-300">سيتم إنشاء العقد تلقائياً عندما يقبل المالك طلب الحجز. لا يوجد عقد نهائي في هذه المرحلة.</p>
                </div>
              </div>
            </div>
          )}

          {contractType && !isPending && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-right space-y-3">
              <div className="flex items-center gap-3">
                <FileCheck className="h-6 w-6 text-amber-400" />
                <div>
                  <h2 className="text-sm font-bold text-white">عقد الكراء {contractType === 'commercial' ? 'التجاري' : 'المهني'}</h2>
                  <p className="text-[11px] text-slate-300">يتم توليد العقد تلقائياً بعد تأكيد الحجز، ويتضمن بيانات الطرفين والمحل والكراء والالتزامات.</p>
                </div>
              </div>
              {isCommercialContractGenerating ? (
                <div className="flex items-center gap-2 text-xs text-amber-200" role="status">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
                  جاري تجهيز عقد PDF...
                </div>
              ) : commercialContractUrl ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-[11px] text-emerald-300">جاهز للتحميل — المرجع: {commercialContractReference}</span>
                  <a
                    href={commercialContractUrl}
                    download={`ALTUSplace-${contractType}-lease-${commercialContractReference}.pdf`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-amber-300"
                  >
                    <Download className="h-4 w-4" /> تحميل عقد الكراء PDF
                  </a>
                </div>
              ) : (
                <p className="text-xs text-rose-300">تعذر إنشاء العقد تلقائياً. يمكنك إعادة تحميل الصفحة للمحاولة مرة أخرى.</p>
              )}
              <p className="text-[10px] leading-5 text-slate-400">تنبيه: هذا قالب تقني يجب مراجعته واعتماده من طرف محامٍ أو موثق مغربي قبل التوقيع أو الاستعمال الفعلي.</p>
            </div>
          )}

          <div className="space-y-4 pt-2">
            <Button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF || isPending}
              type="button"
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-4 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
            >
              {isGeneratingPDF ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>جاري توليد ملف الـ PDF وتجهيز الختم...</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>{isPending ? 'يتاح تنزيل العقد بعد موافقة المالك' : 'تحميل عقد الإيجار الرقمي المذيل بالتوقيع (PDF)'}</span>
                </>
              )}
            </Button>

            {canContactAgency && (
              <Button
                type="button"
                onClick={handleWhatsappContact}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-emerald-900/30 transition-all text-xs"
              >
                <span>التواصل مع الوكالة عبر واتساب</span>
              </Button>
            )}

            <Button
              onClick={handleEmailContact}
              type="button"
              disabled={isPending}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5v10a2 2 0 002-2 2 0 00-2 2z" />
              </svg>
              <span>{isPending ? 'تتوفر رسالة البريد بعد اعتماد الحجز' : 'فتح رسالة بريد لإرفاق العقد الموقع (PDF)'}</span>
            </Button>

            <Button
              onClick={() => setLocation('/')}
              type="button"
              variant="outline"
              className="w-full border-slate-700 text-slate-200 hover:bg-slate-800 py-3 rounded-xl flex items-center justify-center gap-2 text-xs"
            >
              <Home className="w-4 h-4" />
              <span>العودة إلى الصفحة الرئيسية</span>
            </Button>
          </div>
        </div>
      </div>

      {/* نافذة التأكيد المرئية المنبثقة فور نجاح التحميل */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-amber-500/40 p-8 rounded-3xl max-w-md w-full text-center space-y-6 shadow-2xl relative">
            <button
              onClick={() => setShowDownloadModal(false)}
              className="absolute top-4 left-4 p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-20 h-20 bg-amber-500/20 border border-amber-500/40 rounded-full flex items-center justify-center mx-auto text-amber-400 animate-bounce">
              <FileCheck className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <span className="bg-amber-500/15 text-amber-400 text-xs font-bold px-3 py-1 rounded-full border border-amber-500/30">
                عملية ناجحة 100%
              </span>
              <h2 className="text-2xl font-extrabold text-white">تم تحميل عقد الإيجار بنجاح!</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                تم حفظ وثيقة عقد الإيجار الرقمي المذيل بتوقيعك الإلكتروني والختم الرسمي للوكالة على جهازك بنجاح. رقم مرجع العقد: <span className="text-amber-400 font-bold">{bookingRef}</span>
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Button
                onClick={() => setShowDownloadModal(false)}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-3.5 rounded-xl text-xs"
              >
                حسناً، متابعة التصفح
              </Button>
              {canContactAgency && (
                <Button
                  type="button"
                  onClick={handleWhatsappContact}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl text-xs"
                >
                  التواصل مع الوكالة عبر واتساب
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
