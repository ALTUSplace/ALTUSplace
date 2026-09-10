import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}

export function PageHeader({ title, subtitle, eyebrow, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex flex-col gap-1">
        {eyebrow && <span className="text-xs font-bold uppercase tracking-widest text-accent-indigo">{eyebrow}</span>}
        <h1 className="text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl lg:text-4xl">{title}</h1>
        {subtitle && <p className="max-w-xl text-sm text-ink-secondary sm:text-base">{subtitle}</p>}
      </div>
      {action && (
        <a
          href={action.href}
          onClick={action.onClick}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent-indigo transition-colors hover:text-accent-indigo-hover"
        >
          {action.label}
          <ArrowRight className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}