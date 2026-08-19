CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`legal_name` text,
	`normalized_name` text NOT NULL,
	`slug` text NOT NULL,
	`cin` text,
	`isin` text,
	`sector` text,
	`industry` text,
	`website_url` text,
	`headquarters` text,
	`summary` text,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_companies_slug` ON `companies` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_companies_cin` ON `companies` (`cin`) WHERE "companies"."cin" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_companies_isin` ON `companies` (`isin`) WHERE "companies"."isin" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_companies_normalized_name` ON `companies` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `idx_companies_sector` ON `companies` (`sector`);--> statement-breakpoint
CREATE TABLE `company_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`source_id` text NOT NULL,
	`external_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`external_id` text,
	`is_verified` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_company_aliases_source_name` ON `company_aliases` (`source_id`,`normalized_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_company_aliases_source_external_id` ON `company_aliases` (`source_id`,`external_id`) WHERE "company_aliases"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_company_aliases_company` ON `company_aliases` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_company_aliases_normalized_name` ON `company_aliases` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `data_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`ipo_id` text,
	`field_name` text NOT NULL,
	`preferred_field_source_id` text,
	`challenger_field_source_id` text,
	`preferred_source_id` text,
	`challenger_source_id` text,
	`preferred_value` text,
	`challenger_value` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`resolution_reason` text,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ipo_id`) REFERENCES `ipos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`preferred_field_source_id`) REFERENCES `ipo_field_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`challenger_field_source_id`) REFERENCES `ipo_field_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`preferred_source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`challenger_source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_data_conflicts_open` ON `data_conflicts` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_data_conflicts_entity_field` ON `data_conflicts` (`entity_type`,`entity_id`,`field_name`);--> statement-breakpoint
CREATE INDEX `idx_data_conflicts_ipo` ON `data_conflicts` (`ipo_id`,`status`);--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`source_kind` text NOT NULL,
	`authority_level` text NOT NULL,
	`attribution_label` text,
	`homepage_url` text,
	`base_url` text,
	`terms_url` text,
	`is_official` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`metadata_json` text,
	`last_fetched_at` integer,
	`last_successful_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "ck_data_sources_official_authority" CHECK("data_sources"."is_official" = 0 OR "data_sources"."authority_level" = 'OFFICIAL')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_data_sources_key` ON `data_sources` (`key`);--> statement-breakpoint
CREATE INDEX `idx_data_sources_kind_active` ON `data_sources` (`source_kind`,`is_active`);--> statement-breakpoint
CREATE TABLE `ingestion_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`ingestion_run_id` text,
	`source_id` text,
	`raw_record_id` text,
	`operation` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`raw_identifier` text,
	`error_code` text,
	`error_message` text NOT NULL,
	`context_json` text,
	`is_retryable` integer DEFAULT false NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`raw_record_id`) REFERENCES `raw_provider_records`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_ingestion_errors_retry_count" CHECK("ingestion_errors"."retry_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_ingestion_errors_run` ON `ingestion_errors` (`ingestion_run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ingestion_errors_source_created` ON `ingestion_errors` (`source_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ingestion_errors_unresolved` ON `ingestion_errors` (`resolved_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `ingestion_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`provider_key` text NOT NULL,
	`job_type` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	`records_fetched` integer DEFAULT 0 NOT NULL,
	`records_created` integer DEFAULT 0 NOT NULL,
	`records_updated` integer DEFAULT 0 NOT NULL,
	`records_skipped` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`error_summary` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_ingestion_runs_counts_nonnegative" CHECK("ingestion_runs"."records_fetched" >= 0 AND "ingestion_runs"."records_created" >= 0 AND "ingestion_runs"."records_updated" >= 0 AND "ingestion_runs"."records_skipped" >= 0 AND "ingestion_runs"."error_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_ingestion_runs_provider_started` ON `ingestion_runs` (`provider_key`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_ingestion_runs_status_started` ON `ingestion_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_ingestion_runs_source_started` ON `ingestion_runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `ipo_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`ipo_id` text NOT NULL,
	`source_id` text NOT NULL,
	`ingestion_run_id` text,
	`raw_record_id` text,
	`document_type` text NOT NULL,
	`external_id` text,
	`title` text NOT NULL,
	`filing_date` text,
	`document_url` text NOT NULL,
	`source_url` text NOT NULL,
	`content_hash` text,
	`version_label` text,
	`is_current` integer DEFAULT true NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ipo_id`) REFERENCES `ipos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`raw_record_id`) REFERENCES `raw_provider_records`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ipo_documents_filing_identity` ON `ipo_documents` (`source_id`,`ipo_id`,`document_type`,`document_url`,`filing_date`);--> statement-breakpoint
CREATE INDEX `idx_ipo_documents_ipo_type_date` ON `ipo_documents` (`ipo_id`,`document_type`,`filing_date`);--> statement-breakpoint
CREATE INDEX `idx_ipo_documents_source_filing_date` ON `ipo_documents` (`source_id`,`filing_date`);--> statement-breakpoint
CREATE INDEX `idx_ipo_documents_current` ON `ipo_documents` (`ipo_id`,`is_current`);--> statement-breakpoint
CREATE TABLE `ipo_external_identifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`ipo_id` text NOT NULL,
	`source_id` text NOT NULL,
	`identifier_type` text NOT NULL,
	`external_id` text NOT NULL,
	`exchange` text,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ipo_id`) REFERENCES `ipos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ipo_external_identifiers_source_value` ON `ipo_external_identifiers` (`source_id`,`identifier_type`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_ipo_external_identifiers_ipo` ON `ipo_external_identifiers` (`ipo_id`);--> statement-breakpoint
CREATE TABLE `ipo_field_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`ipo_id` text NOT NULL,
	`field_name` text NOT NULL,
	`value_type` text NOT NULL,
	`source_id` text NOT NULL,
	`ingestion_run_id` text,
	`raw_record_id` text,
	`source_url` text,
	`raw_value` text,
	`normalized_value` text,
	`priority` integer NOT NULL,
	`confidence` integer,
	`observed_at` integer,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`verified_at` integer,
	`is_selected` integer DEFAULT false NOT NULL,
	`superseded_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ipo_id`) REFERENCES `ipos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`raw_record_id`) REFERENCES `raw_provider_records`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_ipo_field_sources_confidence" CHECK("ipo_field_sources"."confidence" IS NULL OR ("ipo_field_sources"."confidence" >= 0 AND "ipo_field_sources"."confidence" <= 100))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ipo_field_sources_selected` ON `ipo_field_sources` (`ipo_id`,`field_name`) WHERE "ipo_field_sources"."is_selected" = 1 AND "ipo_field_sources"."superseded_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_ipo_field_sources_ipo_field_priority` ON `ipo_field_sources` (`ipo_id`,`field_name`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_ipo_field_sources_source_fetched` ON `ipo_field_sources` (`source_id`,`fetched_at`);--> statement-breakpoint
CREATE INDEX `idx_ipo_field_sources_raw_record` ON `ipo_field_sources` (`raw_record_id`);--> statement-breakpoint
CREATE TABLE `ipo_financials` (
	`id` text PRIMARY KEY NOT NULL,
	`ipo_id` text NOT NULL,
	`source_id` text NOT NULL,
	`document_id` text,
	`fiscal_period` text NOT NULL,
	`period_type` text NOT NULL,
	`period_start` text,
	`period_end` text,
	`currency` text DEFAULT 'INR' NOT NULL,
	`unit` text DEFAULT 'CRORE' NOT NULL,
	`revenue` text,
	`ebitda` text,
	`pat` text,
	`total_assets` text,
	`net_worth` text,
	`total_debt` text,
	`operating_cash_flow` text,
	`is_audited` integer,
	`verified_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ipo_id`) REFERENCES `ipos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`document_id`) REFERENCES `ipo_documents`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_ipo_financials_currency_inr" CHECK("ipo_financials"."currency" = 'INR')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ipo_financials_period` ON `ipo_financials` (`ipo_id`,`fiscal_period`,`period_type`);--> statement-breakpoint
CREATE INDEX `idx_ipo_financials_source` ON `ipo_financials` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_ipo_financials_document` ON `ipo_financials` (`document_id`);--> statement-breakpoint
CREATE TABLE `ipo_gmp_history` (
	`id` text PRIMARY KEY NOT NULL,
	`ipo_id` text NOT NULL,
	`source_id` text NOT NULL,
	`ingestion_run_id` text,
	`raw_record_id` text,
	`source_record_key` text,
	`gmp` text NOT NULL,
	`upper_price_band` text,
	`estimated_listing_price` text,
	`gmp_percent` text,
	`source_url` text,
	`observed_at` integer NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`is_valid` integer DEFAULT true NOT NULL,
	`invalid_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ipo_id`) REFERENCES `ipos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`raw_record_id`) REFERENCES `raw_provider_records`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_ipo_gmp_history_upper_band_nonnegative" CHECK("ipo_gmp_history"."upper_price_band" IS NULL OR CAST("ipo_gmp_history"."upper_price_band" AS NUMERIC) >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ipo_gmp_history_source_record` ON `ipo_gmp_history` (`source_id`,`source_record_key`) WHERE "ipo_gmp_history"."source_record_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ipo_gmp_history_observation` ON `ipo_gmp_history` (`ipo_id`,`source_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_ipo_gmp_history_latest` ON `ipo_gmp_history` (`ipo_id`,`is_valid`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_ipo_gmp_history_run` ON `ipo_gmp_history` (`ingestion_run_id`);--> statement-breakpoint
CREATE TABLE `ipo_listing_performance` (
	`id` text PRIMARY KEY NOT NULL,
	`ipo_id` text NOT NULL,
	`source_id` text NOT NULL,
	`ingestion_run_id` text,
	`listing_date` text,
	`issue_price` text,
	`listing_open` text,
	`listing_high` text,
	`listing_low` text,
	`listing_close` text,
	`current_price` text,
	`listing_gain_percent` text,
	`listing_close_gain_percent` text,
	`current_return_from_issue` text,
	`return_1d` text,
	`return_1w` text,
	`return_1m` text,
	`return_3m` text,
	`return_6m` text,
	`return_1y` text,
	`quote_mode` text DEFAULT 'UNKNOWN' NOT NULL,
	`delay_minutes` integer,
	`observed_at` integer NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ipo_id`) REFERENCES `ipos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_ipo_listing_performance_delay_nonnegative" CHECK("ipo_listing_performance"."delay_minutes" IS NULL OR "ipo_listing_performance"."delay_minutes" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ipo_listing_performance_observation` ON `ipo_listing_performance` (`ipo_id`,`source_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_ipo_listing_performance_latest` ON `ipo_listing_performance` (`ipo_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_ipo_listing_performance_source` ON `ipo_listing_performance` (`source_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `ipo_subscription_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`ipo_id` text NOT NULL,
	`source_id` text NOT NULL,
	`ingestion_run_id` text,
	`raw_record_id` text,
	`source_record_key` text,
	`day_number` integer,
	`qib` text,
	`nii` text,
	`bnii` text,
	`snii` text,
	`retail` text,
	`employee` text,
	`shareholder` text,
	`total` text,
	`source_url` text,
	`observed_at` integer NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`is_final` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ipo_id`) REFERENCES `ipos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`raw_record_id`) REFERENCES `raw_provider_records`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_ipo_subscription_nonnegative" CHECK(("ipo_subscription_snapshots"."qib" IS NULL OR CAST("ipo_subscription_snapshots"."qib" AS NUMERIC) >= 0) AND ("ipo_subscription_snapshots"."nii" IS NULL OR CAST("ipo_subscription_snapshots"."nii" AS NUMERIC) >= 0) AND ("ipo_subscription_snapshots"."bnii" IS NULL OR CAST("ipo_subscription_snapshots"."bnii" AS NUMERIC) >= 0) AND ("ipo_subscription_snapshots"."snii" IS NULL OR CAST("ipo_subscription_snapshots"."snii" AS NUMERIC) >= 0) AND ("ipo_subscription_snapshots"."retail" IS NULL OR CAST("ipo_subscription_snapshots"."retail" AS NUMERIC) >= 0) AND ("ipo_subscription_snapshots"."employee" IS NULL OR CAST("ipo_subscription_snapshots"."employee" AS NUMERIC) >= 0) AND ("ipo_subscription_snapshots"."shareholder" IS NULL OR CAST("ipo_subscription_snapshots"."shareholder" AS NUMERIC) >= 0) AND ("ipo_subscription_snapshots"."total" IS NULL OR CAST("ipo_subscription_snapshots"."total" AS NUMERIC) >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ipo_subscription_source_record` ON `ipo_subscription_snapshots` (`source_id`,`source_record_key`) WHERE "ipo_subscription_snapshots"."source_record_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ipo_subscription_observation` ON `ipo_subscription_snapshots` (`ipo_id`,`source_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_ipo_subscription_latest` ON `ipo_subscription_snapshots` (`ipo_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_ipo_subscription_day` ON `ipo_subscription_snapshots` (`ipo_id`,`day_number`,`observed_at`);--> statement-breakpoint
CREATE TABLE `ipos` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`slug` text NOT NULL,
	`board` text,
	`issue_type` text,
	`status` text DEFAULT 'DRHP_FILED' NOT NULL,
	`status_reason` text,
	`currency` text DEFAULT 'INR' NOT NULL,
	`isin` text,
	`face_value` text,
	`price_band_min` text,
	`price_band_max` text,
	`issue_price` text,
	`lot_size` integer,
	`issue_size_cr` text,
	`fresh_issue_cr` text,
	`offer_for_sale_cr` text,
	`total_shares_offered` text,
	`employee_reservation_cr` text,
	`shareholder_reservation_cr` text,
	`anchor_date` text,
	`open_date` text,
	`close_date` text,
	`allotment_date` text,
	`refund_date` text,
	`demat_date` text,
	`listing_date` text,
	`withdrawn_at` integer,
	`deferred_at` integer,
	`registrar_name` text,
	`registrar_url` text,
	`lead_managers_json` text,
	`exchanges_json` text,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_ipos_currency_inr" CHECK("ipos"."currency" = 'INR'),
	CONSTRAINT "ck_ipos_price_band_order" CHECK("ipos"."price_band_min" IS NULL OR "ipos"."price_band_max" IS NULL OR CAST("ipos"."price_band_max" AS NUMERIC) >= CAST("ipos"."price_band_min" AS NUMERIC)),
	CONSTRAINT "ck_ipos_lot_size_positive" CHECK("ipos"."lot_size" IS NULL OR "ipos"."lot_size" > 0),
	CONSTRAINT "ck_ipos_open_close_order" CHECK("ipos"."open_date" IS NULL OR "ipos"."close_date" IS NULL OR "ipos"."close_date" >= "ipos"."open_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ipos_slug` ON `ipos` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ipos_isin` ON `ipos` (`isin`) WHERE "ipos"."isin" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_ipos_company` ON `ipos` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_ipos_status_open_date` ON `ipos` (`status`,`open_date`);--> statement-breakpoint
CREATE INDEX `idx_ipos_status_close_date` ON `ipos` (`status`,`close_date`);--> statement-breakpoint
CREATE INDEX `idx_ipos_status_listing_date` ON `ipos` (`status`,`listing_date`);--> statement-breakpoint
CREATE INDEX `idx_ipos_board_status` ON `ipos` (`board`,`status`);--> statement-breakpoint
CREATE TABLE `manual_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`ipo_id` text,
	`field_name` text NOT NULL,
	`value_type` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`reason` text NOT NULL,
	`created_by` text NOT NULL,
	`source_id` text,
	`field_source_id` text,
	`conflict_id` text,
	`verified_by` text,
	`verified_at` integer,
	`applied_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`revoked_at` integer,
	`revoked_by` text,
	`revocation_reason` text,
	FOREIGN KEY (`ipo_id`) REFERENCES `ipos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`field_source_id`) REFERENCES `ipo_field_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`conflict_id`) REFERENCES `data_conflicts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_manual_overrides_active_field` ON `manual_overrides` (`entity_type`,`entity_id`,`field_name`) WHERE "manual_overrides"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX `idx_manual_overrides_ipo` ON `manual_overrides` (`ipo_id`,`applied_at`);--> statement-breakpoint
CREATE INDEX `idx_manual_overrides_actor` ON `manual_overrides` (`created_by`,`applied_at`);--> statement-breakpoint
CREATE INDEX `idx_manual_overrides_unverified` ON `manual_overrides` (`verified_at`,`applied_at`);--> statement-breakpoint
CREATE TABLE `market_index_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`market_index_id` text NOT NULL,
	`source_id` text NOT NULL,
	`ingestion_run_id` text,
	`value` text NOT NULL,
	`change` text,
	`change_percent` text,
	`open` text,
	`high` text,
	`low` text,
	`previous_close` text,
	`quote_mode` text DEFAULT 'UNKNOWN' NOT NULL,
	`delay_minutes` integer,
	`market_status` text,
	`observed_at` integer NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`market_index_id`) REFERENCES `market_indices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_market_index_quotes_delay_nonnegative" CHECK("market_index_quotes"."delay_minutes" IS NULL OR "market_index_quotes"."delay_minutes" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_market_index_quotes_observation` ON `market_index_quotes` (`market_index_id`,`source_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_market_index_quotes_latest` ON `market_index_quotes` (`market_index_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `idx_market_index_quotes_source` ON `market_index_quotes` (`source_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `market_indices` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`exchange` text NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "ck_market_indices_currency_inr" CHECK("market_indices"."currency" = 'INR')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_market_indices_exchange_symbol` ON `market_indices` (`exchange`,`symbol`);--> statement-breakpoint
CREATE INDEX `idx_market_indices_active` ON `market_indices` (`is_active`,`name`);--> statement-breakpoint
CREATE TABLE `news_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`ingestion_run_id` text,
	`raw_record_id` text,
	`external_id` text,
	`headline` text NOT NULL,
	`summary` text,
	`publisher` text NOT NULL,
	`category` text NOT NULL,
	`canonical_url` text NOT NULL,
	`image_url` text,
	`language` text DEFAULT 'en' NOT NULL,
	`published_at` integer NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`raw_record_id`) REFERENCES `raw_provider_records`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_news_articles_source_url` ON `news_articles` (`source_id`,`canonical_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_news_articles_source_external_id` ON `news_articles` (`source_id`,`external_id`) WHERE "news_articles"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_news_articles_published` ON `news_articles` (`published_at`);--> statement-breakpoint
CREATE INDEX `idx_news_articles_category_published` ON `news_articles` (`category`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_news_articles_source_published` ON `news_articles` (`source_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `news_companies` (
	`news_id` text NOT NULL,
	`company_id` text NOT NULL,
	PRIMARY KEY(`news_id`, `company_id`),
	FOREIGN KEY (`news_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_news_companies_company` ON `news_companies` (`company_id`,`news_id`);--> statement-breakpoint
CREATE TABLE `news_ipos` (
	`news_id` text NOT NULL,
	`ipo_id` text NOT NULL,
	PRIMARY KEY(`news_id`, `ipo_id`),
	FOREIGN KEY (`news_id`) REFERENCES `news_articles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ipo_id`) REFERENCES `ipos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_news_ipos_ipo` ON `news_ipos` (`ipo_id`,`news_id`);--> statement-breakpoint
CREATE TABLE `provider_status` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`health` text DEFAULT 'UNKNOWN' NOT NULL,
	`last_attempt_at` integer,
	`last_successful_at` integer,
	`last_failure_at` integer,
	`last_error_code` text,
	`last_error_message` text,
	`records_synced` integer DEFAULT 0 NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_provider_status_counts_nonnegative" CHECK("provider_status"."records_synced" >= 0 AND "provider_status"."consecutive_failures" >= 0 AND ("provider_status"."latency_ms" IS NULL OR "provider_status"."latency_ms" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_provider_status_source` ON `provider_status` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_provider_status_health` ON `provider_status` (`health`,`updated_at`);--> statement-breakpoint
CREATE TABLE `raw_provider_records` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`ingestion_run_id` text,
	`entity_type` text NOT NULL,
	`external_id` text,
	`endpoint` text,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`content_type` text,
	`schema_version` text,
	`validation_status` text DEFAULT 'PENDING' NOT NULL,
	`validation_errors_json` text,
	`received_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`retained_until` integer,
	FOREIGN KEY (`source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_raw_provider_records_source_external_hash` ON `raw_provider_records` (`source_id`,`entity_type`,`external_id`,`payload_hash`) WHERE "raw_provider_records"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_raw_provider_records_run` ON `raw_provider_records` (`ingestion_run_id`);--> statement-breakpoint
CREATE INDEX `idx_raw_provider_records_source_received` ON `raw_provider_records` (`source_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `idx_raw_provider_records_hash` ON `raw_provider_records` (`payload_hash`);--> statement-breakpoint
CREATE INDEX `idx_raw_provider_records_validation` ON `raw_provider_records` (`validation_status`,`received_at`);--> statement-breakpoint
PRAGMA optimize;
