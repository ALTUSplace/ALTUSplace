// ── Cash Plus / Wafacash offline voucher flow ────────────────────────────────
// Renter receives a unique numeric reference code and pays the amount in cash
// at the nearest agency. When the agency confirms collection, the staff/agent
// posts /api/webhooks/local-cash which marks the transaction paid. The code is
// valid for 24 hours (CASH_VOUCHER_TTL_MS); after that the transaction is
// considered expired and the booking frees up.

import { randomInt } from "node:crypto";

export const CASH_VOUCHER_TTL_MS = 24 * 60 * 60 * 1000;

const VOUCHER_PREFIXES: Record<"cashplus" | "wafacash", string> = {
  cashplus: "1",
  wafacash: "2",
};

/** 14-digit numeric reference, unique via the transactions index at the DB. */
export function generateCashVoucherReference(gateway: "cashplus" | "wafacash"): string {
  const randomPart = String(randomInt(0, 10_000_000_000_000)).padStart(13, "0");
  return `${VOUCHER_PREFIXES[gateway]}${randomPart}`;
}

export function cashVoucherExpiry(): Date {
  return new Date(Date.now() + CASH_VOUCHER_TTL_MS);
}

export type CashVoucherAgencySteps = { agency: string; steps: string[] };

/** Human-readable collection instructions shown in the checkout UI. */
export function cashVoucherAgencySteps(gateway: "cashplus" | "wafacash"): CashVoucherAgencySteps {
  if (gateway === "cashplus") {
    return {
      agency: "Cash Plus",
      steps: [
        "توجه إلى أقرب وكالة Cash Plus قربك.",
        "قدّم رقم المرجع النقدي الموضح أعلاه.",
        "ادفع المبلغ المطلوب نقداً (بالدرهم المغربي MAD).",
        "سيصلك تأكيد تلقائي بمجرد تسجيل الوكالة للدفع.",
      ],
    };
  }
  return {
    agency: "Wafacash",
    steps: [
      "توجه إلى أقرب وكالة Wafacash قربك.",
      "قدّم رقم المرجع النقدي الموضح أعلاه.",
      "ادفع المبلغ المطلوب نقداً (بالدرهم المغربي MAD).",
      "سيصلك تأكيد تلقائي بمجرد تسجيل الوكالة للدفع.",
    ],
  };
}