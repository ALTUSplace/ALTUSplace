import { Phone } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { buildContactWhatsAppUrl, buildWhatsAppUrl } from "@/lib/whatsapp";

interface FloatingWhatsAppButtonProps {
  /**
   * Agency/owner WhatsApp number for the listing (international digits). When
   * missing or unusable the button falls back to the ALTUSplace support line
   * (VITE_WHATSAPP_SUPPORT_PHONE) instead of breaking the deep link.
   */
  phone?: string | null;
  /** Listing title inserted into the pre-filled message. */
  title: string;
  /** Listing city inserted into the pre-filled message. */
  city: string;
  /** Optional analytics hook (e.g. firing a whatsapp_click event). */
  onContact?: () => void;
}

/**
 * Floating WhatsApp CTA for listing detail pages. Fixed bottom-right on desktop,
 * bottom-left on mobile (stacked above the global AI-chat widget), 60px on
 * desktop / 50px on mobile, green (#25D366) with a pulsing ring every 3s and a
 * keyboard/focus-visible ring. Opens `https://wa.me/<phone>?text=<message>`
 * with a locale-aware pre-filled message.
 */
export function FloatingWhatsAppButton({ phone, title, city, onContact }: FloatingWhatsAppButtonProps) {
  const { t } = useLanguage();
  const message = t("waMessage").replace("{title}", title).replace("{city}", city);
  const hasDirectNumber = Boolean(buildWhatsAppUrl(phone, message));
  const url = buildContactWhatsAppUrl(phone, message);
  if (!url) return null;
  const label = hasDirectNumber ? t("waContactAgency") : t("waContactSupport");

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      onClick={onContact}
      className="group fixed bottom-24 left-5 z-50 flex h-[50px] w-[50px] items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_10px_25px_-5px_rgba(37,211,102,0.55)] transition-transform duration-200 ease-out hover:scale-110 focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a8c46] md:bottom-6 md:right-6 md:left-auto md:h-[60px] md:w-[60px]"
    >
      <span aria-hidden="true" className="wa-pulse-ring absolute inset-0 rounded-full bg-[#25D366]" />
      <span className="relative rounded-full bg-[#25D366] shadow-inner" aria-hidden="true">
        <Phone className="h-6 w-6 fill-current md:h-7 md:w-7" />
      </span>
    </a>
  );
}