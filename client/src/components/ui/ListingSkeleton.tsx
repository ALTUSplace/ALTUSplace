import { cn } from "@/lib/utils";

interface ListingSkeletonProps {
  count?: number;
  className?: string;
}

export function ListingSkeleton({ count = 8, className }: ListingSkeletonProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-bg-surface">
          <div className="aspect-[4/3] animate-shimmer bg-skeleton-from" />
          <div className="flex flex-col gap-3 p-4">
            <div className="flex justify-between">
              <div className="h-4 w-2/3 animate-shimmer rounded bg-skeleton-from" />
              <div className="h-4 w-12 animate-shimmer rounded bg-skeleton-from" />
            </div>
            <div className="h-3 w-1/2 animate-shimmer rounded bg-skeleton-from" />
            <div className="flex gap-2">
              <div className="h-5 w-16 animate-shimmer rounded bg-skeleton-from" />
              <div className="h-5 w-16 animate-shimmer rounded bg-skeleton-from" />
            </div>
            <div className="mt-2 border-t border-border-subtle pt-2">
              <div className="h-3 w-1/3 animate-shimmer rounded bg-skeleton-from" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}