import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = "Something went wrong", message = "An unexpected error occurred. Please try again.", onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/50 px-6 py-16 text-center dark:border-red-900/30 dark:bg-red-950/10", className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
        <AlertTriangle className="h-7 w-7 text-red-500" />
      </div>
      <h3 className="text-base font-semibold text-ink-primary">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-secondary">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-border-default bg-bg-surface px-5 py-2.5 text-sm font-semibold text-ink-primary shadow-sm transition-all duration-200 hover:bg-bg-muted active:scale-[0.98]"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      )}
    </div>
  );
}