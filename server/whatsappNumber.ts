/**
 * Best-effort normalizer for Moroccan phone numbers:
 * 0612345678 -> 212612345678, +212612345678 -> 212612345678.
 * Returns null when the value cannot be safely interpreted.
 */
export function normalizeWhatsAppNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits.length) return null;
  if (digits.startsWith("212")) return digits;
  if (digits.startsWith("0")) return `212${digits.slice(1)}`;
  if (digits.length <= 9) return `212${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}