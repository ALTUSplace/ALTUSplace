-- Automated Identity Verification (KYC) flow.
-- Tracks the verification provider, provider session, document metadata and the
-- category each document serves (car -> driving licence, property -> ID/passport).
ALTER TABLE `kyc_submissions` MODIFY `document_type` varchar(24) NOT NULL;
--> statement-breakpoint
ALTER TABLE `kyc_submissions` ADD `provider` varchar(40) NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE `kyc_submissions` ADD `provider_session_id` varchar(128);
--> statement-breakpoint
ALTER TABLE `kyc_submissions` ADD `file_size` int;
--> statement-breakpoint
ALTER TABLE `kyc_submissions` ADD `document_number_masked` varchar(32);
--> statement-breakpoint
ALTER TABLE `kyc_submissions` ADD `expiry_date` timestamp;
--> statement-breakpoint
ALTER TABLE `kyc_submissions` ADD `category_context` varchar(32);
--> statement-breakpoint
CREATE INDEX `kyc_submissions_provider_session_idx` ON `kyc_submissions` (`provider_session_id`);