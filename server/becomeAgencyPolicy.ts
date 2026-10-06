/**
 * H1 — `auth.becomeAgency` privilege-elevation gate.
 *
 * Before this fix ANY authenticated account could POST `auth.becomeAgency`
 * and promote itself from `user` → `owner` (agency), writing an arbitrary
 * `agencyName` / `commercialRegister` into `users` with no approval step.
 * That is a direct horizontal→vertical privilege escalation: 30 of the 30
 * production accounts with role `user` could have reached the `owner` tier.
 *
 * The gate is pure so the policy is testable without a database:
 *
 *   1. An already-elevated role short-circuits to the pre-existing `CONFLICT`
 *      guard (behaviour preserved — see the original check in routers.ts).
 *   2. Otherwise the caller MUST own a `partner_applications` row with
 *      `status = 'approved'` (an admin-reviewed application). Anything else
 *      is `FORBIDDEN` (HTTP 403).
 *
 * Why an approved application and not an admin-granted role: an admin
 * elevation already goes through `admin.updateUserRole`, which writes
 * `user.role_updated` to the audit log and sets an elevated `role` — that
 * path is caught by (1). Accepting an admin grant here as well would let a
 * demoted account re-elevate itself, so the application row is the single
 * source of truth for this endpoint.
 *
 * NOTE: `partnerApplications` has no `userId` — the join key with `users` is
 * the normalized (trim + lowercase) email, which is how both rows are written
 * (`shared/partnerApplication.ts` lowercases on input; `partnerAuth.ts` uses
 * `emailSchema = z.string().trim().toLowerCase()...`).
 */

/** Roles that already hold (or are equivalent to) the agency/owner tier. */
export const ALREADY_ELEVATED_ROLES: readonly string[] = [
  "owner",
  "admin",
  "partner",
  "SUPER_ADMIN",
];

export type BecomeAgencyAccess =
  | { allowed: true }
  | { allowed: false; code: "CONFLICT" | "FORBIDDEN"; message: string };

export function isElevatedRole(role: string): boolean {
  return ALREADY_ELEVATED_ROLES.includes(role);
}

/**
 * Decide whether `auth.becomeAgency` may run for this caller.
 *
 * `hasApprovedApplication` must already reflect the DB lookup
 * (`partner_applications.email = <normalized user email> AND status = 'approved'`).
 */
export function evaluateBecomeAgencyAccess(input: {
  role: string;
  hasApprovedApplication: boolean;
}): BecomeAgencyAccess {
  if (isElevatedRole(input.role)) {
    return {
      allowed: false,
      code: "CONFLICT",
      message: "أنت مسجل بالفعل كوكالة تأجير أو مشرف.",
    };
  }
  if (!input.hasApprovedApplication) {
    return {
      allowed: false,
      code: "FORBIDDEN",
      message: "تعذر ترقية الحساب — يتطلب ذلك اعتماد طلب شراكة من الإدارة مسبقاً.",
    };
  }
  return { allowed: true };
}
