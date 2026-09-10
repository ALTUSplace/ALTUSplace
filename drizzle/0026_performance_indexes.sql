-- Performance Indexes for High-Traffic Search Filters
-- Adds indexes on columns frequently used in WHERE clauses, JOIN conditions,
-- and range queries to ensure sub-100ms response times at scale.

-- Listings: search filters (city, category, price_per_day, status, owner_id)
CREATE INDEX `listings_city_idx` ON `listings` (`city`);
CREATE INDEX `listings_category_idx` ON `listings` (`category`);
CREATE INDEX `listings_price_per_day_idx` ON `listings` (`price_per_day`);
CREATE INDEX `listings_status_idx` ON `listings` (`status`);
CREATE INDEX `listings_owner_id_idx` ON `listings` (`owner_id`);

-- Listings: composite index for search queries filtering by city + category + status
CREATE INDEX `listings_search_composite_idx` ON `listings` (`city`, `category`, `status`);

-- Bookings: composite index for availability overlap queries (listing_id + status + dates)
CREATE INDEX `bookings_listing_status_dates_idx` ON `bookings` (`listing_id`, `status`, `start_date`, `end_date`);

-- Bookings: renter lookups
CREATE INDEX `bookings_renter_id_idx` ON `bookings` (`renter_id`);

-- Bookings: status-based filtering for admin dashboards
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);

-- Payments: booking_id foreign key lookups
CREATE INDEX `payments_booking_id_idx` ON `payments` (`booking_id`);

-- Payments: payer lookups for payment history
CREATE INDEX `payments_payer_id_idx` ON `payments` (`payer_id`);

-- Invoices: booking_id foreign key lookups
CREATE INDEX `invoices_booking_id_idx` ON `invoices` (`booking_id`);

-- KYC Submissions: user_id lookups for verification status
CREATE INDEX `kyc_submissions_user_id_idx` ON `kyc_submissions` (`user_id`);

-- Support Tickets: user_id and status for dashboard filtering
CREATE INDEX `support_tickets_user_id_idx` ON `support_tickets` (`user_id`);
CREATE INDEX `support_tickets_status_idx` ON `support_tickets` (`status`);

-- Disputes: booking_id and opened_by for dispute resolution workflows
CREATE INDEX `disputes_booking_id_idx` ON `disputes` (`booking_id`);
CREATE INDEX `disputes_opened_by_idx` ON `disputes` (`opened_by`);

-- Payout Requests: owner_id and status for payout dashboards
CREATE INDEX `payout_requests_owner_id_idx` ON `payout_requests` (`owner_id`);
CREATE INDEX `payout_requests_status_idx` ON `payout_requests` (`status`);
