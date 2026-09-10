/**
 * Booking eligibility guard for identity verification.
 *
 * Only users whose identity is *approved* (status `verified`) — AND who hold an
 * approved document of the type required by the listing category — may create a
 * booking or pay for it. Statuses map to the product requirement as:
 *
 *   `unverified` -> "Unverified"     (never allowed to book/pay)
 *   `pending`    -> "Pending_Review" (never allowed until a human/provider approves)
 *   `verified`   -> "Verified"       (allowed, when the category document is on file)
 *   `rejected`   -> (not allowed until a compliant document is re-submitted)
 */

import { TRPCError } from "@trpc/server";
import { and, eq, desc } from "drizzle-orm";
import type { getDb } from "../db";
import { kycSubmissions, users } from "../../drizzle/schema";
import { KYC_DOCUMENT_REQUIREMENTS, requiredDocumentsForCategory, isDocumentExpired } from "./requirements";

export type KycDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type KycDenialReason =
  | "KYC_REQUIRED"
  | "KYC_PENDING"
  | "KYC_REJECTED"
  | "KYC_DOCUMENT_REQUIRED"
  | "KYC_EXPIRED_DOCUMENT";

export type KycEligibilityUser = {
  id: number;
  role?: string | null;
  kycVerificationStatus?: string | null;
};

const DENIAL_MESSAGES: Record<KycDenialReason, string> = {
  KYC_REQUIRED:
    "التحقق من الهوية مطلوب قبل إتمام الحجز / Vérification d'identité requise avant la réservation.",
  KYC_PENDING:
    "ملف التحقق من الهوية قيد المراجعة. لن تتمكن من الدفع حتى تتم الموافقة عليه / Votre vérification d'identité est en cours de révision.",
  KYC_REJECTED:
    "تم رفض وثيقة التحقق الخاصة بك. يرجى إعادة رفع وثيقة صالحة للمتابعة / Votre document d'identité a été refusé. Merci de soumettre un document valide.",
  KYC_DOCUMENT_REQUIRED:
    "وثيقة الهوية المطلوبة غير موثقة. يرجى رفع الوثيقة المناسبة قبل إتمام الحجز / Le document requis n'est pas encore vérifié.",
  KYC_EXPIRED_DOCUMENT:
    "الوثيقة المرفوعة منتهية الصلاحية. يرجى رفع وثيقة سارية قبل إتمام الحجز / Le document est expiré. Merci de soumettre un document en cours de validité.",
};

function denial(reason: KycDenialReason, requiredDocuments: readonly string[], status: string | null): TRPCError {
  return new TRPCError({
    code: "FORBIDDEN",
    message: DENIAL_MESSAGES[reason],
    cause: {
      kyc: { reason, status: status ?? "unverified", requiredDocuments },
    },
  });
}

type ApprovedDocumentRow = { documentType: string; expiryDate: Date | null };

/** Returns the approved document types the user holds (with expiry dates). */
async function approvedDocuments(db: KycDb, userId: number): Promise<ApprovedDocumentRow[]> {
  return db
    .select({ documentType: kycSubmissions.documentType, expiryDate: kycSubmissions.expiryDate })
    .from(kycSubmissions)
    .where(and(eq(kycSubmissions.userId, userId), eq(kycSubmissions.status, "Approved")));
}

/**
 * Throws a FORBIDDEN tRPC error unless the user may book this listing category.
 * Callers must ensure `db` is non-null. An empty/unknown category is treated as
 * a property (stay) requirement.
 */
export async function assertKycEligibleToBook(input: {
  db: KycDb;
  user: KycEligibilityUser;
  category: string | null | undefined;
}): Promise<void> {
  const { db, user, category } = input;
  // Platform admins are exempt from guest identity checks.
  if (user.role === "admin") return;

  const status = user.kycVerificationStatus ?? "unverified";
  const required: readonly string[] = requiredDocumentsForCategory(category);

  if (status === "unverified") throw denial("KYC_REQUIRED", required, status);
  if (status === "pending") throw denial("KYC_PENDING", required, status);
  if (status === "rejected") throw denial("KYC_REJECTED", required, status);

  const approved = (await approvedDocuments(db, user.id)).filter((row) => required.includes(row.documentType));
  if (approved.length === 0) throw denial("KYC_DOCUMENT_REQUIRED", required, status);

  // A verified-but-expired licence must not unlock a car booking.
  const expired = approved.some((row) => row.expiryDate !== null && isDocumentExpired(row.expiryDate));
  if (expired) throw denial("KYC_EXPIRED_DOCUMENT", required, status);
}

/**
 * Aggregated KYC state for the authenticated user — powers `kyc.status` and the
 * client-side checkout gates. Never exposes storage keys or raw document numbers.
 */
export async function getKycStatusPayload(input: { db: KycDb; userId: number }) {
  const { db, userId } = input;

  const [userRow] = await db
    .select({ kycVerificationStatus: users.kycVerificationStatus, kycVerifiedAt: users.kycVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) {
    return {
      status: "unverified" as const,
      kycVerifiedAt: null,
      requiredDocuments: { ...KYC_DOCUMENT_REQUIREMENTS },
      approvedDocumentTypes: [] as string[],
      pendingCount: 0,
      lastRejectionReason: null,
    };
  }

  const approvedRows = await approvedDocuments(db, userId);
  const pendingRows = await db
    .select({ id: kycSubmissions.id })
    .from(kycSubmissions)
    .where(and(eq(kycSubmissions.userId, userId), eq(kycSubmissions.status, "Pending")));
  const [rejectedRow] = await db
    .select({ rejectionReason: kycSubmissions.rejectionReason })
    .from(kycSubmissions)
    .where(and(eq(kycSubmissions.userId, userId), eq(kycSubmissions.status, "Rejected")))
    .orderBy(desc(kycSubmissions.reviewedAt))
    .limit(1);

  return {
    status: userRow.kycVerificationStatus ?? "unverified",
    kycVerifiedAt: userRow.kycVerifiedAt,
    requiredDocuments: { ...KYC_DOCUMENT_REQUIREMENTS },
    approvedDocumentTypes: approvedRows.map((row) => row.documentType).filter((value): value is string => Boolean(value)),
    pendingCount: pendingRows.length,
    lastRejectionReason: rejectedRow?.rejectionReason ?? null,
  };
}