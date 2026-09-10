import type { ReactNode } from "react";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-700/40 ${className}`} aria-hidden="true" />;
}

export function MetricCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="mb-4 flex items-center justify-between">
        <SkeletonBlock className="h-5 w-5 rounded-md" />
        <SkeletonBlock className="h-4 w-14" />
      </div>
      <SkeletonBlock className="mb-2 h-7 w-2/3" />
      <SkeletonBlock className="h-3 w-1/2" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <SkeletonBlock className="h-8 w-24" />
        <SkeletonBlock className="h-8 w-24" />
        <SkeletonBlock className="h-8 w-24" />
      </div>
      <SkeletonBlock className="h-72 w-full" />
    </div>
  );
}

export function TableRowsSkeleton({ rows = 6, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <div className="flex gap-6 border-b border-slate-800 bg-slate-900/60 px-4 py-3">{Array.from({ length: cols }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-16 flex-1" />)}</div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-6 border-b border-slate-800/70 px-4 py-4 last:border-0">
          {Array.from({ length: cols }).map((_, col) => <SkeletonBlock key={col} className={`h-4 flex-1 ${col === 0 ? "w-10" : "w-16"}`} />)}
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 xl:col-span-2"><ChartSkeleton /></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div></div>
      </div>
      <TableRowsSkeleton />
    </div>
  );
}

export function BadgeSkeleton({ children }: { children?: ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">{children}</span>;
}