ALTER TABLE `users` ADD `account_status` enum('active','suspended','banned') NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE `listings` ADD `is_featured` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `platform_settings` ADD `platform_name` varchar(180) NOT NULL DEFAULT 'B2-Rent';
--> statement-breakpoint
ALTER TABLE `platform_settings` ADD `contact_email` varchar(320);
--> statement-breakpoint
ALTER TABLE `platform_settings` ADD `contact_phone` varchar(40);
--> statement-breakpoint
ALTER TABLE `platform_settings` ADD `maintenance_mode` boolean NOT NULL DEFAULT false;
