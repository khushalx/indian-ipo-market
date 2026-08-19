ALTER TABLE `ipo_documents` ADD `availability_status` text DEFAULT 'UNCHECKED' NOT NULL;--> statement-breakpoint
ALTER TABLE `ipo_documents` ADD `availability_checked_at` integer;--> statement-breakpoint
ALTER TABLE `ipo_documents` ADD `availability_http_status` integer;--> statement-breakpoint
CREATE INDEX `idx_ipo_documents_availability_due` ON `ipo_documents` (`source_id`,`is_current`,`availability_status`,`availability_checked_at`);