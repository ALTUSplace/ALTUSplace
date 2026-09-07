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
