/**
 * WhatsApp deep-link helpers shared by the voucher, success and car detail
 * pages. wa.me expects an international digits-only number (no "+", no
 * separators) and an URL-encoded prefilled message.
 */

/**
 * Normalizes a phone number to the digits-only form wa.me expects.
 * Returns an empty string when the value is missing or too short to be a
 * real number (guards against placeholder content).
 */
export function normalizeWhatsAppNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 ? digits : '';
}

/**
 * Builds a `https://wa.me/<number>?text=<message>` deep link. Returns an
 * empty string when the phone number is unusable so callers can hide the
 * WhatsApp action instead of opening a broken link.
 */
export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string {
  const number = normalizeWhatsAppNumber(phone);
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * ALTUSplace concierge line used for WhatsApp CTAs on car/property pages and
 * listing cards whenever a partner has not shared their own phone number.
 * Configurable via VITE_WHATSAPP_SUPPORT_PHONE (international digits only);
 * the fallback is a clearly-placeholder Moroccan range that agencies replace.
 */
export const SUPPORT_WHATSAPP_NUMBER: string = (() => {
  const fallback = "212600000000";
  try {
    const configured = (import.meta.env.VITE_WHATSAPP_SUPPORT_PHONE as string | undefined)?.trim();
    return configured ? (normalizeWhatsAppNumber(configured) || fallback) : fallback;
  } catch {
    return fallback;
  }
})();

/** Builds a wa.me deep link to the ALTUSplace concierge (support) line. */
export function buildSupportWhatsAppUrl(message: string): string {
  return buildWhatsAppUrl(SUPPORT_WHATSAPP_NUMBER, message);
}

/**
 * Preferred contact deep link for a listing: uses the agency's own WhatsApp
 * number when available, otherwise falls back to the platform concierge line.
 * Returns '' only when neither number can be used.
 */
export function buildContactWhatsAppUrl(
  preferredPhone: string | null | undefined,
  message: string,
): string {
  const direct = buildWhatsAppUrl(preferredPhone, message);
  if (direct) return direct;
  return buildSupportWhatsAppUrl(message);
}
