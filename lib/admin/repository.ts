import { getD1 } from "@/db";

export type AdminProviderRow = {
  providerKey: string;
  providerName: string;
  sourceKind: string;
  isOfficial: number;
  isActive: number;
  health: string | null;
  lastAttemptAt: number | null;
  lastSuccessfulAt: number | null;
  lastFailureAt: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  recordsSynced: number | null;
  consecutiveFailures: number | null;
  latencyMs: number | null;
};

export type AdminRunRow = {
  id: string;
  providerKey: string;
  jobType: string;
  trigger: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errorCount: number;
  errorSummary: string | null;
};

export type AdminErrorRow = {
  id: string;
  providerName: string | null;
  operation: string;
  entityType: string | null;
  rawIdentifier: string | null;
  errorCode: string | null;
  errorMessage: string;
  isRetryable: number;
  retryCount: number;
  createdAt: number;
};

export type AdminIpoRow = {
  id: string;
  slug: string;
  companyName: string;
  status: string;
  board: string | null;
  openDate: string | null;
  closeDate: string | null;
  listingDate: string | null;
  priceBandMin: string | null;
  priceBandMax: string | null;
  lastSeenAt: number;
  selectedFieldCount: number;
  latestDocumentType: string | null;
  latestFilingDate: string | null;
  latestSource: string | null;
};

export type AdminFieldSourceRow = {
  id: string;
  ipoId: string;
  companyName: string;
  fieldName: string;
  sourceName: string;
  normalizedValue: string | null;
  confidence: number | null;
  fetchedAt: number;
  verifiedAt: number | null;
};

export type AdminAliasRow = {
  id: string;
  companyId: string;
  companyName: string;
  sourceName: string;
  externalName: string;
  normalizedName: string;
  isVerified: number;
  updatedAt: number;
};

export type AdminOverrideRow = {
  id: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  createdBy: string;
  verifiedBy: string | null;
  verifiedAt: number | null;
  appliedAt: number;
};

export type AdminDashboard = {
  providers: AdminProviderRow[];
  runs: AdminRunRow[];
  errors: AdminErrorRow[];
  ipos: AdminIpoRow[];
  fieldSources: AdminFieldSourceRow[];
  aliases: AdminAliasRow[];
  overrides: AdminOverrideRow[];
};

async function rows<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  return result.results;
}

/** Read-only, bounded operational data for the protected admin route. */
export async function readAdminDashboard(): Promise<AdminDashboard> {
  const database = getD1();

  const providers = await rows<AdminProviderRow>(database.prepare(`
    SELECT
      ds.key AS providerKey,
      ds.name AS providerName,
      ds.source_kind AS sourceKind,
      ds.is_official AS isOfficial,
      ds.is_active AS isActive,
      ps.health AS health,
      ps.last_attempt_at AS lastAttemptAt,
      ps.last_successful_at AS lastSuccessfulAt,
      ps.last_failure_at AS lastFailureAt,
      ps.last_error_code AS lastErrorCode,
      substr(ps.last_error_message, 1, 500) AS lastErrorMessage,
      ps.records_synced AS recordsSynced,
      ps.consecutive_failures AS consecutiveFailures,
      ps.latency_ms AS latencyMs
    FROM data_sources ds
    LEFT JOIN provider_status ps ON ps.source_id = ds.id
    ORDER BY ds.is_active DESC, ds.is_official DESC, ds.name ASC
    LIMIT 100
  `));

  const runs = await rows<AdminRunRow>(database.prepare(`
    SELECT
      id,
      provider_key AS providerKey,
      job_type AS jobType,
      trigger,
      status,
      started_at AS startedAt,
      finished_at AS finishedAt,
      records_fetched AS recordsFetched,
      records_created AS recordsCreated,
      records_updated AS recordsUpdated,
      records_skipped AS recordsSkipped,
      error_count AS errorCount,
      substr(error_summary, 1, 500) AS errorSummary
    FROM ingestion_runs
    ORDER BY started_at DESC
    LIMIT 30
  `));

  const errors = await rows<AdminErrorRow>(database.prepare(`
    SELECT
      ie.id,
      ds.name AS providerName,
      ie.operation,
      ie.entity_type AS entityType,
      ie.raw_identifier AS rawIdentifier,
      ie.error_code AS errorCode,
      substr(ie.error_message, 1, 500) AS errorMessage,
      ie.is_retryable AS isRetryable,
      ie.retry_count AS retryCount,
      ie.created_at AS createdAt
    FROM ingestion_errors ie
    LEFT JOIN data_sources ds ON ds.id = ie.source_id
    WHERE ie.resolved_at IS NULL
    ORDER BY ie.created_at DESC
    LIMIT 30
  `));

  const ipos = await rows<AdminIpoRow>(database.prepare(`
    SELECT
      i.id,
      i.slug,
      c.display_name AS companyName,
      i.status,
      i.board,
      i.open_date AS openDate,
      i.close_date AS closeDate,
      i.listing_date AS listingDate,
      i.price_band_min AS priceBandMin,
      i.price_band_max AS priceBandMax,
      i.last_seen_at AS lastSeenAt,
      (SELECT count(*) FROM ipo_field_sources ifs WHERE ifs.ipo_id = i.id AND ifs.is_selected = 1 AND ifs.superseded_at IS NULL) AS selectedFieldCount,
      (SELECT d.document_type FROM ipo_documents d WHERE d.ipo_id = i.id AND d.is_current = 1 ORDER BY d.filing_date DESC, d.fetched_at DESC LIMIT 1) AS latestDocumentType,
      (SELECT d.filing_date FROM ipo_documents d WHERE d.ipo_id = i.id AND d.is_current = 1 ORDER BY d.filing_date DESC, d.fetched_at DESC LIMIT 1) AS latestFilingDate,
      (SELECT ds.name FROM ipo_documents d JOIN data_sources ds ON ds.id = d.source_id WHERE d.ipo_id = i.id AND d.is_current = 1 ORDER BY d.filing_date DESC, d.fetched_at DESC LIMIT 1) AS latestSource
    FROM ipos i
    JOIN companies c ON c.id = i.company_id
    ORDER BY i.last_seen_at DESC
    LIMIT 50
  `));

  const fieldSources = await rows<AdminFieldSourceRow>(database.prepare(`
    SELECT
      ifs.id,
      ifs.ipo_id AS ipoId,
      c.display_name AS companyName,
      ifs.field_name AS fieldName,
      ds.name AS sourceName,
      ifs.normalized_value AS normalizedValue,
      ifs.confidence,
      ifs.fetched_at AS fetchedAt,
      ifs.verified_at AS verifiedAt
    FROM ipo_field_sources ifs
    JOIN ipos i ON i.id = ifs.ipo_id
    JOIN companies c ON c.id = i.company_id
    JOIN data_sources ds ON ds.id = ifs.source_id
    WHERE ifs.is_selected = 1 AND ifs.superseded_at IS NULL
    ORDER BY ifs.fetched_at DESC
    LIMIT 100
  `));

  const aliases = await rows<AdminAliasRow>(database.prepare(`
    SELECT
      ca.id,
      ca.company_id AS companyId,
      c.display_name AS companyName,
      ds.name AS sourceName,
      ca.external_name AS externalName,
      ca.normalized_name AS normalizedName,
      ca.is_verified AS isVerified,
      ca.updated_at AS updatedAt
    FROM company_aliases ca
    JOIN companies c ON c.id = ca.company_id
    JOIN data_sources ds ON ds.id = ca.source_id
    ORDER BY ca.updated_at DESC
    LIMIT 80
  `));

  const overrides = await rows<AdminOverrideRow>(database.prepare(`
    SELECT
      id,
      entity_type AS entityType,
      entity_id AS entityId,
      field_name AS fieldName,
      old_value AS oldValue,
      new_value AS newValue,
      reason,
      created_by AS createdBy,
      verified_by AS verifiedBy,
      verified_at AS verifiedAt,
      applied_at AS appliedAt
    FROM manual_overrides
    ORDER BY applied_at DESC
    LIMIT 30
  `));

  return { providers, runs, errors, ipos, fieldSources, aliases, overrides };
}
