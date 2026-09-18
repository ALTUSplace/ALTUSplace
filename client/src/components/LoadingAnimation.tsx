import { Car, Building2, Sparkles } from 'lucide-react';

interface LoadingAnimationProps {
  text?: string;
  subtext?: string;
}

export function LoadingAnimation({ 
  text = 'جاري المعالجة الذكية...', 
  subtext = 'نبحث عن أفضل العروض والخيارات المطابقة لطلبك' 
}: LoadingAnimationProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center" dir="rtl">
      <div className="relative flex items-center justify-center w-24 h-24 mb-6">
        {/* Outer Pulsing Glow */}
        <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
        
        {/* Rotating Golden Ring */}
        <div className="absolute inset-0 rounded-full border-4 border-amber-500/30 border-t-amber-400 animate-spin" />
        
        {/* Inner Pulsing Core */}
        <div className="relative z-10 flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 dark:bg-[#1C1C1E] border border-amber-500/50 shadow-xl">
          <div className="flex gap-1 items-center text-amber-400">
            <Car className="w-5 h-5 animate-bounce" />
            <Building2 className="w-5 h-5 animate-bounce delay-150" />
          </div>
        </div>
      </div>

      <div className="space-y-2 max-w-sm">
        <h3 className="text-xl font-black text-white flex items-center justify-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
          {text}
        </h3>
        <p className="text-sm text-slate-400 dark:text-[#B0B0B8] font-medium">
          {subtext}
        </p>
      </div>

      {/* Progress Bar Animation */}
      <div className="w-48 h-1.5 bg-slate-800 dark:bg-[#2C2C2E] rounded-full mt-6 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 rounded-full animate-[shimmer_2s_infinite]" style={{ width: '60%' }} />
      </div>
    </div>
  );
}
