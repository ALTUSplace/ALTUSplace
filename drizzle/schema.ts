import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["renter", "owner", "admin", "user", "SUPER_ADMIN"]);
export const vendorTierEnum = pgEnum("vendor_tier", ["bronze", "silver", "gold"]);
export const accountStatusEnum = pgEnum("account_status", ["active", "suspended", "banned"]);
export const listingStatusEnum = pgEnum("listing_status", ["Pending", "Approved", "Available", "Rented", "Rejected", "Published"]);
export const rentalPeriodEnum = pgEnum("rental_period", ["daily", "monthly", "yearly"]);
export const icalSyncStatusEnum = pgEnum("ical_sync_status", ["never", "ok", "error"]);
export const analyticsEventTypeEnum = pgEnum("analytics_event_type", ["view", "whatsapp_click", "contact_click"]);
export const bookingStatusEnum = pgEnum("booking_status", ["Pending", "Confirmed", "Cancelled"]);
export const applicantRoleEnum = pgEnum("applicant_role", ["renter", "owner", "company"]);
export const kycSubmissionStatusEnum = pgEnum("kyc_submission_status", ["Pending", "Approved", "Rejected"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cmi_card", "bank_transfer"]);
export const paymentStatusEnum = pgEnum("payment_status", ["Pending", "Succeeded", "Failed"]);
export const leaseTypeEnum = pgEnum("lease_type", ["commercial", "professional"]);
export const contractStatusEnum = pgEnum("contract_status", ["Draft", "Generated", "Signed"]);
export const notificationTypeEnum = pgEnum("notification_type", ["booking_new", "booking_accepted", "booking_rejected", "listing_approved", "listing_rejected", "lease_expiring", "voucher_issued", "system"]);
export const emailStatusEnum = pgEnum("email_status", ["not_sent", "sent", "skipped", "failed"]);
export const commentStatusEnum = pgEnum("comment_status", ["visible", "hidden"]);
export const refundRequestStatusEnum = pgEnum("refund_request_status", ["Pending", "Approved", "Rejected", "Paid"]);
export const commissionModeEnum = pgEnum("commission_mode", ["percent", "flat"]);
export const escrowTransferStatusEnum = pgEnum("escrow_transfer_status", ["pending", "sent", "held", "failed", "released"]);
export const escrowStatusEnum = pgEnum("escrow_status", ["held", "releasable", "released", "frozen", "mediated"]);
export const payoutMethodEnum = pgEnum("payout_method", ["bank_transfer", "cash_plus", "wafacash"]);
export const payoutStatusEnum = pgEnum("payout_status", ["Pending", "Approved", "Paid", "Rejected"]);
export const voucherStatusEnum = pgEnum("voucher_status", ["Issued", "Revoked"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["Pending", "Issued"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["Open", "UnderReview", "Resolved", "Rejected"]);
export const supportTicketStatusEnum = pgEnum("support_ticket_status", ["Open", "InProgress", "Resolved"]);

export const users = pgTable("users", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  whatsappPhone: varchar("whatsapp_phone", { length: 32 }),
  commercialRegister: varchar("commercial_register", { length: 120 }),
  agencyName: varchar("agency_name", { length: 180 }),
  agencyLogoUrl: text("agency_logo_url"),
  agencyPhone: varchar("agency_phone", { length: 32 }),
  agencyEmail: varchar("agency_email", { length: 320 }),
  agencyAddress: varchar("agency_address", { length: 255 }),
  agencyWebsite: varchar("agency_website", { length: 255 }),
  agencyLatitude: varchar("agency_latitude", { length: 32 }),
  agencyLongitude: varchar("agency_longitude", { length: 32 }),
  agencyHours: text("agency_hours"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: userRoleEnum("role").default("user").notNull(),
  vendorTier: vendorTierEnum("vendor_tier").default("bronze").notNull(), // commission tier: Bronze | Silver | Gold
  stripeAccountId: varchar("stripe_account_id", { length: 120 }), // Stripe Connect express account for vendor payouts
  accountStatus: accountStatusEnum("account_status").default("active").notNull(),
  kycVerificationStatus: varchar("kyc_verification_status", { length: 20 }).default("unverified").notNull(), // unverified | pending | verified | rejected
  kycVerifiedAt: timestamp("kyc_verified_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  legalConsentVersion: varchar("legal_consent_version", { length: 80 }),
  legalConsentAt: timestamp("legal_consent_at"),
});

export const listings = pgTable("listings", {
  id: integer("listing_id").generatedAlwaysAsIdentity().primaryKey(),
  ownerId: integer("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }).notNull(), // car أو real_estate
  pricePerDay: integer("price_per_day").notNull(),
  imageUrl: text("image_url"),
  status: listingStatusEnum("status").default("Published").notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  city: varchar("city", { length: 64 }).default("الدار البيضاء").notNull(),
  fuelType: varchar("fuel_type", { length: 32 }).default("ديزل"),
  transmission: varchar("transmission", { length: 32 }).default("أوتوماتيك"),
  rooms: integer("rooms").default(0),
  officeType: varchar("office_type", { length: 64 }),
  rentalPeriod: rentalPeriodEnum("rental_period"),
  amenities: text("amenities"),
  availability: text("availability"), // JSON array of blocked date ranges managed by the owner
  icalImportUrl: text("ical_import_url"), // private external calendar URL, never returned by public listing queries
  icalExportToken: varchar("ical_export_token", { length: 96 }).unique(),
  icalImportedRanges: text("ical_imported_ranges"), // JSON array of normalized external blocked ranges
  icalLastSyncedAt: timestamp("ical_last_synced_at"),
  icalSyncStatus: icalSyncStatusEnum("ical_sync_status").default("never").notNull(),
  icalSyncError: varchar("ical_sync_error", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  cityIdx: index("listings_city_idx").on(table.city),
  categoryIdx: index("listings_category_idx").on(table.category),
  pricePerDayIdx: index("listings_price_per_day_idx").on(table.pricePerDay),
  statusIdx: index("listings_status_idx").on(table.status),
  ownerIdIdx: index("listings_owner_id_idx").on(table.ownerId),
  searchCompositeIdx: index("listings_search_composite_idx").on(table.city, table.category, table.status),
}));

export const listingAnalyticsEvents = pgTable("listing_analytics_events", {
  id: integer("event_id").generatedAlwaysAsIdentity().primaryKey(),
  listingId: integer("listing_id").notNull(),
  eventType: analyticsEventTypeEnum("event_type").notNull(),
  visitorKey: varchar("visitor_key", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  listingEventIdx: index("listing_analytics_listing_event_idx").on(table.listingId, table.eventType),
  listingCreatedIdx: index("listing_analytics_listing_created_idx").on(table.listingId, table.createdAt),
}));

export const bookings = pgTable("bookings", {
  id: integer("booking_id").generatedAlwaysAsIdentity().primaryKey(),
  renterId: integer("renter_id").notNull(),
  listingId: integer("listing_id").notNull(),
  secondaryListingId: integer("secondary_listing_id"), // للباقات المدمجة (عقاب + سيارة)
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  totalPrice: integer("total_price").notNull(),
  commissionFee: integer("commission_fee").notNull(), // 10% عمولة المنصة
  netProfit: integer("net_profit").notNull(), // صافي ربح الشريك
  status: bookingStatusEnum("status").default("Pending").notNull(),
  cancellationPolicyVersion: varchar("cancellation_policy_version", { length: 80 }),
  cancellationPolicySnapshot: text("cancellation_policy_snapshot"),
  cancellationPolicyFingerprint: varchar("cancellation_policy_fingerprint", { length: 80 }),
  cancellationPolicyAcceptedAt: timestamp("cancellation_policy_accepted_at"),
  cancellationPolicyAcceptedBy: integer("cancellation_policy_accepted_by"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  listingStatusDatesIdx: index("bookings_listing_status_dates_idx").on(table.listingId, table.status, table.startDate, table.endDate),
  renterIdIdx: index("bookings_renter_id_idx").on(table.renterId),
  statusIdx: index("bookings_status_idx").on(table.status),
}));

export const reviews = pgTable("reviews", {
  id: integer("review_id").generatedAlwaysAsIdentity().primaryKey(),
  bookingId: integer("booking_id").notNull(),
  listingId: integer("listing_id").notNull(),
  userId: integer("user_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const kycSubmissions = pgTable("kyc_submissions", {
  id: integer("kyc_id").generatedAlwaysAsIdentity().primaryKey(),
  userId: integer("user_id").notNull(),
  applicantRole: applicantRoleEnum("applicant_role").default("renter").notNull(),
  documentType: varchar("document_type", { length: 24 }).notNull(), // cni | driving_license | commercial_register | passport | national_id
  documentKey: varchar("document_key", { length: 512 }).notNull(),
  originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 40 }).default("manual").notNull(), // manual | stripe_identity | persona
  providerSessionId: varchar("provider_session_id", { length: 128 }),
  fileSize: integer("file_size"),
  documentNumberMasked: varchar("document_number_masked", { length: 32 }),
  expiryDate: timestamp("expiry_date"),
  categoryContext: varchar("category_context", { length: 32 }), // car | property
  status: kycSubmissionStatusEnum("status").default("Pending").notNull(),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
}, (table) => ({
  providerSessionIdx: index("kyc_submissions_provider_session_idx").on(table.providerSessionId),
  userIdIdx: index("kyc_submissions_user_id_idx").on(table.userId),
}));

export const payments = pgTable("payments", {
  id: integer("payment_id").generatedAlwaysAsIdentity().primaryKey(),
  bookingId: integer("booking_id").notNull(),
  payerId: integer("payer_id").notNull(),
  method: paymentMethodEnum("method").notNull(),
  status: paymentStatusEnum("status").default("Pending").notNull(),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).default("MAD").notNull(),
  providerReference: varchar("provider_reference", { length: 120 }).notNull(),
  simulated: boolean("simulated").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("payments_booking_id_idx").on(table.bookingId),
  payerIdIdx: index("payments_payer_id_idx").on(table.payerId),
}));

export const commercialLeaseContracts = pgTable("commercial_lease_contracts", {
  id: integer("contract_id").generatedAlwaysAsIdentity().primaryKey(),
  bookingId: integer("booking_id").notNull().unique(),
  landlordId: integer("landlord_id").notNull(),
  tenantId: integer("tenant_id").notNull(),
  reference: varchar("reference", { length: 80 }).notNull().unique(),
  leaseType: leaseTypeEnum("lease_type").notNull(),
  landlordName: varchar("landlord_name", { length: 255 }).notNull(),
  landlordRc: varchar("landlord_rc", { length: 120 }),
  tenantName: varchar("tenant_name", { length: 255 }).notNull(),
  premises: text("premises").notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  monthlyRent: integer("monthly_rent").notNull(),
  deposit: integer("deposit").default(0).notNull(),
  pdfKey: varchar("pdf_key", { length: 512 }),
  status: contractStatusEnum("status").default("Generated").notNull(),
  legalNotice: text("legal_notice").notNull(),
  leaseEndReminderTaskUid: varchar("lease_end_reminder_task_uid", { length: 65 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: integer("notification_id").generatedAlwaysAsIdentity().primaryKey(),
  userId: integer("user_id").notNull(),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  href: varchar("href", { length: 512 }),
  entityType: varchar("entity_type", { length: 64 }),
  entityId: integer("entity_id"),
  readAt: timestamp("read_at"),
  emailStatus: emailStatusEnum("email_status").default("not_sent").notNull(),
  emailSentAt: timestamp("email_sent_at"),
  dedupeKey: varchar("dedupe_key", { length: 191 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userCreatedIdx: index("notifications_user_created_idx").on(table.userId, table.createdAt),
  userUnreadIdx: index("notifications_user_unread_idx").on(table.userId, table.readAt),
  notificationDedupeIdx: uniqueIndex("notifications_dedupe_idx").on(table.userId, table.dedupeKey),
}));

export const bookingMessages = pgTable("booking_messages", {
  id: integer("message_id").generatedAlwaysAsIdentity().primaryKey(),
  bookingId: integer("booking_id").notNull(),
  senderId: integer("sender_id").notNull(),
  recipientId: integer("recipient_id").notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bookingCreatedIdx: index("booking_messages_booking_created_idx").on(table.bookingId, table.createdAt),
  recipientUnreadIdx: index("booking_messages_recipient_unread_idx").on(table.recipientId, table.readAt),
}));

export const listingComments = pgTable("listing_comments", {
  id: integer("comment_id").generatedAlwaysAsIdentity().primaryKey(),
  listingId: integer("listing_id").notNull(),
  authorId: integer("author_id").notNull(),
  parentId: integer("parent_id"), // one-level replies: points at a top-level comment
  body: text("body").notNull(),
  status: commentStatusEnum("status").default("visible").notNull(),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  listingCreatedIdx: index("listing_comments_listing_created_idx").on(table.listingId, table.createdAt),
  authorIdx: index("listing_comments_author_idx").on(table.authorId),
}));

export const auditLogs = pgTable("audit_logs", {
  id: integer("audit_log_id").generatedAlwaysAsIdentity().primaryKey(),
  actorId: integer("actor_id").notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: integer("entity_id"),
  beforeData: text("before_data"),
  afterData: text("after_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  entityIdx: index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  actorCreatedIdx: index("audit_logs_actor_created_idx").on(table.actorId, table.createdAt),
}));

export const refundRequests = pgTable("refund_requests", {
  id: integer("refund_request_id").generatedAlwaysAsIdentity().primaryKey(),
  bookingId: integer("booking_id").notNull(),
  requestedBy: integer("requested_by").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  status: refundRequestStatusEnum("status").default("Pending").notNull(),
  adminNote: text("admin_note"),
  reviewedBy: integer("reviewed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
}, (table) => ({
  bookingIdx: index("refund_requests_booking_idx").on(table.bookingId, table.createdAt),
  requesterIdx: index("refund_requests_requester_idx").on(table.requestedBy, table.status),
}));

export const platformSettings = pgTable("platform_settings", {
  id: integer("setting_id").generatedAlwaysAsIdentity().primaryKey(),
  commissionRateBasisPoints: integer("commission_rate_basis_points").default(1000).notNull(),
  commissionMode: commissionModeEnum("commission_mode").default("percent").notNull(), // global default split: percentage or flat fee
  flatCommissionAmount: integer("flat_commission_amount").default(0).notNull(), // fixed platform fee in MAD for flat mode
  vatRateBasisPoints: integer("vat_rate_basis_points").default(2000).notNull(),
  platformName: varchar("platform_name", { length: 180 }).default("ALTUSplace").notNull(),
  contactEmail: varchar("contact_email", { length: 320 }),
  contactPhone: varchar("contact_phone", { length: 40 }),
  maintenanceMode: boolean("maintenance_mode").default(false).notNull(),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Per-vendor-tier commission overrides used by the dynamic commission
// controller. Bronze/Silver/Gold are the managed tiers; when a tier override
// exists it wins over the global platform default.
export const commissionTiers = pgTable("commission_tiers", {
  id: integer("tier_id").generatedAlwaysAsIdentity().primaryKey(),
  tier: vendorTierEnum("tier").notNull().unique(),
  mode: commissionModeEnum("mode").default("percent").notNull(),
  percentBasisPoints: integer("percent_basis_points").default(1000).notNull(),
  flatAmount: integer("flat_amount").default(0).notNull(), // fixed fee in MAD for flat mode
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Escrow ledger: one row per settled payment held until the posting date.
// Backs the multi-vendor escrow monitor and Stripe Connect payout lifecycle.
export const escrowEntries = pgTable("escrow_ledger", {
  id: integer("escrow_id").generatedAlwaysAsIdentity().primaryKey(),
  bookingId: integer("booking_id").notNull(),
  paymentId: integer("payment_id").notNull(),
  guestId: integer("guest_id").notNull(),
  vendorId: integer("vendor_id").notNull(),
  listingCategory: varchar("listing_category", { length: 64 }).notNull(), // car | real_estate (Properties vs Car Rentals)
  totalPaid: integer("total_paid").notNull(),
  platformCut: integer("platform_cut").notNull(),
  vendorPayoutShare: integer("vendor_payout_share").notNull(),
  releaseDate: timestamp("release_date").notNull(), // scheduled escrow release (booking end date)
  stripeTransferStatus: escrowTransferStatusEnum("stripe_transfer_status").default("pending").notNull(),
  stripeTransferId: varchar("stripe_transfer_id", { length: 120 }),
  status: escrowStatusEnum("status").default("held").notNull(),
  mediationNote: text("mediation_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdx: index("escrow_ledger_booking_idx").on(table.bookingId),
  vendorStatusIdx: index("escrow_ledger_vendor_status_idx").on(table.vendorId, table.status),
}));

export const payoutRequests = pgTable("payout_requests", {
  id: integer("payout_id").generatedAlwaysAsIdentity().primaryKey(),
  ownerId: integer("owner_id").notNull(),
  amount: integer("amount").notNull(),
  method: payoutMethodEnum("method").notNull(),
  status: payoutStatusEnum("status").default("Pending").notNull(),
  reference: varchar("reference", { length: 120 }),
  adminNote: text("admin_note"),
  reviewedBy: integer("reviewed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
}, (table) => ({
  ownerIdIdx: index("payout_requests_owner_id_idx").on(table.ownerId),
  statusIdx: index("payout_requests_status_idx").on(table.status),
}));

export const bookingVouchers = pgTable("booking_vouchers", {
  id: integer("voucher_id").generatedAlwaysAsIdentity().primaryKey(),
  bookingId: integer("booking_id").notNull().unique(),
  renterId: integer("renter_id").notNull(),
  code: varchar("code", { length: 80 }).notNull().unique(),
  qrPayload: text("qr_payload").notNull(),
  status: voucherStatusEnum("status").default("Issued").notNull(),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: integer("invoice_id").generatedAlwaysAsIdentity().primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 80 }).notNull().unique(),
  bookingId: integer("booking_id").notNull(),
  paymentId: integer("payment_id").notNull(),
  payerId: integer("payer_id").notNull(),
  subtotal: integer("subtotal").notNull(),
  commissionFee: integer("commission_fee").notNull(),
  vatRateBasisPoints: integer("vat_rate_basis_points").default(2000).notNull(),
  vatAmount: integer("vat_amount").notNull(),
  total: integer("total").notNull(),
  currency: varchar("currency", { length: 3 }).default("MAD").notNull(),
  status: invoiceStatusEnum("status").default("Issued").notNull(),
  cancellationPolicyVersion: varchar("cancellation_policy_version", { length: 80 }),
  cancellationPolicySnapshot: text("cancellation_policy_snapshot"),
  cancellationPolicyFingerprint: varchar("cancellation_policy_fingerprint", { length: 80 }),
  cancellationPolicyAcceptedAt: timestamp("cancellation_policy_accepted_at"),
  cancellationPolicyAcceptedBy: integer("cancellation_policy_accepted_by"),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("invoices_booking_id_idx").on(table.bookingId),
}));

export const disputes = pgTable("disputes", {
  id: integer("dispute_id").generatedAlwaysAsIdentity().primaryKey(),
  bookingId: integer("booking_id").notNull(),
  openedBy: integer("opened_by").notNull(),
  type: varchar("type", { length: 120 }).notNull(),
  description: text("description").notNull(),
  status: disputeStatusEnum("status").default("Open").notNull(),
  resolutionNote: text("resolution_note"),
  reviewedBy: integer("reviewed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  bookingIdIdx: index("disputes_booking_id_idx").on(table.bookingId),
  openedByIdx: index("disputes_opened_by_idx").on(table.openedBy),
}));

export const disputeAttachments = pgTable("dispute_attachments", {
  id: integer("attachment_id").generatedAlwaysAsIdentity().primaryKey(),
  disputeId: integer("dispute_id").notNull(),
  fileKey: varchar("file_key", { length: 512 }).notNull(),
  originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const supportTickets = pgTable("support_tickets", {
  id: integer("ticket_id").generatedAlwaysAsIdentity().primaryKey(),
  userId: integer("user_id").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  category: varchar("category", { length: 120 }).notNull(),
  description: text("description").notNull(),
  status: supportTicketStatusEnum("status").default("Open").notNull(),
  lastResponse: text("last_response"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("support_tickets_user_id_idx").on(table.userId),
  statusIdx: index("support_tickets_status_idx").on(table.status),
}));

// Translations table for caching machine translations
// Stores translated content for listings to avoid repeated API calls
export const translations = pgTable("translations", {
  id: integer("translation_id").generatedAlwaysAsIdentity().primaryKey(),
  listingId: integer("listing_id").notNull(),
  language: varchar("language", { length: 10 }).notNull(), // ar, fr, en
  field: varchar("field", { length: 50 }).notNull(), // title, description
  originalText: text("original_text").notNull(),
  translatedText: text("translated_text").notNull(),
  provider: varchar("provider", { length: 20 }).default("aws").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  listingLanguageFieldIdx: uniqueIndex("translation_listing_language_field_idx").on(table.listingId, table.language, table.field),
  listingLanguageIdx: index("translation_listing_language_idx").on(table.listingId, table.language),
}));

export type Translation = typeof translations.$inferSelect;
export type InsertTranslation = typeof translations.$inferInsert;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;
export type ListingAnalyticsEvent = typeof listingAnalyticsEvents.$inferSelect;
export type InsertListingAnalyticsEvent = typeof listingAnalyticsEvents.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type InsertReview = typeof reviews.$inferInsert;
export type KycSubmission = typeof kycSubmissions.$inferSelect;
export type InsertKycSubmission = typeof kycSubmissions.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type BookingMessage = typeof bookingMessages.$inferSelect;
export type InsertBookingMessage = typeof bookingMessages.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type ListingComment = typeof listingComments.$inferSelect;
export type InsertListingComment = typeof listingComments.$inferInsert;
export type RefundRequest = typeof refundRequests.$inferSelect;
export type InsertRefundRequest = typeof refundRequests.$inferInsert;
export type InsertNotification = typeof notifications.$inferInsert;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = typeof platformSettings.$inferInsert;
export type PayoutRequest = typeof payoutRequests.$inferSelect;
export type InsertPayoutRequest = typeof payoutRequests.$inferInsert;
export type BookingVoucher = typeof bookingVouchers.$inferSelect;
export type InsertBookingVoucher = typeof bookingVouchers.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;
export type CommercialLeaseContract = typeof commercialLeaseContracts.$inferSelect;
export type InsertCommercialLeaseContract = typeof commercialLeaseContracts.$inferInsert;
export type Dispute = typeof disputes.$inferSelect;
export type InsertDispute = typeof disputes.$inferInsert;
export type DisputeAttachment = typeof disputeAttachments.$inferSelect;
export type InsertDisputeAttachment = typeof disputeAttachments.$inferInsert;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;
export type CommissionTier = typeof commissionTiers.$inferSelect;
export type InsertCommissionTier = typeof commissionTiers.$inferInsert;
export type EscrowEntry = typeof escrowEntries.$inferSelect;
export type InsertEscrowEntry = typeof escrowEntries.$inferInsert;