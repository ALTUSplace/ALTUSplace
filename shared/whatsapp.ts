import { z } from "zod";

/**
 * Normalizes a Moroccan mobile number to the digits-only international form
 * wa.me expects (no "+", no separators). Accepts:
 *   06XXXXXXXX / 07XXXXXXXX  -> 2126XXXXXXXX / 2127XXXXXXXX
 *   +2126XXXXXXXX / 2126XXXXXXXX
 * Spaces and dashes are stripped; a leading "0" is converted to "212".
 * Returns null when the input cannot be safely read as a valid Moroccan
 * mobile number (212 + 9 digits, first of which is 6 or 7).
 */
export function normalizeWaNumber(input: string): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[\s-]/g, "");
  if (!cleaned) return null;
  let digits = cleaned;
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = `212${digits.slice(1)}`;
  if (!/^212[6-7]\d{8}$/.test(digits)) return null;
  return digits;
}

/**
 * Shared zod schema for the agency WhatsApp field used by the profile /
 * onboarding forms and the agency settings router. Empty values are allowed;
 * non-empty values must normalize to a valid Moroccan mobile number.
 */
export const whatsappNumberSchema = z
  .string()
  .trim()
  .max(32)
  .refine(
    (value) => !value || normalizeWaNumber(value) !== null,
    "رقم الواتساب غير صالح - أدخل 06XXXXXXXX أو +2126XXXXXXXX.",
  )
  .optional()
  .nullable();

/**
 * Pre-filled message sent to the agency from click-to-chat CTAs on listing
 * detail pages and the booking success screen.
 */
export function buildAgencyWhatsAppMessage(title: string, id: number | string): string {
  return `سلام، مهتم بـ: ${title} (مرجع #${id}) من ALTUSplace. واش متاح؟`;
}

/**
 * Builds a `https://wa.me/<number>?text=<message>` deep link. Returns an
 * empty string when the phone number is unusable so callers can hide the
 * WhatsApp action instead of opening a broken link.
 */
export function buildWaMeUrl(number: string | null | undefined, message: string): string {
  const normalized = number ? normalizeWaNumber(number) : null;
  if (!normalized) return "";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}