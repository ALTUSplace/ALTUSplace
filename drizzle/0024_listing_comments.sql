CREATE TABLE `listing_comments` (
	`comment_id` serial PRIMARY KEY NOT NULL,
	`listing_id` integer NOT NULL,
	`author_id` integer NOT NULL,
	`parent_id` integer,
	`body` text NOT NULL,
	`status` enum('visible','hidden') NOT NULL DEFAULT 'visible',
	`edited_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX `listing_comments_listing_created_idx` ON `listing_comments` (`listing_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `listing_comments_author_idx` ON `listing_comments` (`author_id`);