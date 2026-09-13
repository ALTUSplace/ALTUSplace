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
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex flex-col gap-3 max-w-2xl">
        {eyebrow && <span className="section-index">{eyebrow}</span>}
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl lg:text-4xl">{title}</h1>
        {subtitle && <p className="text-sm text-ink-secondary sm:text-base">{subtitle}</p>}
      </div>
      {action && (
        <a
          href={action.href}
          onClick={action.onClick}
          className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-accent-clay transition-colors hover:text-accent-clay-hover"
        >
          <span className="link-underline">{action.label}</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </a>
      )}
    </div>
  );
}