import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar, index, uniqueIndex } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
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
  role: mysqlEnum("role", ["renter", "owner", "admin", "user"]).default("user").notNull(),
  accountStatus: mysqlEnum("account_status", ["active", "suspended", "banned"]).default("active").notNull(),
  kycVerificationStatus: mysqlEnum("kyc_verification_status", ["unverified", "pending", "verified", "rejected"]).default("unverified").notNull(),
  kycVerifiedAt: timestamp("kyc_verified_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  legalConsentVersion: varchar("legal_consent_version", { length: 80 }),
  legalConsentAt: timestamp("legal_consent_at"),
});

export const listings = mysqlTable("listings", {
  id: int("listing_id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }).notNull(), // car أو real_estate
  pricePerDay: int("price_per_day").notNull(),
  imageUrl: text("image_url"),
  status: mysqlEnum("status", ["Pending", "Approved", "Available", "Rented", "Rejected", "Published"]).default("Published").notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  city: varchar("city", { length: 64 }).default("الدار البيضاء").notNull(),
  fuelType: varchar("fuel_type", { length: 32 }).default("ديزل"),
  transmission: varchar("transmission", { length: 32 }).default("أوتوماتيك"),
  rooms: int("rooms").default(0),
  officeType: varchar("office_type", { length: 64 }),
  rentalPeriod: mysqlEnum("rental_period", ["daily", "monthly", "yearly"]),
  amenities: text("amenities"),
  availability: text("availability"), // JSON array of blocked date ranges managed by the owner
  icalImportUrl: text("ical_import_url"), // private external calendar URL, never returned by public listing queries
  icalExportToken: varchar("ical_export_token", { length: 96 }).unique(),
  icalImportedRanges: text("ical_imported_ranges"), // JSON array of normalized external blocked ranges
  icalLastSyncedAt: timestamp("ical_last_synced_at"),
  icalSyncStatus: mysqlEnum("ical_sync_status", ["never", "ok", "error"]).default("never").notNull(),
  icalSyncError: varchar("ical_sync_error", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const listingAnalyticsEvents = mysqlTable("listing_analytics_events", {
  id: int("event_id").autoincrement().primaryKey(),
  listingId: int("listing_id").notNull(),
  eventType: mysqlEnum("event_type", ["view", "whatsapp_click", "contact_click"]).notNull(),
  visitorKey: varchar("visitor_key", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  listingEventIdx: index("listing_analytics_listing_event_idx").on(table.listingId, table.eventType),
  listingCreatedIdx: index("listing_analytics_listing_created_idx").on(table.listingId, table.createdAt),
}));

export const bookings = mysqlTable("bookings", {
  id: int("booking_id").autoincrement().primaryKey(),
  renterId: int("renter_id").notNull(),
  listingId: int("listing_id").notNull(),
  secondaryListingId: int("secondary_listing_id"), // للباقات المدمجة (عقاب + سيارة)
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  totalPrice: int("total_price").notNull(),
  commissionFee: int("commission_fee").notNull(), // 10% عمولة المنصة
  netProfit: int("net_profit").notNull(), // صافي ربح الشريك
  status: mysqlEnum("status", ["Pending", "Confirmed", "Cancelled"]).default("Pending").notNull(),
  cancellationPolicyVersion: varchar("cancellation_policy_version", { length: 80 }),
  cancellationPolicySnapshot: text("cancellation_policy_snapshot"),
  cancellationPolicyFingerprint: varchar("cancellation_policy_fingerprint", { length: 80 }),
  cancellationPolicyAcceptedAt: timestamp("cancellation_policy_accepted_at"),
  cancellationPolicyAcceptedBy: int("cancellation_policy_accepted_by"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const reviews = mysqlTable("reviews", {
  id: int("review_id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull(),
  listingId: int("listing_id").notNull(),
  userId: int("user_id").notNull(),
  rating: int("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const kycSubmissions = mysqlTable("kyc_submissions", {
  id: int("kyc_id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  applicantRole: mysqlEnum("applicant_role", ["renter", "owner", "company"]).default("renter").notNull(),
  documentType: mysqlEnum("document_type", ["cni", "driving_license", "commercial_register"]).notNull(),
  documentKey: varchar("document_key", { length: 512 }).notNull(),
  originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["Pending", "Approved", "Rejected"]).default("Pending").notNull(),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
});

export const payments = mysqlTable("payments", {
  id: int("payment_id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull(),
  payerId: int("payer_id").notNull(),
  method: mysqlEnum("method", ["cmi_card", "bank_transfer"]).notNull(),
  status: mysqlEnum("status", ["Pending", "Succeeded", "Failed"]).default("Pending").notNull(),
  amount: int("amount").notNull(),
  currency: varchar("currency", { length: 3 }).default("MAD").notNull(),
  providerReference: varchar("provider_reference", { length: 120 }).notNull(),
  simulated: boolean("simulated").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const commercialLeaseContracts = mysqlTable("commercial_lease_contracts", {
  id: int("contract_id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull().unique(),
  landlordId: int("landlord_id").notNull(),
  tenantId: int("tenant_id").notNull(),
  reference: varchar("reference", { length: 80 }).notNull().unique(),
  leaseType: mysqlEnum("lease_type", ["commercial", "professional"]).notNull(),
  landlordName: varchar("landlord_name", { length: 255 }).notNull(),
  landlordRc: varchar("landlord_rc", { length: 120 }),
  tenantName: varchar("tenant_name", { length: 255 }).notNull(),
  premises: text("premises").notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  monthlyRent: int("monthly_rent").notNull(),
  deposit: int("deposit").default(0).notNull(),
  pdfKey: varchar("pdf_key", { length: 512 }),
  status: mysqlEnum("status", ["Draft", "Generated", "Signed"]).default("Generated").notNull(),
  legalNotice: text("legal_notice").notNull(),
  leaseEndReminderTaskUid: varchar("lease_end_reminder_task_uid", { length: 65 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = mysqlTable("notifications", {
  id: int("notification_id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  type: mysqlEnum("type", ["booking_new", "booking_accepted", "booking_rejected", "listing_approved", "listing_rejected", "lease_expiring", "voucher_issued", "system"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  href: varchar("href", { length: 512 }),
  entityType: varchar("entity_type", { length: 64 }),
  entityId: int("entity_id"),
  readAt: timestamp("read_at"),
  emailStatus: mysqlEnum("email_status", ["not_sent", "sent", "skipped", "failed"]).default("not_sent").notNull(),
  emailSentAt: timestamp("email_sent_at"),
  dedupeKey: varchar("dedupe_key", { length: 191 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userCreatedIdx: index("notifications_user_created_idx").on(table.userId, table.createdAt),
  userUnreadIdx: index("notifications_user_unread_idx").on(table.userId, table.readAt),
  notificationDedupeIdx: uniqueIndex("notifications_dedupe_idx").on(table.userId, table.dedupeKey),
}));

export const bookingMessages = mysqlTable("booking_messages", {
  id: int("message_id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull(),
  senderId: int("sender_id").notNull(),
  recipientId: int("recipient_id").notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  bookingCreatedIdx: index("booking_messages_booking_created_idx").on(table.bookingId, table.createdAt),
  recipientUnreadIdx: index("booking_messages_recipient_unread_idx").on(table.recipientId, table.readAt),
}));

export const auditLogs = mysqlTable("audit_logs", {
  id: int("audit_log_id").autoincrement().primaryKey(),
  actorId: int("actor_id").notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: int("entity_id"),
  beforeData: text("before_data"),
  afterData: text("after_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  entityIdx: index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  actorCreatedIdx: index("audit_logs_actor_created_idx").on(table.actorId, table.createdAt),
}));

export const refundRequests = mysqlTable("refund_requests", {
  id: int("refund_request_id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull(),
  requestedBy: int("requested_by").notNull(),
  amount: int("amount").notNull(),
  reason: text("reason").notNull(),
  status: mysqlEnum("status", ["Pending", "Approved", "Rejected", "Paid"]).default("Pending").notNull(),
  adminNote: text("admin_note"),
  reviewedBy: int("reviewed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
}, (table) => ({
  bookingIdx: index("refund_requests_booking_idx").on(table.bookingId, table.createdAt),
  requesterIdx: index("refund_requests_requester_idx").on(table.requestedBy, table.status),
}));

export const platformSettings = mysqlTable("platform_settings", {
  id: int("setting_id").autoincrement().primaryKey(),
  commissionRateBasisPoints: int("commission_rate_basis_points").default(1000).notNull(),
  vatRateBasisPoints: int("vat_rate_basis_points").default(2000).notNull(),
  platformName: varchar("platform_name", { length: 180 }).default("B2-Rent").notNull(),
  contactEmail: varchar("contact_email", { length: 320 }),
  contactPhone: varchar("contact_phone", { length: 40 }),
  maintenanceMode: boolean("maintenance_mode").default(false).notNull(),
  updatedBy: int("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const payoutRequests = mysqlTable("payout_requests", {
  id: int("payout_id").autoincrement().primaryKey(),
  ownerId: int("owner_id").notNull(),
  amount: int("amount").notNull(),
  method: mysqlEnum("method", ["bank_transfer", "cash_plus", "wafacash"]).notNull(),
  status: mysqlEnum("status", ["Pending", "Approved", "Paid", "Rejected"]).default("Pending").notNull(),
  reference: varchar("reference", { length: 120 }),
  adminNote: text("admin_note"),
  reviewedBy: int("reviewed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
});

export const bookingVouchers = mysqlTable("booking_vouchers", {
  id: int("voucher_id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull().unique(),
  renterId: int("renter_id").notNull(),
  code: varchar("code", { length: 80 }).notNull().unique(),
  qrPayload: text("qr_payload").notNull(),
  status: mysqlEnum("status", ["Issued", "Revoked"]).default("Issued").notNull(),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
});

export const invoices = mysqlTable("invoices", {
  id: int("invoice_id").autoincrement().primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 80 }).notNull().unique(),
  bookingId: int("booking_id").notNull(),
  paymentId: int("payment_id").notNull(),
  payerId: int("payer_id").notNull(),
  subtotal: int("subtotal").notNull(),
  commissionFee: int("commission_fee").notNull(),
  vatRateBasisPoints: int("vat_rate_basis_points").default(2000).notNull(),
  vatAmount: int("vat_amount").notNull(),
  total: int("total").notNull(),
  currency: varchar("currency", { length: 3 }).default("MAD").notNull(),
  status: mysqlEnum("status", ["Pending", "Issued"]).default("Issued").notNull(),
  cancellationPolicyVersion: varchar("cancellation_policy_version", { length: 80 }),
  cancellationPolicySnapshot: text("cancellation_policy_snapshot"),
  cancellationPolicyFingerprint: varchar("cancellation_policy_fingerprint", { length: 80 }),
  cancellationPolicyAcceptedAt: timestamp("cancellation_policy_accepted_at"),
  cancellationPolicyAcceptedBy: int("cancellation_policy_accepted_by"),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
});

export const disputes = mysqlTable("disputes", {
  id: int("dispute_id").autoincrement().primaryKey(),
  bookingId: int("booking_id").notNull(),
  openedBy: int("opened_by").notNull(),
  type: varchar("type", { length: 120 }).notNull(),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["Open", "UnderReview", "Resolved", "Rejected"]).default("Open").notNull(),
  resolutionNote: text("resolution_note"),
  reviewedBy: int("reviewed_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const disputeAttachments = mysqlTable("dispute_attachments", {
  id: int("attachment_id").autoincrement().primaryKey(),
  disputeId: int("dispute_id").notNull(),
  fileKey: varchar("file_key", { length: 512 }).notNull(),
  originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileSize: int("file_size").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const supportTickets = mysqlTable("support_tickets", {
  id: int("ticket_id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  category: varchar("category", { length: 120 }).notNull(),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["Open", "InProgress", "Resolved"]).default("Open").notNull(),
  lastResponse: text("last_response"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

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
