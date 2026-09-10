ALTER TABLE `users` MODIFY `role` enum('renter','owner','admin','user','SUPER_ADMIN') NOT NULL DEFAULT 'user';
--> statement-breakpoint
ALTER TABLE `users` ADD `vendor_tier` enum('bronze','silver','gold') NOT NULL DEFAULT 'bronze';
--> statement-breakpoint
ALTER TABLE `users` ADD `stripe_account_id` varchar(120);
--> statement-breakpoint
ALTER TABLE `platform_settings` ADD `commission_mode` enum('percent','flat') NOT NULL DEFAULT 'percent';
--> statement-breakpoint
ALTER TABLE `platform_settings` ADD `flat_commission_amount` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `commission_tiers` (
	`tier_id` int AUTO_INCREMENT NOT NULL,
	`tier` enum('bronze','silver','gold') NOT NULL,
	`mode` enum('percent','flat') NOT NULL DEFAULT 'percent',
	`percent_basis_points` int NOT NULL DEFAULT 1000,
	`flat_amount` int NOT NULL DEFAULT 0,
	`updated_by` int,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `commission_tiers_tier_unique` UNIQUE(`tier`),
	CONSTRAINT `commission_tiers_tier_id` PRIMARY KEY(`tier_id`)
);
--> statement-breakpoint
CREATE TABLE `escrow_ledger` (
	`escrow_id` int AUTO_INCREMENT NOT NULL,
	`booking_id` int NOT NULL,
	`payment_id` int NOT NULL,
	`guest_id` int NOT NULL,
	`vendor_id` int NOT NULL,
	`listing_category` varchar(64) NOT NULL,
	`total_paid` int NOT NULL,
	`platform_cut` int NOT NULL,
	`vendor_payout_share` int NOT NULL,
	`release_date` timestamp NOT NULL,
	`stripe_transfer_status` enum('pending','sent','held','failed','released') NOT NULL DEFAULT 'pending',
	`stripe_transfer_id` varchar(120),
	`status` enum('held','releasable','released','frozen','mediated') NOT NULL DEFAULT 'held',
	`mediation_note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `escrow_ledger_escrow_id` PRIMARY KEY(`escrow_id`)
);
--> statement-breakpoint
CREATE INDEX `escrow_ledger_booking_idx` ON `escrow_ledger` (`booking_id`);
--> statement-breakpoint
CREATE INDEX `escrow_ledger_vendor_status_idx` ON `escrow_ledger` (`vendor_id`,`status`);
--> statement-breakpoint
INSERT INTO `commission_tiers` (`tier`, `mode`, `percent_basis_points`, `flat_amount`) VALUES
('bronze', 'percent', 1000, 0),
('silver', 'percent', 800, 0),
('gold', 'percent', 600, 0)
ON DUPLICATE KEY UPDATE `mode` = VALUES(`mode`);