/**
 * Platform-standard rental conditions displayed transparently on car detail
 * cards and across the booking flow. The signed rental contract at pickup
 * remains the authoritative document for partner-specific deviations.
 */
export const RENTAL_TERMS = {
  /** Minimum driver age required at pickup. */
  minDriverAge: 21,
  /** Refundable security deposit (caution) in MAD. */
  securityDepositMad: 3000,
  /** Included daily mileage; extra kilometers are billed per contract. */
  dailyMileageKm: 200,
} as const;
