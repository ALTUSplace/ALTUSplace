ALTER TABLE `users` ADD `kyc_verification_status` varchar(20) NOT NULL DEFAULT 'unverified';
--> statement-breakpoint
ALTER TABLE `users` ADD `kyc_verified_at` timestamp;
--> statement-breakpoint
UPDATE `users` SET `kyc_verification_status` = 'verified' WHERE `commercial_register` IS NOT NULL AND `commercial_register` != '';
--> statement-breakpoint
ALTER TABLE `kyc_submissions` MODIFY `document_type` varchar(20) NOT NULL;
