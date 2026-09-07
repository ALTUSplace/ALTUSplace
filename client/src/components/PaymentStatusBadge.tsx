/**
 * PaymentStatusBadge.tsx - Visual payment status indicator for ALTUSplace
 * Displays payment and booking status with appropriate colors and icons
 */
import { CheckCircle2, Clock, XCircle, AlertCircle, Loader2, Receipt, CreditCard, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PaymentStatus = 'Succeeded' | 'Pending' | 'Processing' | 'Failed' | 'Cancelled';
export type BookingStatus = 'Pending' | 'Confirmed' | 'Cancelled';
export type InvoiceStatus = 'Issued' | 'Pending' | 'Void';

interface PaymentStatusBadgeProps {
  status: PaymentStatus | BookingStatus | InvoiceStatus;
  type?: 'payment' | 'booking' | 'invoice';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: typeof CheckCircle2 }> = {
  Succeeded: {
    label: 'تم الدفع',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: CheckCircle2,
  },
  Confirmed: {
    label: 'مؤكد',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: CheckCircle2,
  },
  Pending: {
    label: 'قيد الانتظار',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    icon: Clock,
  },
  Processing: {
    label: 'جاري المعالجة',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: Loader2,
  },
  Failed: {
    label: 'فشل الدفع',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: XCircle,
  },
  Cancelled: {
    label: 'ملغي',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: XCircle,
  },
  Issued: {
    label: 'تم الإصدار',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: Receipt,
  },
  Void: {
    label: 'ملغي',
    color: 'text-slate-700',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    icon: AlertCircle,
  },
};

const sizeConfig = {
  sm: { text: 'text-[10px]', padding: 'px-2 py-0.5', icon: 'w-3 h-3' },
  md: { text: 'text-xs', padding: 'px-2.5 py-1', icon: 'w-3.5 h-3.5' },
  lg: { text: 'text-sm', padding: 'px-3 py-1.5', icon: 'w-4 h-4' },
};

export function PaymentStatusBadge({
  status,
  type = 'payment',
  size = 'md',
  showIcon = true,
  className,
}: PaymentStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.Pending;
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-bold rounded-full border',
        config.color,
        config.bgColor,
        config.borderColor,
        sizeStyles.padding,
        sizeStyles.text,
        className
      )}
    >
      {showIcon && (
        <Icon className={cn(sizeStyles.icon, status === 'Processing' && 'animate-spin')} />
      )}
      {config.label}
    </span>
  );
}

interface PaymentMethodBadgeProps {
  method: 'cmi_card' | 'bank_transfer' | 'mobile_wallet';
  size?: 'sm' | 'md';
  className?: string;
}

const methodConfig: Record<string, { label: string; icon: typeof CreditCard; color: string }> = {
  cmi_card: { label: 'بطاقة بنكية', icon: CreditCard, color: 'text-blue-600' },
  bank_transfer: { label: 'تحويل بنكي', icon: Building2, color: 'text-emerald-600' },
  mobile_wallet: { label: 'محفظة إلكترونية', icon: CreditCard, color: 'text-purple-600' },
};

export function PaymentMethodBadge({ method, size = 'sm', className }: PaymentMethodBadgeProps) {
  const config = methodConfig[method];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        config.color,
        size === 'sm' ? 'text-[10px]' : 'text-xs',
        className
      )}
    >
      <Icon className={cn(size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
      {config.label}
    </span>
  );
}

interface TransactionReferenceProps {
  reference: string;
  className?: string;
}

export function TransactionReference({ reference, className }: TransactionReferenceProps) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(reference);
  };

  return (
    <button
      onClick={copyToClipboard}
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer',
        className
      )}
      title="نسخ الرقم المرجعي"
    >
      <span className="truncate max-w-[120px]">{reference}</span>
      <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </button>
  );
}

export default PaymentStatusBadge;