import {
  D1BindingUnavailableError,
  D1SchemaUnavailableError,
  getD1,
} from "@/db";
import { calculateGMP, percentageReturn } from "@/lib/ingestion/calculations";
import {
  authoritativeExplicitStatus,
  calculateIPOStatus,
  eventState,
} from "@/lib/ingestion/status";
import type {
  DocumentAvailability,
  DocumentType,
  EventType,
  Exchange,
  FieldProvenance,
  IPO,
  IPODocument,
  IPOEvent,
  IPOFilters,
  IPOFinancial,
  IPOGMPRecord,
  IPOSort,
  IPOSubscription,
  MarketIndex,
  NewsArticle,
  NewsCategory,
  NewsFilters,
  ProviderStatus,
  QuoteTimeliness,
  Source,
  SourceType,
} from "@/types";

type UnknownRow = Record<string, unknown>;

export type DatabaseReadRepositoryOptions = {
  database?: D1Database;
  now?: () => Date;
};

export type DatabaseIngestionRunSummary = {
  id: string;
  provider: string;
  jobType: string;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  recordsFetched: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errorCount: number;
  errorSummary?: string;
};

export type DatabaseIngestionErrorSummary = {
  id: string;
  provider: string;
  operation: string;
  entityType?: string;
  entityId?: string;
  rawIdentifier?: string;
  errorCode?: string;
  errorMessage: string;
  isRetryable: boolean;
  retryCount: number;
  resolvedAt?: string;
  createdAt: string;
};

/**
 * A database read failed. The original D1 error is retained as `cause`; reads
 * never turn binding, schema, or malformed-record failures into mock values.
 */
export class DatabaseReadError extends Error {
  readonly operation: string;

  constructor(operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : "Unknown D1 read failure";
    super(`Database read failed during ${operation}: ${detail}`, { cause });
    this.name = "DatabaseReadError";
    this.operation = operation;
  }
}

export class DatabaseRecordSerializationError extends Error {
  readonly entity: string;
  readonly field: string;

  constructor(entity: string, field: string) {
    super(`Database record ${entity} has an invalid required value for ${field}.`);
    this.name = "DatabaseRecordSerializationError";
    this.entity = entity;
    this.field = field;
  }
}

type BaseIPORow = UnknownRow & {
  ipo_id: string;
  ipo_slug: string;
  company_id: string;
  company_name: string;
  company_slug: string;
};

type SelectedFieldSourceRow = UnknownRow & {
  ipo_id: string;
  field_name: string;
  field_source_id: string;
};

type SelectedFieldProvenance = FieldProvenance & {
  normalizedValue?: string;
  sourceKind: string;
  authorityLevel: string;
  isOfficial: boolean;
};

const IPO_BASE_QUERY = `
WITH latest_gmp AS (
  SELECT ranked.*
  FROM (
    SELECT g.*,
      ROW_NUMBER() OVER (PARTITION BY g.ipo_id ORDER BY g.observed_at DESC, g.id DESC) AS row_number
    FROM ipo_gmp_history g
    WHERE g.is_valid = 1
  ) ranked
  WHERE ranked.row_number = 1
),
latest_subscription AS (
  SELECT ranked.*
  FROM (
    SELECT s.*,
      ROW_NUMBER() OVER (PARTITION BY s.ipo_id ORDER BY s.observed_at DESC, s.id DESC) AS row_number
    FROM ipo_subscription_snapshots s
    WHERE s.total IS NOT NULL
  ) ranked
  WHERE ranked.row_number = 1
),
latest_listing AS (
  SELECT ranked.*
  FROM (
    SELECT l.*,
      ROW_NUMBER() OVER (PARTITION BY l.ipo_id ORDER BY l.observed_at DESC, l.id DESC) AS row_number
    FROM ipo_listing_performance l
  ) ranked
  WHERE ranked.row_number = 1
),
latest_filing AS (
  SELECT ranked.*
  FROM (
    SELECT d.*,
      ROW_NUMBER() OVER (
        PARTITION BY d.ipo_id
        ORDER BY COALESCE(d.filing_date, '0000-00-00') DESC, d.fetched_at DESC, d.id DESC
      ) AS row_number
    FROM ipo_documents d
    WHERE d.is_current = 1
      AND d.document_type IN (
        'DRHP', 'UPDATED_DRHP', 'CORRIGENDUM', 'ADDENDUM', 'RHP',
        'ABRIDGED_PROSPECTUS', 'FINAL_OFFER_DOCUMENT'
      )
  ) ranked
  WHERE ranked.row_number = 1
)
SELECT
  i.id AS ipo_id,
  i.slug AS ipo_slug,
  i.company_id,
  i.board,
  i.face_value,
  i.price_band_min,
  i.price_band_max,
  i.issue_price AS ipo_issue_price,
  i.lot_size,
  i.issue_size_cr,
  i.fresh_issue_cr,
  i.offer_for_sale_cr,
  i.employee_reservation_cr,
  i.shareholder_reservation_cr,
  i.anchor_date,
  i.open_date,
  i.close_date,
  i.allotment_date,
  i.refund_date,
  i.demat_date,
  i.listing_date,
  i.registrar_name,
  i.registrar_url,
  i.lead_managers_json,
  i.exchanges_json,
  i.created_at AS ipo_created_at,
  i.updated_at AS ipo_updated_at,
  c.id AS company_id,
  c.display_name AS company_name,
  c.legal_name AS company_legal_name,
  c.slug AS company_slug,
  c.sector AS company_sector,
  c.industry AS company_industry,
  c.website_url AS company_website_url,
  c.headquarters AS company_headquarters,
  c.summary AS company_summary,
  c.created_at AS company_created_at,
  c.updated_at AS company_updated_at,
  EXISTS (
    SELECT 1 FROM ipo_documents drhp
    WHERE drhp.ipo_id = i.id AND drhp.document_type IN ('DRHP', 'UPDATED_DRHP')
  ) AS has_drhp,
  EXISTS (
    SELECT 1 FROM ipo_documents rhp
    WHERE rhp.ipo_id = i.id
      AND rhp.document_type IN ('RHP', 'ABRIDGED_PROSPECTUS', 'FINAL_OFFER_DOCUMENT')
  ) AS has_rhp,
  g.id AS latest_gmp_id,
  g.gmp AS latest_gmp,
  g.upper_price_band AS latest_gmp_upper_band,
  g.estimated_listing_price AS latest_estimated_listing_price,
  g.gmp_percent AS latest_gmp_percent,
  g.source_url AS latest_gmp_source_url,
  g.observed_at AS latest_gmp_observed_at,
  g.fetched_at AS latest_gmp_fetched_at,
  gs.id AS latest_gmp_source_id,
  gs.name AS latest_gmp_source_name,
  gs.source_kind AS latest_gmp_source_kind,
  gs.authority_level AS latest_gmp_authority_level,
  gs.homepage_url AS latest_gmp_homepage_url,
  gs.base_url AS latest_gmp_base_url,
  gs.is_official AS latest_gmp_is_official,
  s.id AS latest_subscription_id,
  s.total AS latest_subscription_total,
  s.observed_at AS latest_subscription_observed_at,
  s.fetched_at AS latest_subscription_fetched_at,
  l.id AS latest_listing_id,
  l.issue_price AS latest_listing_issue_price,
  l.listing_open AS latest_listing_open,
  l.listing_close AS latest_listing_close,
  l.current_price AS latest_listing_current_price,
  l.listing_gain_percent AS latest_listing_gain_percent,
  l.listing_close_gain_percent AS latest_listing_close_gain_percent,
  l.current_return_from_issue AS latest_current_return_from_issue,
  l.observed_at AS latest_listing_observed_at,
  f.id AS latest_filing_id,
  f.document_type AS latest_filing_type,
  f.filing_date AS latest_filing_date,
  f.document_url AS latest_filing_document_url,
  f.source_url AS latest_filing_source_url,
  f.availability_status AS latest_filing_availability_status,
  f.availability_checked_at AS latest_filing_availability_checked_at,
  f.availability_http_status AS latest_filing_availability_http_status,
  f.fetched_at AS latest_filing_fetched_at,
  fs.id AS latest_filing_source_id,
  fs.name AS latest_filing_source_name,
  fs.source_kind AS latest_filing_source_kind,
  fs.authority_level AS latest_filing_authority_level,
  fs.homepage_url AS latest_filing_homepage_url,
  fs.base_url AS latest_filing_base_url,
  fs.is_official AS latest_filing_is_official
FROM ipos i
INNER JOIN companies c ON c.id = i.company_id
LEFT JOIN latest_gmp g ON g.ipo_id = i.id
LEFT JOIN data_sources gs ON gs.id = g.source_id
LEFT JOIN latest_subscription s ON s.ipo_id = i.id
LEFT JOIN latest_listing l ON l.ipo_id = i.id
LEFT JOIN latest_filing f ON f.ipo_id = i.id
LEFT JOIN data_sources fs ON fs.id = f.source_id
`;

const SELECTED_FIELD_SOURCE_QUERY = `
SELECT
  p.id AS field_source_id,
  p.ipo_id,
  p.field_name,
  p.normalized_value,
  p.priority,
  p.confidence,
  p.source_url,
  p.fetched_at,
  p.verified_at,
  s.id AS source_id,
  s.name AS source_name,
  s.source_kind,
  s.authority_level,
  s.homepage_url,
  s.base_url,
  s.is_official,
  s.last_fetched_at AS source_last_fetched_at,
  s.last_successful_at AS source_last_successful_at,
  s.updated_at AS source_updated_at
FROM ipo_field_sources p
INNER JOIN data_sources s ON s.id = p.source_id
WHERE p.is_selected = 1 AND p.superseded_at IS NULL
`;

const IPO_DOCUMENT_QUERY = `
SELECT
  d.id,
  d.ipo_id,
  d.document_type,
  d.title,
  d.filing_date,
  d.document_url,
  d.source_url,
  d.availability_status,
  d.availability_checked_at,
  d.availability_http_status,
  d.is_current,
  d.fetched_at,
  d.updated_at,
  s.id AS source_id,
  s.name AS source_name,
  s.source_kind,
  s.authority_level,
  s.homepage_url,
  s.base_url,
  s.is_official,
  s.last_fetched_at AS source_last_fetched_at,
  s.last_successful_at AS source_last_successful_at,
  s.updated_at AS source_updated_at
FROM ipo_documents d
INNER JOIN data_sources s ON s.id = d.source_id
`;

const SOURCE_KIND_MAP: Record<string, SourceType> = {
  REGULATOR: "regulator",
  EXCHANGE: "exchange",
  REGISTRAR: "registrar",
  OFFER_DOCUMENT: "offer_document",
  ISSUER: "issuer",
  STRUCTURED_API: "third_party",
  GMP_PROVIDER: "third_party",
  NEWS_PUBLISHER: "editorial",
  MARKET_DATA: "third_party",
  MANUAL: "manual",
  DERIVED: "derived",
};

const DOCUMENT_TYPE_MAP: Record<string, DocumentType> = {
  DRHP: "drhp",
  UPDATED_DRHP: "updated_drhp",
  RHP: "rhp",
  ABRIDGED_PROSPECTUS: "abridged_prospectus",
  CORRIGENDUM: "corrigendum",
  ADDENDUM: "addendum",
  FINAL_OFFER_DOCUMENT: "final_offer_document",
  ANCHOR_ALLOCATION: "anchor_allocation",
  BASIS_OF_ALLOTMENT: "basis_of_allotment",
  ANNUAL_REPORT: "annual_report",
  OTHER: "other",
};

const DOCUMENT_EVENT_MAP: Partial<Record<string, EventType>> = {
  DRHP: "drhp_filed",
  UPDATED_DRHP: "updated_drhp_filed",
  RHP: "rhp_filed",
  CORRIGENDUM: "corrigendum_filed",
  ADDENDUM: "addendum_filed",
  ANCHOR_ALLOCATION: "anchor_allocation",
  BASIS_OF_ALLOTMENT: "basis_of_allotment",
};

const EVENT_LABELS: Record<EventType, string> = {
  drhp_filed: "DRHP filed",
  updated_drhp_filed: "Updated DRHP filed",
  sebi_observation: "SEBI observations",
  rhp_filed: "RHP filed",
  corrigendum_filed: "Corrigendum filed",
  addendum_filed: "Addendum filed",
  anchor_allocation: "Anchor allocation",
  ipo_open: "IPO opens",
  ipo_close: "IPO closes",
  basis_of_allotment: "Basis of allotment",
  refund: "Refunds initiated",
  demat_credit: "Demat credit",
  listing: "Listing",
};

const EXCHANGES = new Set<Exchange>(["NSE", "BSE", "NSE_EMERGE", "BSE_SME"]);
const NEWS_CATEGORIES = new Set<NewsCategory>([
  "ipo",
  "markets",
  "company",
  "sebi",
  "rbi",
  "economy",
  "results",
  "corporate_actions",
]);
const QUOTE_MODES = new Set<QuoteTimeliness>(["REALTIME", "DELAYED", "EOD", "UNKNOWN"]);
const DOCUMENT_AVAILABILITIES = new Set<DocumentAvailability>([
  "unchecked",
  "available",
  "not_found",
  "unknown",
]);
const FIELD_SOURCE_BATCH_SIZE = 80;

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requiredString(value: unknown, entity: string, field: string): string {
  const result = optionalString(value);
  if (!result) throw new DatabaseRecordSerializationError(entity, field);
  return result;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function requiredNumber(value: unknown, entity: string, field: string): number {
  const result = optionalNumber(value);
  if (result === undefined) throw new DatabaseRecordSerializationError(entity, field);
  return result;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function isoTimestamp(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const date = value instanceof Date
    ? value
    : new Date(typeof value === "number" || /^\d+$/.test(String(value)) ? Number(value) : String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function requiredTimestamp(value: unknown, entity: string, field: string): string {
  const result = isoTimestamp(value);
  if (!result) throw new DatabaseRecordSerializationError(entity, field);
  return result;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function exchangeArray(value: unknown): Exchange[] {
  return stringArray(value).filter((item): item is Exchange => EXCHANGES.has(item as Exchange));
}

function sourceType(value: unknown): SourceType {
  return SOURCE_KIND_MAP[String(value)] ?? "third_party";
}

function documentType(value: unknown): DocumentType | undefined {
  return DOCUMENT_TYPE_MAP[String(value)];
}

function documentAvailability(value: unknown): DocumentAvailability {
  const normalized = String(value ?? "UNCHECKED").toLowerCase() as DocumentAvailability;
  return DOCUMENT_AVAILABILITIES.has(normalized) ? normalized : "unchecked";
}

function fallbackSource(id: string, lastUpdated: string): Source {
  return {
    id: `database:${id}`,
    sourceName: "Normalized database record",
    sourceUrl: "",
    sourceType: "derived",
    lastUpdated,
    fetchedAt: lastUpdated,
    isOfficial: false,
  };
}

function mapSource(
  row: UnknownRow,
  prefix: string,
  recordUrl?: string,
  recordUpdatedAt?: string,
): Source | undefined {
  const id = optionalString(row[`${prefix}source_id`]);
  const name = optionalString(row[`${prefix}source_name`]);
  if (!id || !name) return undefined;

  const fetchedAt = isoTimestamp(
    row[`${prefix}fetched_at`]
      ?? row[`${prefix}source_last_fetched_at`]
      ?? row[`${prefix}source_last_successful_at`],
  );
  const lastUpdated = recordUpdatedAt
    ?? fetchedAt
    ?? isoTimestamp(row[`${prefix}source_updated_at`])
    ?? new Date(0).toISOString();

  return {
    id,
    sourceName: name,
    sourceUrl: recordUrl
      ?? optionalString(row[`${prefix}source_url`])
      ?? optionalString(row[`${prefix}homepage_url`])
      ?? optionalString(row[`${prefix}base_url`])
      ?? "",
    sourceType: sourceType(row[`${prefix}source_kind`]),
    lastUpdated,
    ...(fetchedAt ? { fetchedAt } : {}),
    isOfficial:
      booleanValue(row[`${prefix}is_official`])
      || row[`${prefix}authority_level`] === "OFFICIAL",
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
}

function normalizeFiscalYear(value: unknown): IPOFinancial["fiscalYear"] | undefined {
  const text = String(value).trim().toUpperCase().replaceAll(" ", "");
  const match = /^(?:FY)?(?:20)?(\d{2})$/.exec(text);
  return match ? `FY${match[1]}` : undefined;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return slug || "news-item";
}

function newsCategory(value: unknown, entity: string): NewsCategory {
  const normalized = String(value).toLowerCase() as NewsCategory;
  if (!NEWS_CATEGORIES.has(normalized)) {
    throw new DatabaseRecordSerializationError(entity, "category");
  }
  return normalized;
}

function quoteMode(value: unknown): QuoteTimeliness {
  const normalized = String(value).toUpperCase() as QuoteTimeliness;
  return QUOTE_MODES.has(normalized) ? normalized : "UNKNOWN";
}

function boundedLimit(value: number | undefined, fallback = 25): number {
  const limit = value ?? fallback;
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function statusFilter(ipo: IPO, filters: IPOFilters): boolean {
  const query = filters.query?.trim().toLowerCase();
  const dateForYear = ipo.openDate ?? ipo.latestFilingDate;
  return (
    (!filters.type || ipo.type === filters.type)
    && (!filters.status || ipo.status === filters.status)
    && (!filters.exchange || ipo.exchange.includes(filters.exchange))
    && (!filters.year || dateForYear?.startsWith(String(filters.year)) === true)
    && (filters.minIssueSizeCr === undefined
      || (ipo.issueSizeCr !== undefined && ipo.issueSizeCr >= filters.minIssueSizeCr))
    && (filters.maxIssueSizeCr === undefined
      || (ipo.issueSizeCr !== undefined && ipo.issueSizeCr <= filters.maxIssueSizeCr))
    && (!query || [
      ipo.company.name,
      ipo.company.legalName,
      ipo.company.industry,
      ipo.company.sector,
      ipo.slug,
    ].some((value) => value?.toLowerCase().includes(query)))
  );
}

function sortIPOs(rows: IPO[], sort: IPOSort): IPO[] {
  const numberDescending = (left?: number, right?: number) =>
    (right ?? Number.NEGATIVE_INFINITY) - (left ?? Number.NEGATIVE_INFINITY);
  return [...rows].sort((left, right) => {
    if (sort === "issue_size") return numberDescending(left.issueSizeCr, right.issueSizeCr);
    if (sort === "subscription") return numberDescending(left.subscriptionTotal, right.subscriptionTotal);
    if (sort === "listing_gain") return numberDescending(left.listingGainPercent, right.listingGainPercent);
    if (sort === "gmp_percent") {
      const leftPercent = left.gmp !== undefined && left.priceBandMax
        ? left.gmp / left.priceBandMax
        : undefined;
      const rightPercent = right.gmp !== undefined && right.priceBandMax
        ? right.gmp / right.priceBandMax
        : undefined;
      return numberDescending(leftPercent, rightPercent);
    }
    return (right.openDate ?? right.latestFilingDate ?? right.updatedAt ?? "")
      .localeCompare(left.openDate ?? left.latestFilingDate ?? left.updatedAt ?? "");
  });
}

/**
 * Read-only, server-side view of normalized D1 data. All returned values are
 * plain JSON-serializable domain objects; no Drizzle Date objects escape.
 */
export class DatabaseReadRepository {
  private readonly configuredDatabase?: D1Database;
  private readonly now: () => Date;

  constructor(options: DatabaseReadRepositoryOptions = {}) {
    this.configuredDatabase = options.database;
    this.now = options.now ?? (() => new Date());
  }

  private database(): D1Database {
    return getD1(this.configuredDatabase);
  }

  private async all<T extends UnknownRow>(
    operation: string,
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    try {
      let statement = this.database().prepare(sql);
      if (params.length) statement = statement.bind(...params);
      const result = await statement.all<T>();
      return result.results;
    } catch (error) {
      if (error instanceof D1BindingUnavailableError || error instanceof D1SchemaUnavailableError) {
        throw error;
      }
      const missingTable = /no such table:\s*(?:main\.)?[`"']?([a-zA-Z0-9_]+)/i.exec(
        error instanceof Error ? error.message : String(error),
      )?.[1];
      if (missingTable) throw new D1SchemaUnavailableError([missingTable]);
      throw new DatabaseReadError(operation, error);
    }
  }

  private async selectedFieldSources(ipoIds: readonly string[]): Promise<Map<string, SelectedFieldProvenance[]>> {
    const uniqueIds = [...new Set(ipoIds)];
    const rows: SelectedFieldSourceRow[] = [];

    for (const ids of chunk(uniqueIds, FIELD_SOURCE_BATCH_SIZE)) {
      const placeholders = ids.map(() => "?").join(", ");
      rows.push(...await this.all<SelectedFieldSourceRow>(
        "selected IPO field provenance",
        `${SELECTED_FIELD_SOURCE_QUERY} AND p.ipo_id IN (${placeholders}) ORDER BY p.ipo_id, p.priority DESC, p.fetched_at DESC`,
        ids,
      ));
    }

    const grouped = new Map<string, SelectedFieldProvenance[]>();
    for (const row of rows) {
      const ipoId = requiredString(row.ipo_id, "field provenance", "ipo_id");
      const fetchedAt = requiredTimestamp(row.fetched_at, row.field_source_id, "fetched_at");
      const verifiedAt = isoTimestamp(row.verified_at);
      const source = mapSource(row, "", optionalString(row.source_url), fetchedAt);
      if (!source) throw new DatabaseRecordSerializationError(row.field_source_id, "source");
      if (verifiedAt) source.verifiedAt = verifiedAt;
      const confidence = optionalNumber(row.confidence);
      if (confidence !== undefined) source.confidence = confidence;

      const provenance: SelectedFieldProvenance = {
        fieldName: requiredString(row.field_name, row.field_source_id, "field_name"),
        source,
        priority: requiredNumber(row.priority, row.field_source_id, "priority"),
        fetchedAt,
        sourceKind: requiredString(row.source_kind, row.field_source_id, "source_kind"),
        authorityLevel: requiredString(row.authority_level, row.field_source_id, "authority_level"),
        isOfficial: booleanValue(row.is_official),
        ...(optionalString(row.normalized_value) ? { normalizedValue: optionalString(row.normalized_value) } : {}),
        ...(verifiedAt ? { verifiedAt } : {}),
        ...(confidence !== undefined ? { confidence } : {}),
      };
      const existing = grouped.get(ipoId) ?? [];
      existing.push(provenance);
      grouped.set(ipoId, existing);
    }
    return grouped;
  }

  private mapIPO(row: BaseIPORow, fieldSources: SelectedFieldProvenance[]): IPO {
    const id = requiredString(row.ipo_id, "IPO", "id");
    const slug = requiredString(row.ipo_slug, id, "slug");
    const companyId = requiredString(row.company_id, id, "company_id");
    const updatedAt = requiredTimestamp(row.ipo_updated_at, id, "updated_at");
    const latestFilingUpdatedAt = isoTimestamp(row.latest_filing_fetched_at);
    const latestFilingSource = mapSource(
      row,
      "latest_filing_",
      optionalString(row.latest_filing_source_url) ?? optionalString(row.latest_filing_document_url),
      latestFilingUpdatedAt,
    );
    const primarySource = fieldSources[0]?.source
      ?? latestFilingSource
      ?? fallbackSource(id, updatedAt);
    const companySource = fieldSources.find((item) => [
      "company",
      "companyName",
      "company_name",
      "legalName",
      "legal_name",
      "summary",
      "overview",
    ].includes(item.fieldName))?.source ?? primarySource;
    const registrarSource = fieldSources.find((item) => [
      "registrar",
      "registrarName",
      "registrar_name",
      "registrarUrl",
      "registrar_url",
    ].includes(item.fieldName))?.source ?? primarySource;

    const board = optionalString(row.board);
    const type: IPO["type"] = board === "MAINBOARD" ? "mainboard" : board === "SME" ? "sme" : "unknown";
    const priceBandMax = optionalNumber(row.price_band_max);
    const gmp = optionalNumber(row.latest_gmp);
    const storedEstimatedListingPrice = optionalNumber(row.latest_estimated_listing_price);
    const calculatedGMP = gmp === undefined ? undefined : calculateGMP(priceBandMax, gmp);
    const issuePrice = optionalNumber(row.ipo_issue_price) ?? optionalNumber(row.latest_listing_issue_price);
    const listingPrice = optionalNumber(row.latest_listing_open);
    const listingGainPercent = optionalNumber(row.latest_listing_gain_percent)
      ?? percentageReturn(issuePrice, listingPrice);
    const statusField = fieldSources.find((item) => item.fieldName === "status");
    const explicitStatus = authoritativeExplicitStatus(statusField ? {
      status: statusField.normalizedValue,
      sourceKind: statusField.sourceKind,
      authorityLevel: statusField.authorityLevel,
      isOfficial: statusField.isOfficial,
      verifiedAt: statusField.verifiedAt,
    } : undefined);
    const status = calculateIPOStatus({
      hasDRHP: booleanValue(row.has_drhp),
      hasRHP: booleanValue(row.has_rhp),
      openDate: optionalString(row.open_date),
      closeDate: optionalString(row.close_date),
      allotmentDate: optionalString(row.allotment_date),
      listingDate: optionalString(row.listing_date),
      explicitStatus,
    }, this.now());
    const gmpObservedAt = isoTimestamp(row.latest_gmp_observed_at);
    const gmpFetchedAt = isoTimestamp(row.latest_gmp_fetched_at);
    const latestFilingType = documentType(row.latest_filing_type);
    const registrarName = optionalString(row.registrar_name);
    const registrarUrl = optionalString(row.registrar_url);

    return {
      id,
      slug,
      companyId,
      company: {
        id: companyId,
        name: requiredString(row.company_name, companyId, "display_name"),
        legalName: optionalString(row.company_legal_name) ?? requiredString(row.company_name, companyId, "display_name"),
        slug: requiredString(row.company_slug, companyId, "slug"),
        ...(optionalString(row.company_industry) ? { industry: optionalString(row.company_industry) } : {}),
        ...(optionalString(row.company_sector) ? { sector: optionalString(row.company_sector) } : {}),
        ...(optionalString(row.company_headquarters) ? { headquarters: optionalString(row.company_headquarters) } : {}),
        ...(optionalString(row.company_website_url) ? { website: optionalString(row.company_website_url) } : {}),
        ...(optionalString(row.company_summary) ? { overview: optionalString(row.company_summary) } : {}),
        promoters: [],
        keyProducts: [],
        strengths: [],
        risks: [],
        source: companySource,
      },
      type,
      exchange: exchangeArray(row.exchanges_json),
      status,
      ...(optionalNumber(row.face_value) !== undefined ? { faceValue: optionalNumber(row.face_value) } : {}),
      ...(optionalNumber(row.price_band_min) !== undefined ? { priceBandMin: optionalNumber(row.price_band_min) } : {}),
      ...(priceBandMax !== undefined ? { priceBandMax } : {}),
      ...(optionalNumber(row.lot_size) !== undefined ? { lotSize: optionalNumber(row.lot_size) } : {}),
      ...(optionalNumber(row.issue_size_cr) !== undefined ? { issueSizeCr: optionalNumber(row.issue_size_cr) } : {}),
      ...(optionalNumber(row.fresh_issue_cr) !== undefined ? { freshIssueCr: optionalNumber(row.fresh_issue_cr) } : {}),
      ...(optionalNumber(row.offer_for_sale_cr) !== undefined ? { offerForSaleCr: optionalNumber(row.offer_for_sale_cr) } : {}),
      ...(optionalNumber(row.employee_reservation_cr) !== undefined ? { employeeReservationCr: optionalNumber(row.employee_reservation_cr) } : {}),
      ...(optionalNumber(row.shareholder_reservation_cr) !== undefined ? { shareholderReservationCr: optionalNumber(row.shareholder_reservation_cr) } : {}),
      ...(optionalString(row.open_date) ? { openDate: optionalString(row.open_date) } : {}),
      ...(optionalString(row.close_date) ? { closeDate: optionalString(row.close_date) } : {}),
      ...(optionalString(row.allotment_date) ? { allotmentDate: optionalString(row.allotment_date) } : {}),
      ...(optionalString(row.demat_date) ? { dematDate: optionalString(row.demat_date) } : {}),
      ...(optionalString(row.refund_date) ? { refundDate: optionalString(row.refund_date) } : {}),
      ...(optionalString(row.listing_date) ? { listingDate: optionalString(row.listing_date) } : {}),
      ...(listingPrice !== undefined ? { listingPrice } : {}),
      ...(issuePrice !== undefined ? { issuePrice } : {}),
      ...(calculatedGMP?.estimatedListingPrice !== undefined
        ? { estimatedListingPrice: calculatedGMP.estimatedListingPrice }
        : storedEstimatedListingPrice !== undefined
          ? { estimatedListingPrice: storedEstimatedListingPrice }
          : {}),
      ...(listingGainPercent !== undefined ? { listingGainPercent } : {}),
      ...(registrarName && registrarUrl ? {
        registrar: {
          id: `registrar:${id}`,
          name: registrarName,
          website: registrarUrl,
          source: registrarSource,
        },
      } : {}),
      leadManagers: stringArray(row.lead_managers_json),
      ...(gmp !== undefined ? { gmp } : {}),
      ...(gmpObservedAt ? { gmpUpdatedAt: gmpObservedAt } : {}),
      ...(optionalNumber(row.latest_subscription_total) !== undefined
        ? { subscriptionTotal: optionalNumber(row.latest_subscription_total) }
        : {}),
      source: primarySource,
      ...(fieldSources.length ? {
        fieldSources: fieldSources.map((field): FieldProvenance => ({
          fieldName: field.fieldName,
          source: field.source,
          priority: field.priority,
          fetchedAt: field.fetchedAt,
          ...(field.verifiedAt ? { verifiedAt: field.verifiedAt } : {}),
          ...(field.confidence !== undefined ? { confidence: field.confidence } : {}),
        })),
      } : {}),
      ...(gmpFetchedAt ?? primarySource.fetchedAt ? { fetchedAt: gmpFetchedAt ?? primarySource.fetchedAt } : {}),
      updatedAt,
      dataMode: "live",
      mockDisclaimer: false,
      ...(optionalString(row.latest_filing_date) ? { latestFilingDate: optionalString(row.latest_filing_date) } : {}),
      ...(latestFilingType ? { latestFilingType } : {}),
      ...(optionalString(row.latest_filing_document_url)
        ? { latestDocumentUrl: optionalString(row.latest_filing_document_url) }
        : {}),
      ...(row.latest_filing_id
        ? { latestDocumentAvailability: documentAvailability(row.latest_filing_availability_status) }
        : {}),
    };
  }

  async getIPOs(filters: IPOFilters = {}, sort: IPOSort = "newest"): Promise<IPO[]> {
    const rows = await this.all<BaseIPORow>("IPO list", `${IPO_BASE_QUERY} ORDER BY i.updated_at DESC, i.id`);
    const provenance = await this.selectedFieldSources(rows.map((row) => row.ipo_id));
    const ipos = rows.map((row) => this.mapIPO(row, provenance.get(row.ipo_id) ?? []));
    return sortIPOs(ipos.filter((ipo) => statusFilter(ipo, filters)), sort);
  }

  async getIPOBySlug(slug: string): Promise<IPO | null> {
    const rows = await this.all<BaseIPORow>(
      "IPO by slug",
      `${IPO_BASE_QUERY} WHERE i.slug = ? LIMIT 1`,
      [slug],
    );
    const row = rows[0];
    if (!row) return null;
    const provenance = await this.selectedFieldSources([row.ipo_id]);
    return this.mapIPO(row, provenance.get(row.ipo_id) ?? []);
  }

  async getIPOFinancials(ipoId: string): Promise<IPOFinancial[]> {
    const rows = await this.all<UnknownRow>(
      "IPO financials",
      `SELECT
        f.id, f.ipo_id, f.fiscal_period, f.revenue, f.ebitda, f.pat,
        f.total_assets, f.net_worth, f.total_debt, f.operating_cash_flow,
        f.verified_at, f.created_at, f.updated_at,
        d.document_url,
        s.id AS source_id, s.name AS source_name, s.source_kind, s.authority_level,
        s.homepage_url, s.base_url, s.is_official,
        s.last_fetched_at AS source_last_fetched_at,
        s.last_successful_at AS source_last_successful_at,
        s.updated_at AS source_updated_at
      FROM ipo_financials f
      INNER JOIN data_sources s ON s.id = f.source_id
      LEFT JOIN ipo_documents d ON d.id = f.document_id
      WHERE f.ipo_id = ? AND f.period_type = 'FY'
      ORDER BY f.period_end, f.fiscal_period, f.id`,
      [ipoId],
    );

    const financials = rows.flatMap((row): IPOFinancial[] => {
      const fiscalYear = normalizeFiscalYear(row.fiscal_period);
      if (!fiscalYear) return [];
      const id = requiredString(row.id, "IPO financial", "id");
      const updatedAt = requiredTimestamp(row.updated_at, id, "updated_at");
      const source = mapSource(row, "", optionalString(row.document_url), updatedAt);
      if (!source) throw new DatabaseRecordSerializationError(id, "source");
      const verifiedAt = isoTimestamp(row.verified_at);
      if (verifiedAt) source.verifiedAt = verifiedAt;

      const revenueCr = optionalNumber(row.revenue);
      const ebitdaCr = optionalNumber(row.ebitda);
      const patCr = optionalNumber(row.pat);
      return [{
        id,
        ipoId: requiredString(row.ipo_id, id, "ipo_id"),
        fiscalYear,
        ...(revenueCr !== undefined ? { revenueCr } : {}),
        ...(ebitdaCr !== undefined ? { ebitdaCr } : {}),
        ...(revenueCr && ebitdaCr !== undefined ? { ebitdaMarginPercent: (ebitdaCr / revenueCr) * 100 } : {}),
        ...(patCr !== undefined ? { patCr } : {}),
        ...(revenueCr && patCr !== undefined ? { patMarginPercent: (patCr / revenueCr) * 100 } : {}),
        ...(optionalNumber(row.total_assets) !== undefined ? { totalAssetsCr: optionalNumber(row.total_assets) } : {}),
        ...(optionalNumber(row.net_worth) !== undefined ? { netWorthCr: optionalNumber(row.net_worth) } : {}),
        ...(optionalNumber(row.total_debt) !== undefined ? { totalDebtCr: optionalNumber(row.total_debt) } : {}),
        ...(optionalNumber(row.operating_cash_flow) !== undefined
          ? { operatingCashFlowCr: optionalNumber(row.operating_cash_flow) }
          : {}),
        ...(optionalNumber(row.net_worth) && optionalNumber(row.total_debt) !== undefined
          ? { debtToEquity: optionalNumber(row.total_debt)! / optionalNumber(row.net_worth)! }
          : {}),
        source,
      }];
    });

    for (let index = 1; index < financials.length; index += 1) {
      const previous = financials[index - 1].revenueCr;
      const current = financials[index].revenueCr;
      if (previous && current !== undefined) {
        financials[index].revenueGrowthPercent = ((current - previous) / previous) * 100;
      }
    }
    return financials;
  }

  async getSubscriptions(ipoId: string): Promise<IPOSubscription[]> {
    const rows = await this.all<UnknownRow>(
      "IPO subscription history",
      `WITH latest_days AS (
        SELECT ranked.*
        FROM (
          SELECT p.*,
            ROW_NUMBER() OVER (
              PARTITION BY p.ipo_id, p.day_number ORDER BY p.observed_at DESC, p.id DESC
            ) AS row_number
          FROM ipo_subscription_snapshots p
          WHERE p.ipo_id = ? AND p.day_number IS NOT NULL AND p.total IS NOT NULL
        ) ranked
        WHERE ranked.row_number = 1
      )
      SELECT
        p.id, p.ipo_id, p.day_number, p.qib, p.nii, p.bnii, p.snii,
        p.retail, p.employee, p.shareholder, p.total, p.source_url,
        p.observed_at, p.fetched_at,
        s.id AS source_id, s.name AS source_name, s.source_kind, s.authority_level,
        s.homepage_url, s.base_url, s.is_official,
        s.last_fetched_at AS source_last_fetched_at,
        s.last_successful_at AS source_last_successful_at,
        s.updated_at AS source_updated_at
      FROM latest_days p
      INNER JOIN data_sources s ON s.id = p.source_id
      ORDER BY p.day_number, p.observed_at, p.id`,
      [ipoId],
    );
    return rows.map((row) => {
      const id = requiredString(row.id, "IPO subscription", "id");
      const observedAt = requiredTimestamp(row.observed_at, id, "observed_at");
      const fetchedAt = requiredTimestamp(row.fetched_at, id, "fetched_at");
      const source = mapSource(row, "", optionalString(row.source_url), fetchedAt);
      if (!source) throw new DatabaseRecordSerializationError(id, "source");
      return {
        id,
        ipoId: requiredString(row.ipo_id, id, "ipo_id"),
        asOfDate: observedAt,
        day: requiredNumber(row.day_number, id, "day_number"),
        ...(optionalNumber(row.qib) !== undefined ? { qib: optionalNumber(row.qib) } : {}),
        ...(optionalNumber(row.nii) !== undefined ? { nii: optionalNumber(row.nii) } : {}),
        ...(optionalNumber(row.bnii) !== undefined ? { bnii: optionalNumber(row.bnii) } : {}),
        ...(optionalNumber(row.snii) !== undefined ? { snii: optionalNumber(row.snii) } : {}),
        ...(optionalNumber(row.retail) !== undefined ? { retail: optionalNumber(row.retail) } : {}),
        ...(optionalNumber(row.employee) !== undefined ? { employee: optionalNumber(row.employee) } : {}),
        ...(optionalNumber(row.shareholder) !== undefined ? { shareholder: optionalNumber(row.shareholder) } : {}),
        total: requiredNumber(row.total, id, "total"),
        source,
        fetchedAt,
      };
    });
  }

  async getGMPHistory(ipoId: string): Promise<IPOGMPRecord[]> {
    const rows = await this.all<UnknownRow>(
      "IPO GMP history",
      `SELECT
        g.id, g.ipo_id, g.gmp, g.upper_price_band, g.estimated_listing_price,
        g.gmp_percent, g.source_url, g.observed_at, g.fetched_at,
        s.id AS source_id, s.name AS source_name, s.source_kind, s.authority_level,
        s.homepage_url, s.base_url, s.is_official,
        s.last_fetched_at AS source_last_fetched_at,
        s.last_successful_at AS source_last_successful_at,
        s.updated_at AS source_updated_at
      FROM ipo_gmp_history g
      INNER JOIN data_sources s ON s.id = g.source_id
      WHERE g.ipo_id = ? AND g.is_valid = 1
      ORDER BY g.observed_at, g.id`,
      [ipoId],
    );
    return rows.map((row) => {
      const id = requiredString(row.id, "IPO GMP", "id");
      const observedAt = requiredTimestamp(row.observed_at, id, "observed_at");
      const fetchedAt = requiredTimestamp(row.fetched_at, id, "fetched_at");
      const source = mapSource(row, "", optionalString(row.source_url), fetchedAt);
      if (!source) throw new DatabaseRecordSerializationError(id, "source");
      const gmp = requiredNumber(row.gmp, id, "gmp");
      const calculated = calculateGMP(optionalNumber(row.upper_price_band), gmp);
      const storedEstimatedListingPrice = optionalNumber(row.estimated_listing_price);
      const storedGmpPercent = optionalNumber(row.gmp_percent);
      return {
        id,
        ipoId: requiredString(row.ipo_id, id, "ipo_id"),
        date: observedAt,
        gmp,
        ...(calculated.estimatedListingPrice !== undefined
          ? { estimatedListingPrice: calculated.estimatedListingPrice }
          : storedEstimatedListingPrice !== undefined
            ? { estimatedListingPrice: storedEstimatedListingPrice }
            : {}),
        ...(calculated.gmpPercent !== undefined
          ? { gmpPercent: calculated.gmpPercent }
          : storedGmpPercent !== undefined
            ? { gmpPercent: storedGmpPercent }
            : {}),
        source,
        fetchedAt,
      };
    });
  }

  async getDocuments(ipoId?: string): Promise<IPODocument[]> {
    const rows = await this.all<UnknownRow>(
      "IPO documents",
      `${IPO_DOCUMENT_QUERY}${ipoId ? " WHERE d.ipo_id = ?" : ""}
       ORDER BY COALESCE(d.filing_date, '0000-00-00') DESC, d.fetched_at DESC, d.id`,
      ipoId ? [ipoId] : [],
    );
    return rows.map((row) => {
      const id = requiredString(row.id, "IPO document", "id");
      const fetchedAt = requiredTimestamp(row.fetched_at, id, "fetched_at");
      const source = mapSource(row, "", optionalString(row.source_url), fetchedAt);
      const type = documentType(row.document_type);
      if (!source) throw new DatabaseRecordSerializationError(id, "source");
      if (!type) throw new DatabaseRecordSerializationError(id, "document_type");
      return {
        id,
        ipoId: requiredString(row.ipo_id, id, "ipo_id"),
        type,
        title: requiredString(row.title, id, "title"),
        publishedAt: optionalString(row.filing_date) ?? "",
        url: requiredString(row.document_url, id, "document_url"),
        availability: documentAvailability(row.availability_status),
        ...(isoTimestamp(row.availability_checked_at)
          ? { checkedAt: isoTimestamp(row.availability_checked_at) }
          : {}),
        ...(optionalNumber(row.availability_http_status) !== undefined
          ? { httpStatus: optionalNumber(row.availability_http_status) }
          : {}),
        source,
      };
    });
  }

  async getIPOEvents(ipoId?: string): Promise<IPOEvent[]> {
    const ipoRows = await this.all<BaseIPORow>(
      "IPO calendar records",
      `${IPO_BASE_QUERY}${ipoId ? " WHERE i.id = ?" : ""} ORDER BY i.id`,
      ipoId ? [ipoId] : [],
    );
    if (!ipoRows.length) return [];
    const provenance = await this.selectedFieldSources(ipoRows.map((row) => row.ipo_id));
    const ipos = ipoRows.map((row) => this.mapIPO(row, provenance.get(row.ipo_id) ?? []));
    const documents = await this.getDocuments(ipoId);
    const events = new Map<string, IPOEvent>();

    const dateFields: Array<{ field: keyof IPO; type: EventType; aliases: string[] }> = [
      { field: "openDate", type: "ipo_open", aliases: ["openDate", "open_date"] },
      { field: "closeDate", type: "ipo_close", aliases: ["closeDate", "close_date"] },
      { field: "allotmentDate", type: "basis_of_allotment", aliases: ["allotmentDate", "allotment_date"] },
      { field: "refundDate", type: "refund", aliases: ["refundDate", "refund_date"] },
      { field: "dematDate", type: "demat_credit", aliases: ["dematDate", "demat_date"] },
      { field: "listingDate", type: "listing", aliases: ["listingDate", "listing_date"] },
    ];

    for (const ipo of ipos) {
      const fields = provenance.get(ipo.id) ?? [];
      const row = ipoRows.find((candidate) => candidate.ipo_id === ipo.id);
      const anchorDate = optionalString(row?.anchor_date);
      const dates = [
        ...dateFields.map((definition) => ({
          ...definition,
          date: optionalString(ipo[definition.field]),
        })),
        {
          field: "anchorDate" as keyof IPO,
          type: "anchor_allocation" as EventType,
          aliases: ["anchorDate", "anchor_date"],
          date: anchorDate,
        },
      ];
      for (const definition of dates) {
        if (!definition.date) continue;
        const source = fields.find((item) => definition.aliases.includes(item.fieldName))?.source ?? ipo.source;
        const key = `${ipo.id}:${definition.type}:${definition.date}`;
        events.set(key, {
          id: `event:${key}`,
          ipoId: ipo.id,
          type: definition.type,
          label: EVENT_LABELS[definition.type],
          date: definition.date,
          state: eventState(definition.date, this.now()),
          source,
        });
      }
    }

    for (const document of documents) {
      if (!document.publishedAt) continue;
      const rawDocument = String(document.type).toUpperCase();
      const schemaDocumentType = Object.entries(DOCUMENT_TYPE_MAP)
        .find(([, mapped]) => mapped === document.type)?.[0] ?? rawDocument;
      const type = DOCUMENT_EVENT_MAP[schemaDocumentType];
      if (!type) continue;
      const key = `${document.ipoId}:${type}:${document.publishedAt}`;
      events.set(key, {
        id: `event:${document.id}`,
        ipoId: document.ipoId,
        type,
        label: EVENT_LABELS[type],
        date: document.publishedAt,
        state: eventState(document.publishedAt, this.now()),
        note: document.title,
        source: document.source,
      });
    }

    return [...events.values()].sort((left, right) =>
      left.date.localeCompare(right.date) || left.type.localeCompare(right.type));
  }

  async getMarketIndices(): Promise<MarketIndex[]> {
    const rows = await this.all<UnknownRow>(
      "market index quotes",
      `WITH latest_quotes AS (
        SELECT ranked.*
        FROM (
          SELECT q.*,
            ROW_NUMBER() OVER (
              PARTITION BY q.market_index_id ORDER BY q.observed_at DESC, q.id DESC
            ) AS row_number
          FROM market_index_quotes q
        ) ranked
        WHERE ranked.row_number = 1
      )
      SELECT
        i.id, i.name, i.symbol,
        q.value, q.change, q.change_percent, q.quote_mode, q.delay_minutes,
        q.observed_at, q.fetched_at,
        s.id AS source_id, s.name AS source_name, s.source_kind, s.authority_level,
        s.homepage_url, s.base_url, s.is_official,
        s.last_fetched_at AS source_last_fetched_at,
        s.last_successful_at AS source_last_successful_at,
        s.updated_at AS source_updated_at
      FROM market_indices i
      INNER JOIN latest_quotes q ON q.market_index_id = i.id
      INNER JOIN data_sources s ON s.id = q.source_id
      WHERE i.is_active = 1
      ORDER BY CASE i.name
        WHEN 'NIFTY 50' THEN 1
        WHEN 'SENSEX' THEN 2
        WHEN 'BANK NIFTY' THEN 3
        WHEN 'INDIA VIX' THEN 4
        ELSE 5
      END, i.name`,
    );
    return rows.flatMap((row): MarketIndex[] => {
      const id = requiredString(row.id, "market index", "id");
      const value = optionalNumber(row.value);
      const change = optionalNumber(row.change);
      const changePercent = optionalNumber(row.change_percent);
      if (value === undefined || change === undefined || changePercent === undefined) return [];
      const observedAt = requiredTimestamp(row.observed_at, id, "observed_at");
      const fetchedAt = requiredTimestamp(row.fetched_at, id, "fetched_at");
      const source = mapSource(row, "", undefined, fetchedAt);
      if (!source) throw new DatabaseRecordSerializationError(id, "source");
      return [{
        id,
        name: requiredString(row.name, id, "name"),
        value,
        change,
        changePercent,
        asOf: observedAt,
        source,
        timeliness: quoteMode(row.quote_mode),
        ...(optionalNumber(row.delay_minutes) !== undefined
          ? { delayMinutes: optionalNumber(row.delay_minutes) }
          : {}),
        mockDisclaimer: false,
      }];
    });
  }

  async getNews(filters: NewsFilters = {}): Promise<NewsArticle[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filters.ipoId) {
      clauses.push("EXISTS (SELECT 1 FROM news_ipos ni_filter WHERE ni_filter.news_id = n.id AND ni_filter.ipo_id = ?)");
      params.push(filters.ipoId);
    }
    if (filters.companyId) {
      clauses.push("EXISTS (SELECT 1 FROM news_companies nc_filter WHERE nc_filter.news_id = n.id AND nc_filter.company_id = ?)");
      params.push(filters.companyId);
    }
    if (filters.category) {
      clauses.push("n.category = ?");
      params.push(filters.category.toUpperCase());
    }
    const limit = filters.limit === undefined
      ? undefined
      : Math.max(0, Math.min(500, Math.floor(filters.limit)));
    if (limit === 0) return [];
    if (limit !== undefined) params.push(limit);

    const rows = await this.all<UnknownRow>(
      "news feed",
      `SELECT
        n.id, n.headline, n.summary, n.publisher, n.category,
        n.canonical_url, n.image_url, n.published_at, n.fetched_at,
        (SELECT ni.ipo_id FROM news_ipos ni WHERE ni.news_id = n.id ORDER BY ni.ipo_id LIMIT 1) AS ipo_id,
        (SELECT nc.company_id FROM news_companies nc WHERE nc.news_id = n.id ORDER BY nc.company_id LIMIT 1) AS company_id,
        s.id AS source_id, s.name AS source_name, s.source_kind, s.authority_level,
        s.homepage_url, s.base_url, s.is_official,
        s.last_fetched_at AS source_last_fetched_at,
        s.last_successful_at AS source_last_successful_at,
        s.updated_at AS source_updated_at
      FROM news_articles n
      INNER JOIN data_sources s ON s.id = n.source_id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY n.published_at DESC, n.id
      ${limit !== undefined ? "LIMIT ?" : ""}`,
      params,
    );
    return rows.map((row) => {
      const id = requiredString(row.id, "news article", "id");
      const fetchedAt = requiredTimestamp(row.fetched_at, id, "fetched_at");
      const url = requiredString(row.canonical_url, id, "canonical_url");
      const source = mapSource(row, "", url, fetchedAt);
      if (!source) throw new DatabaseRecordSerializationError(id, "source");
      source.sourceName = optionalString(row.publisher) ?? source.sourceName;
      const headline = requiredString(row.headline, id, "headline");
      return {
        id,
        headline,
        slug: `${slugify(headline)}-${id.slice(0, 8)}`,
        summary: optionalString(row.summary) ?? "",
        category: newsCategory(row.category, id),
        ...(optionalString(row.company_id) ? { companyId: optionalString(row.company_id) } : {}),
        ...(optionalString(row.ipo_id) ? { ipoId: optionalString(row.ipo_id) } : {}),
        publishedAt: requiredTimestamp(row.published_at, id, "published_at"),
        source,
        url,
        ...(optionalString(row.image_url) ? { imageUrl: optionalString(row.image_url) } : {}),
      };
    });
  }

  async getProviderStatuses(sourceKinds: readonly string[] = []): Promise<ProviderStatus[]> {
    const clauses = sourceKinds.length ? `WHERE s.source_kind IN (${sourceKinds.map(() => "?").join(", ")})` : "";
    const rows = await this.all<UnknownRow>(
      "provider statuses",
      `SELECT
        s.id AS source_id, s.name AS source_name, s.attribution_label,
        s.source_kind, s.is_active, s.last_successful_at AS source_last_successful_at,
        s.updated_at AS source_updated_at,
        p.health, p.last_attempt_at, p.last_successful_at,
        p.last_error_message, p.records_synced, p.updated_at
      FROM data_sources s
      LEFT JOIN provider_status p ON p.source_id = s.id
      ${clauses}
      ORDER BY s.name`,
      sourceKinds,
    );
    return rows.map((row) => {
      const id = requiredString(row.source_id, "provider status", "source_id");
      const health = optionalString(row.health);
      const status: ProviderStatus["status"] = !booleanValue(row.is_active)
        ? "unconfigured"
        : health === "HEALTHY"
          ? "healthy"
          : health === "DEGRADED"
            ? "degraded"
            : health === "OFFLINE"
              ? "offline"
              : row.last_attempt_at == null
                ? "unconfigured"
                : "degraded";
      const updatedAt = requiredTimestamp(
        row.updated_at ?? row.source_updated_at,
        id,
        "updated_at",
      );
      const lastSuccessfulFetch = isoTimestamp(row.last_successful_at ?? row.source_last_successful_at);
      return {
        provider: optionalString(row.attribution_label) ?? requiredString(row.source_name, id, "source_name"),
        status,
        ...(lastSuccessfulFetch ? { lastSuccessfulFetch } : {}),
        ...(optionalString(row.last_error_message) ? { lastError: optionalString(row.last_error_message) } : {}),
        recordsSynced: optionalNumber(row.records_synced) ?? 0,
        updatedAt,
      };
    });
  }

  async getRecentIngestionRuns(limit = 25): Promise<DatabaseIngestionRunSummary[]> {
    const rows = await this.all<UnknownRow>(
      "recent ingestion runs",
      `SELECT
        r.id, r.provider_key, r.job_type, r.trigger, r.status,
        r.started_at, r.finished_at, r.records_fetched, r.records_created,
        r.records_updated, r.records_skipped, r.error_count, r.error_summary,
        s.name AS source_name
      FROM ingestion_runs r
      LEFT JOIN data_sources s ON s.id = r.source_id
      ORDER BY r.started_at DESC, r.id
      LIMIT ?`,
      [boundedLimit(limit)],
    );
    return rows.map((row) => {
      const id = requiredString(row.id, "ingestion run", "id");
      const finishedAt = isoTimestamp(row.finished_at);
      return {
        id,
        provider: optionalString(row.source_name)
          ?? requiredString(row.provider_key, id, "provider_key"),
        jobType: requiredString(row.job_type, id, "job_type"),
        trigger: requiredString(row.trigger, id, "trigger"),
        status: requiredString(row.status, id, "status"),
        startedAt: requiredTimestamp(row.started_at, id, "started_at"),
        ...(finishedAt ? { finishedAt } : {}),
        recordsFetched: optionalNumber(row.records_fetched) ?? 0,
        recordsCreated: optionalNumber(row.records_created) ?? 0,
        recordsUpdated: optionalNumber(row.records_updated) ?? 0,
        recordsSkipped: optionalNumber(row.records_skipped) ?? 0,
        errorCount: optionalNumber(row.error_count) ?? 0,
        ...(optionalString(row.error_summary) ? { errorSummary: optionalString(row.error_summary) } : {}),
      };
    });
  }

  async getRecentErrors(limit = 25): Promise<DatabaseIngestionErrorSummary[]> {
    const rows = await this.all<UnknownRow>(
      "recent ingestion errors",
      `SELECT
        e.id, e.operation, e.entity_type, e.entity_id, e.raw_identifier,
        e.error_code, e.error_message, e.is_retryable, e.retry_count,
        e.resolved_at, e.created_at,
        s.name AS source_name,
        r.provider_key
      FROM ingestion_errors e
      LEFT JOIN data_sources s ON s.id = e.source_id
      LEFT JOIN ingestion_runs r ON r.id = e.ingestion_run_id
      ORDER BY e.created_at DESC, e.id
      LIMIT ?`,
      [boundedLimit(limit)],
    );
    return rows.map((row) => {
      const id = requiredString(row.id, "ingestion error", "id");
      const resolvedAt = isoTimestamp(row.resolved_at);
      return {
        id,
        provider: optionalString(row.source_name)
          ?? optionalString(row.provider_key)
          ?? "Unknown provider",
        operation: requiredString(row.operation, id, "operation"),
        ...(optionalString(row.entity_type) ? { entityType: optionalString(row.entity_type) } : {}),
        ...(optionalString(row.entity_id) ? { entityId: optionalString(row.entity_id) } : {}),
        ...(optionalString(row.raw_identifier) ? { rawIdentifier: optionalString(row.raw_identifier) } : {}),
        ...(optionalString(row.error_code) ? { errorCode: optionalString(row.error_code) } : {}),
        errorMessage: requiredString(row.error_message, id, "error_message"),
        isRetryable: booleanValue(row.is_retryable),
        retryCount: optionalNumber(row.retry_count) ?? 0,
        ...(resolvedAt ? { resolvedAt } : {}),
        createdAt: requiredTimestamp(row.created_at, id, "created_at"),
      };
    });
  }
}
