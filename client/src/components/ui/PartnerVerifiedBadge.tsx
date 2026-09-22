import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Small gold "verified partner" badge (وكالة موثقة / Agence vérifiée /
 * Verified partner). Rendered only when the listing owner is an onboarded
 * ALTUSplace partner account. The localized label is exposed both as an
 * accessible name (aria-label) and as a hover tooltip (title).
 */
export function PartnerVerifiedBadge({ className }: { className?: string }) {
  const { t } = useLanguage();
  const label = t("partnerVerified");
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-[#D4AF37] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#0B1B3A] shadow-md ring-1 ring-white/30",
        className,
      )}
    >
      <ShieldCheck className="h-3 w-3 shrink-0" />
      {label}
    </span>
  );
}