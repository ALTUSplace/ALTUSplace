import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Calendar as CalendarIcon, Check, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface InteractiveCalendarProps {
  listingId: number;
  bookedDates?: { start: string; end: string }[];
  onDateSelect?: (startDate: string, endDate: string) => void;
}

export default function InteractiveCalendar({ listingId, bookedDates = [], onDateSelect }: InteractiveCalendarProps) {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const activeBookings = bookedDates;

  // Generate next 30 days for display
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  const isBooked = (dateStr: string) => {
    return activeBookings.some(b => dateStr >= b.start && dateStr <= b.end);
  };

  const handleDateClick = (dateStr: string) => {
    if (isBooked(dateStr)) {
      toast.error('هذا التاريخ محجوز مسبقاً وغير متاح للكراء');
      return;
    }

    if (!startDate || (startDate && endDate)) {
      setStartDate(dateStr);
      setEndDate('');
      toast.info(`تم تحديد تاريخ البدء: ${dateStr}`);
    } else if (startDate && !endDate) {
      if (dateStr < startDate) {
        setStartDate(dateStr);
        toast.info(`تم تحديث تاريخ البدء: ${dateStr}`);
      } else {
        // Check if any booked date lies between startDate and dateStr
        const hasConflict = activeBookings.some(b => 
          (b.start >= startDate && b.start <= dateStr) || 
          (b.end >= startDate && b.end <= dateStr) ||
          (b.start <= startDate && b.end >= dateStr)
        );

        if (hasConflict) {
          toast.error('الفترة المحددة تتداخل مع مواعيد محجوزة مسبقاً');
          return;
        }

        setEndDate(dateStr);
              toast.success(`تم اختيار الفترة: من ${startDate} إلى ${dateStr}`);
        if (onDateSelect) {
          onDateSelect(startDate, dateStr);
        }
      }
    }
  };

  return (
    <Card className="p-6 border-border bg-card shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">التقويم التفاعلي للتوفر والحجوزات</h3>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span> متاح</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span> محجوز (مغلق)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary inline-block"></span> اختيارك</span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        اختر تاريخ البدء وتاريخ النهاية لحجز هذا العنصر. الأيام الحمراء غير قابلة للضغط أو الحجز.
      </p>

      {/* Days Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        {days.map((dateStr) => {
          const booked = isBooked(dateStr);
          const isSelected = (startDate && dateStr === startDate) || (endDate && dateStr === endDate) || (startDate && endDate && dateStr > startDate && dateStr < endDate);

          return (
            <button
              key={dateStr}
              type="button"
              disabled={booked}
              onClick={() => handleDateClick(dateStr)}
              className={`p-3 rounded-xl text-center text-xs font-semibold transition-all hover:scale-[1.02] hover:shadow-md hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background flex flex-col items-center justify-center gap-1 ${
                booked 
                  ? 'bg-rose-500/10 text-rose-600 border border-rose-500/30 cursor-not-allowed opacity-75' 
                  : isSelected
                  ? 'bg-primary text-primary-foreground shadow-md scale-105 ring-2 ring-primary/40 ring-offset-1 ring-offset-background'
                  : 'bg-background hover:bg-muted border border-border text-foreground'
              }`}
            >
              <span className="opacity-75">{new Date(dateStr).toLocaleDateString('ar-MA', { weekday: 'short' })}</span>
              <span className="text-sm font-bold">{new Date(dateStr).getDate()} {new Date(dateStr).toLocaleDateString('ar-MA', { month: 'short' })}</span>
              {booked ? (
                <span className="text-[10px] text-rose-600 font-bold mt-0.5">محجوز</span>
              ) : isSelected ? (
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white mt-0.5">محدد</span>
              ) : (
                <span className="text-[10px] text-emerald-600 font-bold mt-0.5">متاح</span>
              )}
            </button>
          );
        })}
      </div>

      {startDate && (
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="text-sm">
            <span className="font-semibold text-muted-foreground">الفترة المحددة: </span>
            <span className="font-bold text-primary">{startDate}</span>
            {endDate && <span className="font-bold text-primary"> إلى {endDate}</span>}
          </div>
            <Button
            size="sm"
            onClick={() => {
              if (!endDate) {
                toast.error('يرجى تحديد تاريخ النهاية أيضاً');
                return;
              }
              onDateSelect?.(startDate, endDate);
              toast.info('تم تجهيز الفترة. راجع السعر ثم تابع إلى صفحة الحجز.');
            }}
          >
            متابعة إلى الحجز
          </Button>
        </div>
      )}
    </Card>
  );
}
