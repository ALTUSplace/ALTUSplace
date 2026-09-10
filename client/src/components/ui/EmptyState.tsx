import { cn } from "@/lib/utils";
import { Inbox, Search, Filter } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: "inbox" | "search" | "filter" | React.ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ title, description, icon = "inbox", action, className }: EmptyStateProps) {
  const Icon = typeof icon === "string"
    ? icon === "inbox" ? Inbox : icon === "search" ? Search : Filter
    : null;

  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-border-subtle bg-bg-surface px-6 py-16 text-center", className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-bg-muted">
        {Icon ? <Icon className="h-7 w-7 text-ink-tertiary" /> : icon}
      </div>
      <h3 className="text-base font-semibold text-ink-primary">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-secondary">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent-indigo px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-accent-indigo-hover hover:shadow-md active:scale-[0.98]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}