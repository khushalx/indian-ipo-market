import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Canonical D1 schema for the live-data pipeline.
 *
 * Timestamps are UTC epoch milliseconds and map to Date in Drizzle. Exact
 * decimal values use SQLite NUMERIC affinity and map to strings so paise,
 * crore values, ratios, and subscription multiples do not cross a binary
 * floating-point boundary. Calendar dates are ISO YYYY-MM-DD strings.
 *
 * `db/postgres-schema.ts` remains the independent PostgreSQL-ready model; this
 * file intentionally uses D1/SQLite primitives only.
 */

export const sourceKinds = [
  "REGULATOR",
  "EXCHANGE",
  "REGISTRAR",
  "OFFER_DOCUMENT",
  "ISSUER",
  "STRUCTURED_API",
  "GMP_PROVIDER",
  "NEWS_PUBLISHER",
  "MARKET_DATA",
  "MANUAL",
  "DERIVED",
] as const;

export const authorityLevels = [
  "OFFICIAL",
  "AUTHORIZED",
  "THIRD_PARTY",
  "MANUAL",
  "DERIVED",
] as const;

export const ipoBoards = ["MAINBOARD", "SME"] as const;

export const ipoLifecycleStatuses = [
  "DRHP_FILED",
  "RHP_FILED",
  "UPCOMING",
  "OPEN",
  "CLOSED",
  "ALLOTMENT_PENDING",
  "ALLOTMENT_COMPLETE",
  "LISTING_UPCOMING",
  "LISTED",
  "WITHDRAWN",
  "DEFERRED",
] as const;

export const ipoIssueTypes = ["BOOK_BUILT", "FIXED_PRICE", "UNKNOWN"] as const;

export const documentTypes = [
  "DRHP",
  "UPDATED_DRHP",
  "CORRIGENDUM",
  "ADDENDUM",
  "RHP",
  "ABRIDGED_PROSPECTUS",
  "FINAL_OFFER_DOCUMENT",
  "ANCHOR_ALLOCATION",
  "BASIS_OF_ALLOTMENT",
  "ANNUAL_REPORT",
  "OTHER",
] as const;

export const documentAvailabilityStatuses = [
  "UNCHECKED",
  "AVAILABLE",
  "NOT_FOUND",
  "UNKNOWN",
] as const;

export const fieldValueTypes = [
  "TEXT",
  "DECIMAL",
  "INTEGER",
  "DATE",
  "TIMESTAMP",
  "BOOLEAN",
  "JSON",
] as const;

export const financialPeriodTypes = [
  "FY",
  "9M",
  "6M",
  "Q",
  "TRAILING",
] as const;

export const newsCategories = [
  "IPO",
  "MARKETS",
  "COMPANY",
  "SEBI",
  "RBI",
  "ECONOMY",
  "RESULTS",
  "CORPORATE_ACTIONS",
] as const;

export const quoteModes = ["REALTIME", "DELAYED", "EOD", "UNKNOWN"] as const;
export const providerHealthStates = ["HEALTHY", "DEGRADED", "OFFLINE", "UNKNOWN"] as const;
export const ingestionRunStatuses = ["RUNNING", "SUCCEEDED", "PARTIAL", "FAILED", "SKIPPED"] as const;
export const ingestionTriggers = ["SCHEDULED", "MANUAL", "API", "RETRY"] as const;
export const validationStatuses = ["PENDING", "VALID", "INVALID", "PARTIAL"] as const;
export const conflictStatuses = ["OPEN", "RESOLVED", "IGNORED"] as const;

const entityId = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const utcTimestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const utcNow = (name: string) =>
  utcTimestamp(name)
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
// TEXT affinity preserves the exact provider/document decimal representation.
const exactDecimal = (name: string) => text(name);
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

const auditColumns = () => ({
  createdAt: utcNow("created_at"),
  updatedAt: utcNow("updated_at"),
});

export const dataSources = sqliteTable(
  "data_sources",
  {
    id: entityId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    sourceKind: text("source_kind", { enum: sourceKinds }).notNull(),
    authorityLevel: text("authority_level", { enum: authorityLevels }).notNull(),
    attributionLabel: text("attribution_label"),
    homepageUrl: text("homepage_url"),
    baseUrl: text("base_url"),
    termsUrl: text("terms_url"),
    isOfficial: integer("is_official", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    metadata: json<Record<string, unknown>>("metadata_json"),
    lastFetchedAt: utcTimestamp("last_fetched_at"),
    lastSuccessfulAt: utcTimestamp("last_successful_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("uq_data_sources_key").on(table.key),
    index("idx_data_sources_kind_active").on(table.sourceKind, table.isActive),
    check(
      "ck_data_sources_official_authority",
      sql`${table.isOfficial} = 0 OR ${table.authorityLevel} = 'OFFICIAL'`,
    ),
  ],
);

export const companies = sqliteTable(
  "companies",
  {
    id: entityId(),
    displayName: text("display_name").notNull(),
    legalName: text("legal_name"),
    normalizedName: text("normalized_name").notNull(),
    slug: text("slug").notNull(),
    cin: text("cin"),
    isin: text("isin"),
    sector: text("sector"),
    industry: text("industry"),
    websiteUrl: text("website_url"),
    headquarters: text("headquarters"),
    summary: text("summary"),
    firstSeenAt: utcNow("first_seen_at"),
    lastSeenAt: utcNow("last_seen_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("uq_companies_slug").on(table.slug),
    uniqueIndex("uq_companies_cin")
      .on(table.cin)
      .where(sql`${table.cin} IS NOT NULL`),
    uniqueIndex("uq_companies_isin")
      .on(table.isin)
      .where(sql`${table.isin} IS NOT NULL`),
    index("idx_companies_normalized_name").on(table.normalizedName),
    index("idx_companies_sector").on(table.sector),
  ],
);

export const companyAliases = sqliteTable(
  "company_aliases",
  {
    id: entityId(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    externalName: text("external_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    externalId: text("external_id"),
    isVerified: integer("is_verified", { mode: "boolean" }).notNull().default(false),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("uq_company_aliases_source_name").on(table.sourceId, table.normalizedName),
    uniqueIndex("uq_company_aliases_source_external_id")
      .on(table.sourceId, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    index("idx_company_aliases_company").on(table.companyId),
    index("idx_company_aliases_normalized_name").on(table.normalizedName),
  ],
);

export const ipos = sqliteTable(
  "ipos",
  {
    id: entityId(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    board: text("board", { enum: ipoBoards }),
    issueType: text("issue_type", { enum: ipoIssueTypes }),
    status: text("status", { enum: ipoLifecycleStatuses })
      .notNull()
      .default("DRHP_FILED"),
    statusReason: text("status_reason"),
    currency: text("currency").notNull().default("INR"),
    isin: text("isin"),
    faceValue: exactDecimal("face_value"),
    priceBandMin: exactDecimal("price_band_min"),
    priceBandMax: exactDecimal("price_band_max"),
    issuePrice: exactDecimal("issue_price"),
    lotSize: integer("lot_size"),
    issueSizeCr: exactDecimal("issue_size_cr"),
    freshIssueCr: exactDecimal("fresh_issue_cr"),
    offerForSaleCr: exactDecimal("offer_for_sale_cr"),
    totalSharesOffered: exactDecimal("total_shares_offered"),
    employeeReservationCr: exactDecimal("employee_reservation_cr"),
    shareholderReservationCr: exactDecimal("shareholder_reservation_cr"),
    anchorDate: text("anchor_date"),
    openDate: text("open_date"),
    closeDate: text("close_date"),
    allotmentDate: text("allotment_date"),
    refundDate: text("refund_date"),
    dematDate: text("demat_date"),
    listingDate: text("listing_date"),
    withdrawnAt: utcTimestamp("withdrawn_at"),
    deferredAt: utcTimestamp("deferred_at"),
    registrarName: text("registrar_name"),
    registrarUrl: text("registrar_url"),
    leadManagers: json<string[]>("lead_managers_json"),
    exchanges: json<string[]>("exchanges_json"),
    firstSeenAt: utcNow("first_seen_at"),
    lastSeenAt: utcNow("last_seen_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("uq_ipos_slug").on(table.slug),
    uniqueIndex("uq_ipos_isin")
      .on(table.isin)
      .where(sql`${table.isin} IS NOT NULL`),
    index("idx_ipos_company").on(table.companyId),
    index("idx_ipos_status_open_date").on(table.status, table.openDate),
    index("idx_ipos_status_close_date").on(table.status, table.closeDate),
    index("idx_ipos_status_listing_date").on(table.status, table.listingDate),
    index("idx_ipos_board_status").on(table.board, table.status),
    check("ck_ipos_currency_inr", sql`${table.currency} = 'INR'`),
    check(
      "ck_ipos_price_band_order",
      sql`${table.priceBandMin} IS NULL OR ${table.priceBandMax} IS NULL OR CAST(${table.priceBandMax} AS NUMERIC) >= CAST(${table.priceBandMin} AS NUMERIC)`,
    ),
    check(
      "ck_ipos_lot_size_positive",
      sql`${table.lotSize} IS NULL OR ${table.lotSize} > 0`,
    ),
    check(
      "ck_ipos_open_close_order",
      sql`${table.openDate} IS NULL OR ${table.closeDate} IS NULL OR ${table.closeDate} >= ${table.openDate}`,
    ),
  ],
);

export const ipoExternalIdentifiers = sqliteTable(
  "ipo_external_identifiers",
  {
    id: entityId(),
    ipoId: text("ipo_id")
      .notNull()
      .references(() => ipos.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    identifierType: text("identifier_type").notNull(),
    externalId: text("external_id").notNull(),
    exchange: text("exchange"),
    firstSeenAt: utcNow("first_seen_at"),
    lastSeenAt: utcNow("last_seen_at"),
  },
  (table) => [
    uniqueIndex("uq_ipo_external_identifiers_source_value").on(
      table.sourceId,
      table.identifierType,
      table.externalId,
    ),
    index("idx_ipo_external_identifiers_ipo").on(table.ipoId),
  ],
);

export const ingestionRuns = sqliteTable(
  "ingestion_runs",
  {
    id: entityId(),
    sourceId: text("source_id").references(() => dataSources.id, {
      onDelete: "set null",
    }),
    providerKey: text("provider_key").notNull(),
    jobType: text("job_type").notNull(),
    trigger: text("trigger", { enum: ingestionTriggers }).notNull(),
    status: text("status", { enum: ingestionRunStatuses })
      .notNull()
      .default("RUNNING"),
    startedAt: utcNow("started_at"),
    finishedAt: utcTimestamp("finished_at"),
    recordsFetched: integer("records_fetched").notNull().default(0),
    recordsCreated: integer("records_created").notNull().default(0),
    recordsUpdated: integer("records_updated").notNull().default(0),
    recordsSkipped: integer("records_skipped").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    errorSummary: text("error_summary"),
    metadata: json<Record<string, unknown>>("metadata_json"),
    createdAt: utcNow("created_at"),
  },
  (table) => [
    index("idx_ingestion_runs_provider_started").on(table.providerKey, table.startedAt),
    index("idx_ingestion_runs_status_started").on(table.status, table.startedAt),
    index("idx_ingestion_runs_source_started").on(table.sourceId, table.startedAt),
    check(
      "ck_ingestion_runs_counts_nonnegative",
      sql`${table.recordsFetched} >= 0 AND ${table.recordsCreated} >= 0 AND ${table.recordsUpdated} >= 0 AND ${table.recordsSkipped} >= 0 AND ${table.errorCount} >= 0`,
    ),
  ],
);

export const rawProviderRecords = sqliteTable(
  "raw_provider_records",
  {
    id: entityId(),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id, {
      onDelete: "set null",
    }),
    entityType: text("entity_type").notNull(),
    externalId: text("external_id"),
    endpoint: text("endpoint"),
    payload: json<unknown>("payload_json").notNull(),
    payloadHash: text("payload_hash").notNull(),
    contentType: text("content_type"),
    schemaVersion: text("schema_version"),
    validationStatus: text("validation_status", { enum: validationStatuses })
      .notNull()
      .default("PENDING"),
    validationErrors: json<unknown[]>("validation_errors_json"),
    receivedAt: utcNow("received_at"),
    retainedUntil: utcTimestamp("retained_until"),
  },
  (table) => [
    uniqueIndex("uq_raw_provider_records_source_external_hash")
      .on(table.sourceId, table.entityType, table.externalId, table.payloadHash)
      .where(sql`${table.externalId} IS NOT NULL`),
    index("idx_raw_provider_records_run").on(table.ingestionRunId),
    index("idx_raw_provider_records_source_received").on(table.sourceId, table.receivedAt),
    index("idx_raw_provider_records_hash").on(table.payloadHash),
    index("idx_raw_provider_records_validation").on(table.validationStatus, table.receivedAt),
  ],
);

export const ipoDocuments = sqliteTable(
  "ipo_documents",
  {
    id: entityId(),
    ipoId: text("ipo_id")
      .notNull()
      .references(() => ipos.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id, {
      onDelete: "set null",
    }),
    rawRecordId: text("raw_record_id").references(() => rawProviderRecords.id, {
      onDelete: "set null",
    }),
    documentType: text("document_type", { enum: documentTypes }).notNull(),
    externalId: text("external_id"),
    title: text("title").notNull(),
    filingDate: text("filing_date"),
    documentUrl: text("document_url").notNull(),
    sourceUrl: text("source_url").notNull(),
    contentHash: text("content_hash"),
    versionLabel: text("version_label"),
    availabilityStatus: text("availability_status", {
      enum: documentAvailabilityStatuses,
    }).notNull().default("UNCHECKED"),
    availabilityCheckedAt: utcTimestamp("availability_checked_at"),
    availabilityHttpStatus: integer("availability_http_status"),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(true),
    fetchedAt: utcNow("fetched_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("uq_ipo_documents_filing_identity").on(
      table.sourceId,
      table.ipoId,
      table.documentType,
      table.documentUrl,
      table.filingDate,
    ),
    index("idx_ipo_documents_ipo_type_date").on(table.ipoId, table.documentType, table.filingDate),
    index("idx_ipo_documents_source_filing_date").on(table.sourceId, table.filingDate),
    index("idx_ipo_documents_current").on(table.ipoId, table.isCurrent),
    index("idx_ipo_documents_availability_due").on(
      table.sourceId,
      table.isCurrent,
      table.availabilityStatus,
      table.availabilityCheckedAt,
    ),
  ],
);

export const ipoFieldSources = sqliteTable(
  "ipo_field_sources",
  {
    id: entityId(),
    ipoId: text("ipo_id")
      .notNull()
      .references(() => ipos.id, { onDelete: "cascade" }),
    fieldName: text("field_name").notNull(),
    valueType: text("value_type", { enum: fieldValueTypes }).notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id, {
      onDelete: "set null",
    }),
    rawRecordId: text("raw_record_id").references(() => rawProviderRecords.id, {
      onDelete: "set null",
    }),
    sourceUrl: text("source_url"),
    rawValue: text("raw_value"),
    normalizedValue: text("normalized_value"),
    priority: integer("priority").notNull(),
    confidence: integer("confidence"),
    observedAt: utcTimestamp("observed_at"),
    fetchedAt: utcNow("fetched_at"),
    verifiedAt: utcTimestamp("verified_at"),
    isSelected: integer("is_selected", { mode: "boolean" }).notNull().default(false),
    supersededAt: utcTimestamp("superseded_at"),
    createdAt: utcNow("created_at"),
  },
  (table) => [
    uniqueIndex("uq_ipo_field_sources_selected")
      .on(table.ipoId, table.fieldName)
      .where(sql`${table.isSelected} = 1 AND ${table.supersededAt} IS NULL`),
    index("idx_ipo_field_sources_ipo_field_priority").on(
      table.ipoId,
      table.fieldName,
      table.priority,
    ),
    index("idx_ipo_field_sources_source_fetched").on(table.sourceId, table.fetchedAt),
    index("idx_ipo_field_sources_raw_record").on(table.rawRecordId),
    check(
      "ck_ipo_field_sources_confidence",
      sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 100)`,
    ),
  ],
);

export const ipoGmpHistory = sqliteTable(
  "ipo_gmp_history",
  {
    id: entityId(),
    ipoId: text("ipo_id")
      .notNull()
      .references(() => ipos.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id, {
      onDelete: "set null",
    }),
    rawRecordId: text("raw_record_id").references(() => rawProviderRecords.id, {
      onDelete: "set null",
    }),
    sourceRecordKey: text("source_record_key"),
    gmp: exactDecimal("gmp").notNull(),
    upperPriceBand: exactDecimal("upper_price_band"),
    estimatedListingPrice: exactDecimal("estimated_listing_price"),
    gmpPercent: exactDecimal("gmp_percent"),
    sourceUrl: text("source_url"),
    observedAt: utcTimestamp("observed_at").notNull(),
    fetchedAt: utcNow("fetched_at"),
    isValid: integer("is_valid", { mode: "boolean" }).notNull().default(true),
    invalidReason: text("invalid_reason"),
    createdAt: utcNow("created_at"),
  },
  (table) => [
    uniqueIndex("uq_ipo_gmp_history_source_record")
      .on(table.sourceId, table.sourceRecordKey)
      .where(sql`${table.sourceRecordKey} IS NOT NULL`),
    uniqueIndex("uq_ipo_gmp_history_observation").on(
      table.ipoId,
      table.sourceId,
      table.observedAt,
    ),
    index("idx_ipo_gmp_history_latest").on(table.ipoId, table.isValid, table.observedAt),
    index("idx_ipo_gmp_history_run").on(table.ingestionRunId),
    check(
      "ck_ipo_gmp_history_upper_band_nonnegative",
      sql`${table.upperPriceBand} IS NULL OR CAST(${table.upperPriceBand} AS NUMERIC) >= 0`,
    ),
  ],
);

export const ipoSubscriptionSnapshots = sqliteTable(
  "ipo_subscription_snapshots",
  {
    id: entityId(),
    ipoId: text("ipo_id")
      .notNull()
      .references(() => ipos.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id, {
      onDelete: "set null",
    }),
    rawRecordId: text("raw_record_id").references(() => rawProviderRecords.id, {
      onDelete: "set null",
    }),
    sourceRecordKey: text("source_record_key"),
    dayNumber: integer("day_number"),
    qib: exactDecimal("qib"),
    nii: exactDecimal("nii"),
    bnii: exactDecimal("bnii"),
    snii: exactDecimal("snii"),
    retail: exactDecimal("retail"),
    employee: exactDecimal("employee"),
    shareholder: exactDecimal("shareholder"),
    total: exactDecimal("total"),
    sourceUrl: text("source_url"),
    observedAt: utcTimestamp("observed_at").notNull(),
    fetchedAt: utcNow("fetched_at"),
    isFinal: integer("is_final", { mode: "boolean" }).notNull().default(false),
    createdAt: utcNow("created_at"),
  },
  (table) => [
    uniqueIndex("uq_ipo_subscription_source_record")
      .on(table.sourceId, table.sourceRecordKey)
      .where(sql`${table.sourceRecordKey} IS NOT NULL`),
    uniqueIndex("uq_ipo_subscription_observation").on(
      table.ipoId,
      table.sourceId,
      table.observedAt,
    ),
    index("idx_ipo_subscription_latest").on(table.ipoId, table.observedAt),
    index("idx_ipo_subscription_day").on(table.ipoId, table.dayNumber, table.observedAt),
    check(
      "ck_ipo_subscription_nonnegative",
      sql`(${table.qib} IS NULL OR CAST(${table.qib} AS NUMERIC) >= 0) AND (${table.nii} IS NULL OR CAST(${table.nii} AS NUMERIC) >= 0) AND (${table.bnii} IS NULL OR CAST(${table.bnii} AS NUMERIC) >= 0) AND (${table.snii} IS NULL OR CAST(${table.snii} AS NUMERIC) >= 0) AND (${table.retail} IS NULL OR CAST(${table.retail} AS NUMERIC) >= 0) AND (${table.employee} IS NULL OR CAST(${table.employee} AS NUMERIC) >= 0) AND (${table.shareholder} IS NULL OR CAST(${table.shareholder} AS NUMERIC) >= 0) AND (${table.total} IS NULL OR CAST(${table.total} AS NUMERIC) >= 0)`,
    ),
  ],
);

export const ipoFinancials = sqliteTable(
  "ipo_financials",
  {
    id: entityId(),
    ipoId: text("ipo_id")
      .notNull()
      .references(() => ipos.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    documentId: text("document_id").references(() => ipoDocuments.id, {
      onDelete: "set null",
    }),
    fiscalPeriod: text("fiscal_period").notNull(),
    periodType: text("period_type", { enum: financialPeriodTypes }).notNull(),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    currency: text("currency").notNull().default("INR"),
    unit: text("unit").notNull().default("CRORE"),
    revenue: exactDecimal("revenue"),
    ebitda: exactDecimal("ebitda"),
    pat: exactDecimal("pat"),
    totalAssets: exactDecimal("total_assets"),
    netWorth: exactDecimal("net_worth"),
    totalDebt: exactDecimal("total_debt"),
    operatingCashFlow: exactDecimal("operating_cash_flow"),
    isAudited: integer("is_audited", { mode: "boolean" }),
    verifiedAt: utcTimestamp("verified_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("uq_ipo_financials_period").on(table.ipoId, table.fiscalPeriod, table.periodType),
    index("idx_ipo_financials_source").on(table.sourceId),
    index("idx_ipo_financials_document").on(table.documentId),
    check("ck_ipo_financials_currency_inr", sql`${table.currency} = 'INR'`),
  ],
);

export const ipoListingPerformance = sqliteTable(
  "ipo_listing_performance",
  {
    id: entityId(),
    ipoId: text("ipo_id")
      .notNull()
      .references(() => ipos.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id, {
      onDelete: "set null",
    }),
    listingDate: text("listing_date"),
    issuePrice: exactDecimal("issue_price"),
    listingOpen: exactDecimal("listing_open"),
    listingHigh: exactDecimal("listing_high"),
    listingLow: exactDecimal("listing_low"),
    listingClose: exactDecimal("listing_close"),
    currentPrice: exactDecimal("current_price"),
    listingGainPercent: exactDecimal("listing_gain_percent"),
    listingCloseGainPercent: exactDecimal("listing_close_gain_percent"),
    currentReturnFromIssue: exactDecimal("current_return_from_issue"),
    return1d: exactDecimal("return_1d"),
    return1w: exactDecimal("return_1w"),
    return1m: exactDecimal("return_1m"),
    return3m: exactDecimal("return_3m"),
    return6m: exactDecimal("return_6m"),
    return1y: exactDecimal("return_1y"),
    quoteMode: text("quote_mode", { enum: quoteModes }).notNull().default("UNKNOWN"),
    delayMinutes: integer("delay_minutes"),
    observedAt: utcTimestamp("observed_at").notNull(),
    fetchedAt: utcNow("fetched_at"),
    createdAt: utcNow("created_at"),
  },
  (table) => [
    uniqueIndex("uq_ipo_listing_performance_observation").on(
      table.ipoId,
      table.sourceId,
      table.observedAt,
    ),
    index("idx_ipo_listing_performance_latest").on(table.ipoId, table.observedAt),
    index("idx_ipo_listing_performance_source").on(table.sourceId, table.observedAt),
    check(
      "ck_ipo_listing_performance_delay_nonnegative",
      sql`${table.delayMinutes} IS NULL OR ${table.delayMinutes} >= 0`,
    ),
  ],
);

export const newsArticles = sqliteTable(
  "news_articles",
  {
    id: entityId(),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id, {
      onDelete: "set null",
    }),
    rawRecordId: text("raw_record_id").references(() => rawProviderRecords.id, {
      onDelete: "set null",
    }),
    externalId: text("external_id"),
    headline: text("headline").notNull(),
    summary: text("summary"),
    publisher: text("publisher").notNull(),
    category: text("category", { enum: newsCategories }).notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    imageUrl: text("image_url"),
    language: text("language").notNull().default("en"),
    publishedAt: utcTimestamp("published_at").notNull(),
    fetchedAt: utcNow("fetched_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("uq_news_articles_source_url").on(table.sourceId, table.canonicalUrl),
    uniqueIndex("uq_news_articles_source_external_id")
      .on(table.sourceId, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    index("idx_news_articles_published").on(table.publishedAt),
    index("idx_news_articles_category_published").on(table.category, table.publishedAt),
    index("idx_news_articles_source_published").on(table.sourceId, table.publishedAt),
  ],
);

export const newsCompanies = sqliteTable(
  "news_companies",
  {
    newsId: text("news_id")
      .notNull()
      .references(() => newsArticles.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.newsId, table.companyId] }),
    index("idx_news_companies_company").on(table.companyId, table.newsId),
  ],
);

export const newsIpos = sqliteTable(
  "news_ipos",
  {
    newsId: text("news_id")
      .notNull()
      .references(() => newsArticles.id, { onDelete: "cascade" }),
    ipoId: text("ipo_id")
      .notNull()
      .references(() => ipos.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.newsId, table.ipoId] }),
    index("idx_news_ipos_ipo").on(table.ipoId, table.newsId),
  ],
);

export const marketIndices = sqliteTable(
  "market_indices",
  {
    id: entityId(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    exchange: text("exchange").notNull(),
    currency: text("currency").notNull().default("INR"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("uq_market_indices_exchange_symbol").on(table.exchange, table.symbol),
    index("idx_market_indices_active").on(table.isActive, table.name),
    check("ck_market_indices_currency_inr", sql`${table.currency} = 'INR'`),
  ],
);

export const marketIndexQuotes = sqliteTable(
  "market_index_quotes",
  {
    id: entityId(),
    marketIndexId: text("market_index_id")
      .notNull()
      .references(() => marketIndices.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id, {
      onDelete: "set null",
    }),
    value: exactDecimal("value").notNull(),
    change: exactDecimal("change"),
    changePercent: exactDecimal("change_percent"),
    open: exactDecimal("open"),
    high: exactDecimal("high"),
    low: exactDecimal("low"),
    previousClose: exactDecimal("previous_close"),
    quoteMode: text("quote_mode", { enum: quoteModes }).notNull().default("UNKNOWN"),
    delayMinutes: integer("delay_minutes"),
    marketStatus: text("market_status"),
    observedAt: utcTimestamp("observed_at").notNull(),
    fetchedAt: utcNow("fetched_at"),
  },
  (table) => [
    uniqueIndex("uq_market_index_quotes_observation").on(
      table.marketIndexId,
      table.sourceId,
      table.observedAt,
    ),
    index("idx_market_index_quotes_latest").on(table.marketIndexId, table.observedAt),
    index("idx_market_index_quotes_source").on(table.sourceId, table.observedAt),
    check(
      "ck_market_index_quotes_delay_nonnegative",
      sql`${table.delayMinutes} IS NULL OR ${table.delayMinutes} >= 0`,
    ),
  ],
);

export const providerStatus = sqliteTable(
  "provider_status",
  {
    id: entityId(),
    sourceId: text("source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "cascade" }),
    health: text("health", { enum: providerHealthStates })
      .notNull()
      .default("UNKNOWN"),
    lastAttemptAt: utcTimestamp("last_attempt_at"),
    lastSuccessfulAt: utcTimestamp("last_successful_at"),
    lastFailureAt: utcTimestamp("last_failure_at"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    recordsSynced: integer("records_synced").notNull().default(0),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    latencyMs: integer("latency_ms"),
    updatedAt: utcNow("updated_at"),
  },
  (table) => [
    uniqueIndex("uq_provider_status_source").on(table.sourceId),
    index("idx_provider_status_health").on(table.health, table.updatedAt),
    check(
      "ck_provider_status_counts_nonnegative",
      sql`${table.recordsSynced} >= 0 AND ${table.consecutiveFailures} >= 0 AND (${table.latencyMs} IS NULL OR ${table.latencyMs} >= 0)`,
    ),
  ],
);

export const ingestionErrors = sqliteTable(
  "ingestion_errors",
  {
    id: entityId(),
    ingestionRunId: text("ingestion_run_id").references(() => ingestionRuns.id, {
      onDelete: "set null",
    }),
    sourceId: text("source_id").references(() => dataSources.id, {
      onDelete: "set null",
    }),
    rawRecordId: text("raw_record_id").references(() => rawProviderRecords.id, {
      onDelete: "set null",
    }),
    operation: text("operation").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    rawIdentifier: text("raw_identifier"),
    errorCode: text("error_code"),
    errorMessage: text("error_message").notNull(),
    context: json<Record<string, unknown>>("context_json"),
    isRetryable: integer("is_retryable", { mode: "boolean" }).notNull().default(false),
    retryCount: integer("retry_count").notNull().default(0),
    resolvedAt: utcTimestamp("resolved_at"),
    createdAt: utcNow("created_at"),
  },
  (table) => [
    index("idx_ingestion_errors_run").on(table.ingestionRunId, table.createdAt),
    index("idx_ingestion_errors_source_created").on(table.sourceId, table.createdAt),
    index("idx_ingestion_errors_unresolved").on(table.resolvedAt, table.createdAt),
    check("ck_ingestion_errors_retry_count", sql`${table.retryCount} >= 0`),
  ],
);

export const dataConflicts = sqliteTable(
  "data_conflicts",
  {
    id: entityId(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    ipoId: text("ipo_id").references(() => ipos.id, { onDelete: "cascade" }),
    fieldName: text("field_name").notNull(),
    preferredFieldSourceId: text("preferred_field_source_id").references(
      () => ipoFieldSources.id,
      { onDelete: "set null" },
    ),
    challengerFieldSourceId: text("challenger_field_source_id").references(
      () => ipoFieldSources.id,
      { onDelete: "set null" },
    ),
    preferredSourceId: text("preferred_source_id").references(() => dataSources.id, {
      onDelete: "set null",
    }),
    challengerSourceId: text("challenger_source_id").references(() => dataSources.id, {
      onDelete: "set null",
    }),
    preferredValue: text("preferred_value"),
    challengerValue: text("challenger_value"),
    status: text("status", { enum: conflictStatuses }).notNull().default("OPEN"),
    resolutionReason: text("resolution_reason"),
    resolvedBy: text("resolved_by"),
    resolvedAt: utcTimestamp("resolved_at"),
    ...auditColumns(),
  },
  (table) => [
    index("idx_data_conflicts_open").on(table.status, table.createdAt),
    index("idx_data_conflicts_entity_field").on(
      table.entityType,
      table.entityId,
      table.fieldName,
    ),
    index("idx_data_conflicts_ipo").on(table.ipoId, table.status),
  ],
);

export const manualOverrides = sqliteTable(
  "manual_overrides",
  {
    id: entityId(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    ipoId: text("ipo_id").references(() => ipos.id, { onDelete: "cascade" }),
    fieldName: text("field_name").notNull(),
    valueType: text("value_type", { enum: fieldValueTypes }).notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    sourceId: text("source_id").references(() => dataSources.id, {
      onDelete: "set null",
    }),
    fieldSourceId: text("field_source_id").references(() => ipoFieldSources.id, {
      onDelete: "set null",
    }),
    conflictId: text("conflict_id").references(() => dataConflicts.id, {
      onDelete: "set null",
    }),
    verifiedBy: text("verified_by"),
    verifiedAt: utcTimestamp("verified_at"),
    appliedAt: utcNow("applied_at"),
    revokedAt: utcTimestamp("revoked_at"),
    revokedBy: text("revoked_by"),
    revocationReason: text("revocation_reason"),
  },
  (table) => [
    uniqueIndex("uq_manual_overrides_active_field")
      .on(table.entityType, table.entityId, table.fieldName)
      .where(sql`${table.revokedAt} IS NULL`),
    index("idx_manual_overrides_ipo").on(table.ipoId, table.appliedAt),
    index("idx_manual_overrides_actor").on(table.createdBy, table.appliedAt),
    index("idx_manual_overrides_unverified").on(table.verifiedAt, table.appliedAt),
  ],
);

export type DataSource = typeof dataSources.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type IpoRecord = typeof ipos.$inferSelect;
export type IpoDocumentRecord = typeof ipoDocuments.$inferSelect;
export type IpoGmpRecord = typeof ipoGmpHistory.$inferSelect;
export type IpoSubscriptionRecord = typeof ipoSubscriptionSnapshots.$inferSelect;
export type IngestionRun = typeof ingestionRuns.$inferSelect;
