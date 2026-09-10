import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/useMobile";

interface BookingWidgetProps {
  pricePerDay: number;
  currency?: string;
  minNights?: number;
  maxGuests?: number;
  rating?: number;
  reviewCount?: number;
  onReserve?: (data: { checkIn: string; checkOut: string; guests: number }) => void;
  className?: string;
}

export function BookingWidget(props: BookingWidgetProps) {
  const { pricePerDay, currency = "MAD", minNights = 1, maxGuests = 10, rating, reviewCount, onReserve, className } = props;
  const isMobile = useIsMobile();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const nights = checkIn && checkOut ? Math.max(1, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)) : minNights;
  const subtotal = pricePerDay * nights;
  const serviceFee = Math.round(subtotal * 0.1);
  const total = subtotal + serviceFee;
  const handleReserve = () => { if (onReserve && checkIn && checkOut) onReserve({ checkIn, checkOut, guests }); };

  const widgetContent = (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-ink-primary">{pricePerDay.toLocaleString()}</span>
        <span className="text-sm font-medium text-ink-secondary">{currency}</span>
        <span className="text-sm text-ink-tertiary">/ night</span>
      </div>
      {rating && (<div className="flex items-center gap-1.5 text-sm"><span className="font-semibold text-ink-primary">★ {rating.toFixed(1)}</span>{reviewCount && <span className="text-ink-tertiary">· {reviewCount} reviews</span>}</div>)}
      <div className="rounded-xl border border-border-default overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-border-default">
          <div className="px-3 py-2.5"><label className="block text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">Check-in</label><input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="mt-1 w-full bg-transparent text-sm font-medium text-ink-primary outline-none" /></div>
          <div className="px-3 py-2.5"><label className="block text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">Check-out</label><input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="mt-1 w-full bg-transparent text-sm font-medium text-ink-primary outline-none" /></div>
        </div>
        <div className="border-t border-border-default px-3 py-2.5"><label className="block text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">Guests</label><div className="mt-1 flex items-center justify-between"><span className="text-sm font-medium text-ink-primary">{guests} guest{guests > 1 ? "s" : ""}</span><div className="flex items-center gap-2"><button onClick={() => setGuests(Math.max(1, guests - 1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-border-default text-ink-secondary transition-colors hover:bg-bg-muted" aria-label="Decrease guests">−</button><button onClick={() => setGuests(Math.min(maxGuests, guests + 1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-border-default text-ink-secondary transition-colors hover:bg-bg-muted" aria-label="Increase guests">+</button></div></div></div>
      </div>
      <Button onClick={handleReserve} disabled={!checkIn || !checkOut} className="w-full rounded-xl bg-accent-indigo py-3.5 text-sm font-bold text-white shadow-md transition-all duration-200 hover:bg-accent-indigo-hover hover:shadow-lg disabled:opacity-50">Reserve</Button>
      <p className="text-center text-xs text-ink-tertiary">You won't be charged yet</p>
      <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        <div className="flex justify-between text-sm"><span className="text-ink-secondary underline decoration-dotted">{pricePerDay.toLocaleString()} × {nights} night{nights > 1 ? "s" : ""}</span><span className="font-medium text-ink-primary">{subtotal.toLocaleString()} {currency}</span></div>
        <div className="flex justify-between text-sm"><span className="text-ink-secondary underline decoration-dotted">Service fee</span><span className="font-medium text-ink-primary">{serviceFee.toLocaleString()} {currency}</span></div>
        <div className="flex justify-between border-t border-border-subtle pt-3"><span className="text-sm font-bold text-ink-primary">Total</span><span className="text-sm font-bold text-ink-primary">{total.toLocaleString()} {currency}</span></div>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-bg-muted px-3 py-2.5"><ShieldCheck className="h-4 w-4 text-accent-green" /><span className="text-xs text-ink-secondary">Secure payment · Free cancellation before check-in</span></div>
    </div>
  );

  if (isMobile) {
    return (
      <div className={cn("fixed bottom-0 left-0 right-0 z-50 border-t border-border-subtle bg-bg-surface px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]", className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1"><span className="text-lg font-bold text-ink-primary">{pricePerDay.toLocaleString()}</span><span className="text-xs font-medium text-ink-secondary">{currency}/night</span></div>
          <Sheet><SheetTrigger asChild><Button className="rounded-xl bg-accent-indigo px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-accent-indigo-hover">Reserve</Button></SheetTrigger><SheetContent side="bottom" className="rounded-t-2xl px-5 pb-8 pt-4"><SheetHeader className="mb-4"><SheetTitle className="text-right text-lg font-bold text-ink-primary">Booking details</SheetTitle></SheetHeader>{widgetContent}</SheetContent></Sheet>
        </div>
      </div>
    );
  }

  return (<div className={cn("sticky top-24 rounded-2xl border border-border-subtle bg-bg-surface p-5 shadow-md", className)}>{widgetContent}</div>);
}