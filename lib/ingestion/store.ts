import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
} from "drizzle-orm";

import { assertD1SchemaReady, getD1, getDb } from "@/db";
import {
  companies,
  companyAliases,
  dataConflicts,
  dataSources,
  ingestionErrors,
  ingestionRuns,
  ipoDocuments,
  ipoExternalIdentifiers,
  ipoFieldSources,
  ipoGmpHistory,
  ipoListingPerformance,
  ipos,
  ipoSubscriptionSnapshots,
  marketIndexQuotes,
  marketIndices,
  newsArticles,
  newsCompanies,
  newsIpos,
  providerStatus,
  rawProviderRecords,
} from "@/db/schema";
import type {
  NormalizedFiling,
  NormalizedGMPRecord,
  NormalizedMarketIndex,
  NormalizedNewsRecord,
  NormalizedSubscriptionSnapshot,
  StructuredIPORecord,
} from "@/lib/ingestion/schemas";
import type { NormalizedListingData } from "@/lib/providers/ipo";
import {
  DOCUMENT_AVAILABILITY_CHECK_LIMIT,
  DOCUMENT_AVAILABILITY_TTL_MS,
  type DocumentAvailabilityResult,
} from "@/lib/providers/nse/document-availability";

import { calculateGMP, percentageReturn } from "./calculations";
import { ProviderError, errorMessage } from "./errors";
import { logIngestion } from "./logger";
import { normalizeCompanyName, slugifyCompany, stableId } from "./normalize";
import { authoritativeExplicitStatus, calculateIPOStatus } from "./status";

type SourceKind = typeof dataSources.$inferInsert.sourceKind;
type AuthorityLevel = typeof dataSources.$inferInsert.authorityLevel;
type RunTrigger = typeof ingestionRuns.$inferInsert.trigger;
type RunStatus = typeof ingestionRuns.$inferInsert.status;
type ValueType = typeof ipoFieldSources.$inferInsert.valueType;
type IpoLifecycleStatus = NonNullable<typeof ipos.$inferInsert.status>;
type IpoMutation = Partial<typeof ipos.$inferInsert>;

export type SourceDefinition = {
  key: string;
  name: string;
  sourceKind: SourceKind;
  authorityLevel: AuthorityLevel;
  attributionLabel?: string;
  homepageUrl?: string;
  baseUrl?: string;
  termsUrl?: string;
  isOfficial: boolean;
  metadata?: Record<string, unknown>;
};

export type RunCounters = {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
};

export function emptyRunCounters(): RunCounters {
  return { fetched: 0, created: 0, updated: 0, skipped: 0, errors: 0 };
}

export type IngestionRunContext = {
  id: string;
  sourceId: string;
  providerKey: string;
  jobType: string;
  trigger: RunTrigger;
  startedAt: Date;
  source: typeof dataSources.$inferSelect;
};

export type IngestOutcome = "created" | "updated" | "skipped";

export type IpoSyncTarget = {
  ipoId: string;
  companyName: string;
  slug: string;
  status: IpoLifecycleStatus;
  openDate: string | null;
  closeDate: string | null;
  listingDate: string | null;
  lastSyncedAt: Date;
  identifier: string;
};

export type DocumentAvailabilityTarget = {
  id: string;
  documentUrl: string;
};

export type StoreOptions = {
  database?: D1Database;
  now?: () => Date;
};

type CompanyIdentity = {
  externalId?: string;
  cin?: string;
  isin?: string;
};

type FieldWrite = {
  fieldName: keyof IpoMutation & string;
  value: unknown;
  valueType: ValueType;
  priority: number;
  confidence?: number;
  sourceUrl?: string;
  observedAt?: Date;
  fetchedAt: Date;
  rawRecordId?: string;
};

const activeStatuses: IpoLifecycleStatus[] = [
  "DRHP_FILED",
  "RHP_FILED",
  "UPCOMING",
  "OPEN",
  "CLOSED",
  "ALLOTMENT_PENDING",
  "ALLOTMENT_COMPLETE",
  "LISTING_UPCOMING",
];

const documentTypeMap: Record<NormalizedFiling["filingType"], typeof ipoDocuments.$inferInsert.documentType> = {
  drhp: "DRHP",
  updated_drhp: "UPDATED_DRHP",
  rhp: "RHP",
  abridged_prospectus: "ABRIDGED_PROSPECTUS",
  corrigendum: "CORRIGENDUM",
  addendum: "ADDENDUM",
  prospectus: "FINAL_OFFER_DOCUMENT",
  final_offer_document: "FINAL_OFFER_DOCUMENT",
  other: "OTHER",
};

const statusMap = {
  drhp_filed: "DRHP_FILED",
  rhp_filed: "RHP_FILED",
  upcoming: "UPCOMING",
  open: "OPEN",
  closed: "CLOSED",
  allotment_pending: "ALLOTMENT_PENDING",
  allotment_complete: "ALLOTMENT_COMPLETE",
  listing_upcoming: "LISTING_UPCOMING",
  listed: "LISTED",
  withdrawn: "WITHDRAWN",
  deferred: "DEFERRED",
} as const satisfies Record<ReturnType<typeof calculateIPOStatus>, IpoLifecycleStatus>;

function dateOrUndefined(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function decimal(value: number | undefined): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function jsonSafe(value: unknown): unknown {
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, jsonSafe(child)]),
    );
  }
  return String(value);
}

function stableJSON(value: unknown): string {
  return JSON.stringify(jsonSafe(value));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizedFieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return stableJSON(value);
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof ProviderError) return error.status ? `HTTP_${error.status}` : "PROVIDER_ERROR";
  if (error instanceof Error) return error.name || "ERROR";
  return undefined;
}

function isRetryable(error: unknown): boolean {
  return error instanceof ProviderError ? error.retryable : false;
}

function resultCount(counters: RunCounters): number {
  return counters.created + counters.updated;
}

function newsCategory(category: NormalizedNewsRecord["category"]): typeof newsArticles.$inferInsert.category {
  if (category === "regulation") return "SEBI";
  if (category === "listing") return "IPO";
  return category.toUpperCase() as typeof newsArticles.$inferInsert.category;
}

function inferExchange(symbol: string): string {
  return /SENSEX/i.test(symbol) ? "BSE" : "NSE";
}

/**
 * D1 write boundary for every ingestion job. Provider payloads are normalized
 * before reaching this class; this layer owns identity, provenance, history,
 * conflicts, raw audit records, and run health.
 */
export class IngestionStore {
  private readonly database: D1Database;
  private readonly db: ReturnType<typeof getDb>;
  private readonly now: () => Date;

  constructor(options: StoreOptions = {}) {
    this.database = getD1(options.database);
    this.db = getDb(this.database);
    this.now = options.now ?? (() => new Date());
  }

  async assertReady(): Promise<void> {
    await assertD1SchemaReady(this.database);
  }

  async getSource(key: string) {
    return this.db.query.dataSources.findFirst({ where: eq(dataSources.key, key) });
  }

  async isSourceDue(key: string, intervalMinutes: number, now = this.now()): Promise<boolean> {
    const source = await this.getSource(key);
    if (!source?.lastFetchedAt) return true;
    return now.getTime() - source.lastFetchedAt.getTime() >= intervalMinutes * 60_000;
  }

  async isJobDue(
    sourceKey: string,
    jobType: string,
    intervalMinutes: number,
    excludeRunId?: string,
    now = this.now(),
  ): Promise<boolean> {
    const source = await this.getSource(sourceKey);
    if (!source) return true;
    const conditions = [
      eq(ingestionRuns.sourceId, source.id),
      eq(ingestionRuns.jobType, jobType),
      ne(ingestionRuns.status, "SKIPPED"),
      isNotNull(ingestionRuns.finishedAt),
    ];
    if (excludeRunId) conditions.push(ne(ingestionRuns.id, excludeRunId));
    const [latest] = await this.db.select({ finishedAt: ingestionRuns.finishedAt })
      .from(ingestionRuns)
      .where(and(...conditions))
      .orderBy(desc(ingestionRuns.finishedAt))
      .limit(1);
    if (!latest?.finishedAt) return true;
    return now.getTime() - latest.finishedAt.getTime() >= intervalMinutes * 60_000;
  }

  async upsertSource(definition: SourceDefinition) {
    const now = this.now();
    await this.db.insert(dataSources).values({
      key: definition.key,
      name: definition.name,
      sourceKind: definition.sourceKind,
      authorityLevel: definition.authorityLevel,
      attributionLabel: definition.attributionLabel,
      homepageUrl: definition.homepageUrl,
      baseUrl: definition.baseUrl,
      termsUrl: definition.termsUrl,
      isOfficial: definition.isOfficial,
      metadata: definition.metadata,
      isActive: true,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: dataSources.key,
      set: {
        name: definition.name,
        sourceKind: definition.sourceKind,
        authorityLevel: definition.authorityLevel,
        attributionLabel: definition.attributionLabel,
        homepageUrl: definition.homepageUrl,
        baseUrl: definition.baseUrl,
        termsUrl: definition.termsUrl,
        isOfficial: definition.isOfficial,
        isActive: true,
        updatedAt: now,
      },
    });
    const source = await this.getSource(definition.key);
    if (!source) throw new Error(`Unable to create data source ${definition.key}`);
    return source;
  }

  async updateSourceMetadata(sourceId: string, patch: Record<string, unknown>): Promise<void> {
    const source = await this.db.query.dataSources.findFirst({ where: eq(dataSources.id, sourceId) });
    if (!source) return;
    await this.db.update(dataSources).set({
      metadata: { ...(source.metadata ?? {}), ...jsonSafe(patch) as Record<string, unknown> },
      updatedAt: this.now(),
    }).where(eq(dataSources.id, sourceId));
  }

  async listDueDocumentAvailabilityChecks(
    sourceId: string,
    limit = DOCUMENT_AVAILABILITY_CHECK_LIMIT,
    now = this.now(),
  ): Promise<DocumentAvailabilityTarget[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > DOCUMENT_AVAILABILITY_CHECK_LIMIT) {
      throw new RangeError(
        `Document availability check limit must be between 1 and ${DOCUMENT_AVAILABILITY_CHECK_LIMIT}`,
      );
    }

    const cutoff = (status: keyof typeof DOCUMENT_AVAILABILITY_TTL_MS) =>
      new Date(now.getTime() - DOCUMENT_AVAILABILITY_TTL_MS[status]);

    return this.db.select({
      id: ipoDocuments.id,
      documentUrl: ipoDocuments.documentUrl,
    })
      .from(ipoDocuments)
      .where(and(
        eq(ipoDocuments.sourceId, sourceId),
        eq(ipoDocuments.isCurrent, true),
        or(
          eq(ipoDocuments.availabilityStatus, "UNCHECKED"),
          and(
            eq(ipoDocuments.availabilityStatus, "UNKNOWN"),
            or(
              isNull(ipoDocuments.availabilityCheckedAt),
              lt(ipoDocuments.availabilityCheckedAt, cutoff("UNKNOWN")),
            ),
          ),
          and(
            eq(ipoDocuments.availabilityStatus, "NOT_FOUND"),
            or(
              isNull(ipoDocuments.availabilityCheckedAt),
              lt(ipoDocuments.availabilityCheckedAt, cutoff("NOT_FOUND")),
            ),
          ),
          and(
            eq(ipoDocuments.availabilityStatus, "AVAILABLE"),
            or(
              isNull(ipoDocuments.availabilityCheckedAt),
              lt(ipoDocuments.availabilityCheckedAt, cutoff("AVAILABLE")),
            ),
          ),
        ),
      ))
      .orderBy(asc(ipoDocuments.availabilityCheckedAt), desc(ipoDocuments.filingDate))
      .limit(limit);
  }

  async updateDocumentAvailability(
    documentId: string,
    result: DocumentAvailabilityResult,
  ): Promise<void> {
    await this.db.update(ipoDocuments).set({
      availabilityStatus: result.status,
      availabilityCheckedAt: result.checkedAt,
      availabilityHttpStatus: result.httpStatus ?? null,
      updatedAt: result.checkedAt,
    }).where(eq(ipoDocuments.id, documentId));
  }

  async startRun(
    definition: SourceDefinition,
    jobType: string,
    trigger: RunTrigger,
    metadata?: Record<string, unknown>,
  ): Promise<IngestionRunContext> {
    const source = await this.upsertSource(definition);
    const startedAt = this.now();
    const [run] = await this.db.insert(ingestionRuns).values({
      sourceId: source.id,
      providerKey: definition.key,
      jobType,
      trigger,
      status: "RUNNING",
      startedAt,
      metadata: metadata ? jsonSafe(metadata) as Record<string, unknown> : undefined,
    }).returning();
    if (!run) throw new Error(`Unable to start ingestion run ${jobType}`);

    await this.db.insert(providerStatus).values({
      sourceId: source.id,
      health: "UNKNOWN",
      lastAttemptAt: startedAt,
      updatedAt: startedAt,
    }).onConflictDoUpdate({
      target: providerStatus.sourceId,
      set: { lastAttemptAt: startedAt, updatedAt: startedAt },
    });

    logIngestion({ level: "info", provider: definition.key, operation: jobType, result: "started" });
    return { id: run.id, sourceId: source.id, providerKey: definition.key, jobType, trigger, startedAt, source };
  }

  async finishRun(
    context: IngestionRunContext,
    status: RunStatus,
    counters: RunCounters,
    options: { errorSummary?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<void> {
    const finishedAt = this.now();
    const latencyMs = Math.max(0, finishedAt.getTime() - context.startedAt.getTime());
    await this.db.update(ingestionRuns).set({
      status,
      finishedAt,
      recordsFetched: counters.fetched,
      recordsCreated: counters.created,
      recordsUpdated: counters.updated,
      recordsSkipped: counters.skipped,
      errorCount: counters.errors,
      errorSummary: options.errorSummary,
      metadata: options.metadata ? jsonSafe(options.metadata) as Record<string, unknown> : undefined,
    }).where(eq(ingestionRuns.id, context.id));

    await this.db.update(dataSources).set({
      lastFetchedAt: finishedAt,
      ...(status === "SUCCEEDED" || status === "PARTIAL" ? { lastSuccessfulAt: finishedAt } : {}),
      updatedAt: finishedAt,
    }).where(eq(dataSources.id, context.sourceId));

    const existing = await this.db.query.providerStatus.findFirst({ where: eq(providerStatus.sourceId, context.sourceId) });
    if (status === "FAILED") {
      const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;
      await this.db.update(providerStatus).set({
        health: consecutiveFailures >= 3 ? "OFFLINE" : "DEGRADED",
        lastFailureAt: finishedAt,
        lastErrorCode: options.errorSummary ? "INGESTION_FAILED" : existing?.lastErrorCode,
        lastErrorMessage: options.errorSummary,
        recordsSynced: resultCount(counters),
        consecutiveFailures,
        latencyMs,
        updatedAt: finishedAt,
      }).where(eq(providerStatus.sourceId, context.sourceId));
    } else if (status === "PARTIAL") {
      await this.db.update(providerStatus).set({
        health: "DEGRADED",
        lastSuccessfulAt: finishedAt,
        lastFailureAt: counters.errors > 0 ? finishedAt : existing?.lastFailureAt,
        lastErrorCode: counters.errors > 0 ? "PARTIAL_INGESTION" : null,
        lastErrorMessage: options.errorSummary,
        recordsSynced: resultCount(counters),
        consecutiveFailures: 0,
        latencyMs,
        updatedAt: finishedAt,
      }).where(eq(providerStatus.sourceId, context.sourceId));
    } else if (status === "SUCCEEDED") {
      await this.db.update(providerStatus).set({
        health: "HEALTHY",
        lastSuccessfulAt: finishedAt,
        lastErrorCode: null,
        lastErrorMessage: null,
        recordsSynced: resultCount(counters),
        consecutiveFailures: 0,
        latencyMs,
        updatedAt: finishedAt,
      }).where(eq(providerStatus.sourceId, context.sourceId));
    }

    logIngestion({
      level: status === "FAILED" ? "error" : status === "PARTIAL" ? "warn" : "info",
      provider: context.providerKey,
      operation: context.jobType,
      durationMs: latencyMs,
      result: status,
      records: resultCount(counters),
      error: options.errorSummary,
    });
  }

  async logError(
    context: IngestionRunContext,
    operation: string,
    error: unknown,
    options: {
      entityType?: string;
      entityId?: string;
      rawIdentifier?: string;
      rawRecordId?: string;
      context?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    await this.db.insert(ingestionErrors).values({
      ingestionRunId: context.id,
      sourceId: context.sourceId,
      rawRecordId: options.rawRecordId,
      operation,
      entityType: options.entityType,
      entityId: options.entityId,
      rawIdentifier: options.rawIdentifier,
      errorCode: errorCode(error),
      errorMessage: errorMessage(error).slice(0, 2_000),
      context: options.context ? jsonSafe(options.context) as Record<string, unknown> : undefined,
      isRetryable: isRetryable(error),
    });
  }

  async recordRaw(
    context: IngestionRunContext,
    entityType: string,
    externalId: string,
    payload: unknown,
    options: {
      endpoint?: string;
      contentType?: string;
      schemaVersion?: string;
      validationStatus?: typeof rawProviderRecords.$inferInsert.validationStatus;
      validationErrors?: unknown[];
    } = {},
  ) {
    const safePayload = jsonSafe(payload);
    const payloadHash = await sha256(stableJSON(safePayload));
    const existing = await this.db.query.rawProviderRecords.findFirst({
      where: and(
        eq(rawProviderRecords.sourceId, context.sourceId),
        eq(rawProviderRecords.entityType, entityType),
        eq(rawProviderRecords.externalId, externalId),
        eq(rawProviderRecords.payloadHash, payloadHash),
      ),
    });
    if (existing) return existing;

    await this.db.insert(rawProviderRecords).values({
      sourceId: context.sourceId,
      ingestionRunId: context.id,
      entityType,
      externalId,
      endpoint: options.endpoint,
      payload: safePayload,
      payloadHash,
      contentType: options.contentType ?? "application/json",
      schemaVersion: options.schemaVersion ?? "phase2-v1",
      validationStatus: options.validationStatus ?? "VALID",
      validationErrors: options.validationErrors,
    }).onConflictDoNothing();

    const stored = await this.db.query.rawProviderRecords.findFirst({
      where: and(
        eq(rawProviderRecords.sourceId, context.sourceId),
        eq(rawProviderRecords.entityType, entityType),
        eq(rawProviderRecords.externalId, externalId),
        eq(rawProviderRecords.payloadHash, payloadHash),
      ),
    });
    if (!stored) throw new Error(`Unable to retain raw ${entityType} record ${externalId}`);
    return stored;
  }

  private async resolveCompany(
    sourceId: string,
    displayName: string,
    identity: CompanyIdentity = {},
  ) {
    const normalizedName = normalizeCompanyName(displayName);
    if (!normalizedName) throw new Error("Company name is empty after normalization");

    if (identity.externalId) {
      const alias = await this.db.query.companyAliases.findFirst({
        where: and(eq(companyAliases.sourceId, sourceId), eq(companyAliases.externalId, identity.externalId)),
      });
      if (alias) {
        const company = await this.db.query.companies.findFirst({ where: eq(companies.id, alias.companyId) });
        if (company) return company;
      }
    }

    const sourceAlias = await this.db.query.companyAliases.findFirst({
      where: and(eq(companyAliases.sourceId, sourceId), eq(companyAliases.normalizedName, normalizedName)),
    });
    if (sourceAlias) {
      const company = await this.db.query.companies.findFirst({ where: eq(companies.id, sourceAlias.companyId) });
      if (company) return company;
    }

    let company: typeof companies.$inferSelect | undefined;
    if (identity.cin) company = await this.db.query.companies.findFirst({ where: eq(companies.cin, identity.cin) });
    if (!company && identity.isin) company = await this.db.query.companies.findFirst({ where: eq(companies.isin, identity.isin) });
    if (!company) {
      const exactMatches = await this.db.select().from(companies)
        .where(eq(companies.normalizedName, normalizedName)).limit(2);
      if (exactMatches.length === 1) company = exactMatches[0];
    }

    const now = this.now();
    if (!company) {
      const baseSlug = slugifyCompany(displayName);
      const collision = await this.db.query.companies.findFirst({ where: eq(companies.slug, baseSlug) });
      const slug = !collision || collision.normalizedName === normalizedName
        ? baseSlug
        : `${baseSlug}-${stableId("company", normalizedName).slice(-6)}`;
      await this.db.insert(companies).values({
        displayName: displayName.trim(),
        legalName: displayName.trim(),
        normalizedName,
        slug,
        cin: identity.cin,
        isin: identity.isin,
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
      company = await this.db.query.companies.findFirst({ where: eq(companies.slug, slug) });
      if (!company) throw new Error(`Unable to resolve company ${displayName}`);
    } else {
      await this.db.update(companies).set({ lastSeenAt: now, updatedAt: now }).where(eq(companies.id, company.id));
    }

    await this.db.insert(companyAliases).values({
      companyId: company.id,
      sourceId,
      externalName: displayName.trim(),
      normalizedName,
      externalId: identity.externalId,
      isVerified: Boolean(identity.cin || identity.isin),
      updatedAt: now,
    }).onConflictDoNothing();
    return company;
  }

  private async getOrCreateLifecycleIPO(
    company: typeof companies.$inferSelect,
    preferredSlug?: string,
  ) {
    const [active] = await this.db.select().from(ipos)
      .where(and(eq(ipos.companyId, company.id), inArray(ipos.status, activeStatuses)))
      .orderBy(desc(ipos.firstSeenAt)).limit(1);
    if (active) return active;

    const baseSlug = slugifyCompany(preferredSlug || company.displayName);
    const collision = await this.db.query.ipos.findFirst({ where: eq(ipos.slug, baseSlug) });
    const slug = collision
      ? `${baseSlug}-${this.now().getUTCFullYear()}-${stableId("ipo", company.id, this.now().toISOString()).slice(-5)}`
      : baseSlug;
    const now = this.now();
    const [created] = await this.db.insert(ipos).values({
      companyId: company.id,
      slug,
      status: "DRHP_FILED",
      firstSeenAt: now,
      lastSeenAt: now,
      updatedAt: now,
    }).onConflictDoNothing().returning();
    if (created) return created;
    // Another concurrently isolated provider may have created this lifecycle.
    const raced = await this.db.query.ipos.findFirst({ where: eq(ipos.slug, slug) });
    if (raced?.companyId === company.id) return raced;
    const [activeAfterRace] = await this.db.select().from(ipos)
      .where(and(eq(ipos.companyId, company.id), inArray(ipos.status, activeStatuses)))
      .orderBy(desc(ipos.firstSeenAt)).limit(1);
    if (activeAfterRace) return activeAfterRace;
    throw new Error(`Unable to create IPO lifecycle for ${company.displayName}`);
  }

  private async findIPOByIdentifier(externalId: string, sourceId?: string) {
    if (sourceId) {
      const ownIdentifier = await this.db.query.ipoExternalIdentifiers.findFirst({
        where: and(eq(ipoExternalIdentifiers.sourceId, sourceId), eq(ipoExternalIdentifiers.externalId, externalId)),
      });
      if (ownIdentifier) return this.db.query.ipos.findFirst({ where: eq(ipos.id, ownIdentifier.ipoId) });
    }

    const identifiers = await this.db.select().from(ipoExternalIdentifiers)
      .where(eq(ipoExternalIdentifiers.externalId, externalId)).limit(2);
    if (identifiers.length === 1) {
      return this.db.query.ipos.findFirst({ where: eq(ipos.id, identifiers[0].ipoId) });
    }
    return this.db.query.ipos.findFirst({
      where: eq(ipos.slug, slugifyCompany(externalId)),
    });
  }

  private async bindIPOIdentifier(ipoId: string, sourceId: string, externalId: string): Promise<void> {
    const now = this.now();
    await this.db.insert(ipoExternalIdentifiers).values({
      ipoId,
      sourceId,
      identifierType: "PROVIDER_ID",
      externalId,
      firstSeenAt: now,
      lastSeenAt: now,
    }).onConflictDoUpdate({
      target: [ipoExternalIdentifiers.sourceId, ipoExternalIdentifiers.identifierType, ipoExternalIdentifiers.externalId],
      set: { lastSeenAt: now },
    });
  }

  private async refreshIPOStatus(ipoId: string): Promise<void> {
    const record = await this.db.query.ipos.findFirst({ where: eq(ipos.id, ipoId) });
    if (!record) return;
    const [selectedStatus] = await this.db.select({
      normalizedValue: ipoFieldSources.normalizedValue,
      fetchedAt: ipoFieldSources.fetchedAt,
      observedAt: ipoFieldSources.observedAt,
      verifiedAt: ipoFieldSources.verifiedAt,
      sourceKind: dataSources.sourceKind,
      authorityLevel: dataSources.authorityLevel,
      isOfficial: dataSources.isOfficial,
    }).from(ipoFieldSources)
      .innerJoin(dataSources, eq(dataSources.id, ipoFieldSources.sourceId))
      .where(and(
        eq(ipoFieldSources.ipoId, ipoId),
        eq(ipoFieldSources.fieldName, "status"),
        eq(ipoFieldSources.isSelected, true),
        isNull(ipoFieldSources.supersededAt),
      ))
      .limit(1);
    const explicitStatus = authoritativeExplicitStatus(selectedStatus ? {
      status: selectedStatus.normalizedValue,
      sourceKind: selectedStatus.sourceKind,
      authorityLevel: selectedStatus.authorityLevel,
      isOfficial: selectedStatus.isOfficial,
      verifiedAt: selectedStatus.verifiedAt,
    } : undefined);
    const documents = await this.db.select({ documentType: ipoDocuments.documentType })
      .from(ipoDocuments).where(eq(ipoDocuments.ipoId, ipoId));
    const status = statusMap[calculateIPOStatus({
      hasDRHP: documents.some((document) => document.documentType === "DRHP" || document.documentType === "UPDATED_DRHP"),
      hasRHP: documents.some((document) => ["RHP", "FINAL_OFFER_DOCUMENT"].includes(document.documentType)),
      openDate: record.openDate ?? undefined,
      closeDate: record.closeDate ?? undefined,
      allotmentDate: record.allotmentDate ?? undefined,
      listingDate: record.listingDate ?? undefined,
      explicitStatus,
    })];
    const explicitAt = selectedStatus?.observedAt ?? selectedStatus?.verifiedAt ?? selectedStatus?.fetchedAt ?? this.now();
    await this.db.update(ipos).set({
      status,
      statusReason: explicitStatus
        ? `Explicit ${explicitStatus} status from selected authoritative provenance`
        : "Calculated from canonical dates and filing lifecycle",
      withdrawnAt: explicitStatus === "withdrawn" ? explicitAt : null,
      deferredAt: explicitStatus === "deferred" ? explicitAt : null,
      updatedAt: this.now(),
    }).where(eq(ipos.id, ipoId));
  }

  private async writeIPOField(
    context: IngestionRunContext,
    ipoId: string,
    input: FieldWrite,
  ): Promise<"selected" | "rejected" | "unchanged"> {
    const normalizedValue = normalizedFieldValue(input.value);
    const current = await this.db.query.ipoFieldSources.findFirst({
      where: and(
        eq(ipoFieldSources.ipoId, ipoId),
        eq(ipoFieldSources.fieldName, input.fieldName),
        eq(ipoFieldSources.isSelected, true),
        isNull(ipoFieldSources.supersededAt),
      ),
    });

    if (current && current.sourceId === context.sourceId && current.normalizedValue === normalizedValue) {
      await this.db.update(ipoFieldSources).set({
        ingestionRunId: context.id,
        rawRecordId: input.rawRecordId,
        sourceUrl: input.sourceUrl,
        rawValue: normalizedValue,
        fetchedAt: input.fetchedAt,
        observedAt: input.observedAt,
        confidence: input.confidence,
      }).where(eq(ipoFieldSources.id, current.id));
      return "unchanged";
    }

    const currentTime = current?.verifiedAt ?? current?.fetchedAt;
    const incomingWins = !current
      || input.priority > current.priority
      || (input.priority === current.priority && input.fetchedAt.getTime() >= (currentTime?.getTime() ?? 0));

    const [candidate] = await this.db.insert(ipoFieldSources).values({
      ipoId,
      fieldName: input.fieldName,
      valueType: input.valueType,
      sourceId: context.sourceId,
      ingestionRunId: context.id,
      rawRecordId: input.rawRecordId,
      sourceUrl: input.sourceUrl,
      rawValue: normalizedValue,
      normalizedValue,
      priority: input.priority,
      confidence: input.confidence,
      observedAt: input.observedAt,
      fetchedAt: input.fetchedAt,
      isSelected: !current,
    }).returning();
    if (!candidate) throw new Error(`Unable to record provenance for ${input.fieldName}`);

    if (current && incomingWins) {
      const supersededAt = this.now();
      await this.db.update(ipoFieldSources).set({ isSelected: false, supersededAt })
        .where(eq(ipoFieldSources.id, current.id));
      await this.db.update(ipoFieldSources).set({ isSelected: true })
        .where(eq(ipoFieldSources.id, candidate.id));
    }

    const selected = !current || incomingWins;
    if (selected) {
      await this.db.update(ipos).set({
        [input.fieldName]: input.value,
        updatedAt: this.now(),
      } as IpoMutation).where(eq(ipos.id, ipoId));
    }

    if (current && current.normalizedValue !== normalizedValue) {
      const preferred = selected ? candidate : current;
      const challenger = selected ? current : candidate;
      const duplicate = await this.db.query.dataConflicts.findFirst({
        where: and(
          eq(dataConflicts.entityType, "IPO"),
          eq(dataConflicts.entityId, ipoId),
          eq(dataConflicts.fieldName, input.fieldName),
          eq(dataConflicts.preferredValue, preferred.normalizedValue ?? ""),
          eq(dataConflicts.challengerValue, challenger.normalizedValue ?? ""),
          eq(dataConflicts.status, "OPEN"),
        ),
      });
      if (!duplicate) {
        await this.db.insert(dataConflicts).values({
          entityType: "IPO",
          entityId: ipoId,
          ipoId,
          fieldName: input.fieldName,
          preferredFieldSourceId: preferred.id,
          challengerFieldSourceId: challenger.id,
          preferredSourceId: preferred.sourceId,
          challengerSourceId: challenger.sourceId,
          preferredValue: preferred.normalizedValue,
          challengerValue: challenger.normalizedValue,
          status: "OPEN",
          updatedAt: this.now(),
        });
      }
    }
    return selected ? "selected" : "rejected";
  }

  async ingestFiling(
    context: IngestionRunContext,
    filing: NormalizedFiling,
  ): Promise<IngestOutcome> {
    const raw = await this.recordRaw(context, "IPO_FILING", filing.id, filing, {
      endpoint: filing.sourceUrl,
    });
    const company = await this.resolveCompany(context.sourceId, filing.companyName);
    const ipo = await this.getOrCreateLifecycleIPO(company);
    const documentType = documentTypeMap[filing.filingType];
    const existing = await this.db.query.ipoDocuments.findFirst({
      where: and(
        eq(ipoDocuments.sourceId, context.sourceId),
        eq(ipoDocuments.ipoId, ipo.id),
        eq(ipoDocuments.documentType, documentType),
        eq(ipoDocuments.documentUrl, filing.documentUrl),
        eq(ipoDocuments.filingDate, filing.filingDate),
      ),
    });
    const now = this.now();
    const title = filing.sourceMetadata?.itemTitle
      ?? `${filing.companyName} — ${filing.filingType.replaceAll("_", " ").toUpperCase()}`;
    if (existing) {
      await this.db.update(ipoDocuments).set({
        ingestionRunId: context.id,
        rawRecordId: raw.id,
        title,
        sourceUrl: filing.sourceUrl,
        fetchedAt: dateOrUndefined(filing.fetchedAt) ?? now,
        isCurrent: true,
        updatedAt: now,
      }).where(eq(ipoDocuments.id, existing.id));
      await this.db.update(ipos).set({ lastSeenAt: now, updatedAt: now }).where(eq(ipos.id, ipo.id));
      await this.refreshIPOStatus(ipo.id);
      return "updated";
    }

    await this.db.update(ipoDocuments).set({ isCurrent: false, updatedAt: now })
      .where(and(
        eq(ipoDocuments.ipoId, ipo.id),
        eq(ipoDocuments.sourceId, context.sourceId),
        eq(ipoDocuments.documentType, documentType),
        eq(ipoDocuments.isCurrent, true),
      ));
    await this.db.insert(ipoDocuments).values({
      ipoId: ipo.id,
      sourceId: context.sourceId,
      ingestionRunId: context.id,
      rawRecordId: raw.id,
      documentType,
      externalId: filing.id,
      title,
      filingDate: filing.filingDate,
      documentUrl: filing.documentUrl,
      sourceUrl: filing.sourceUrl,
      fetchedAt: dateOrUndefined(filing.fetchedAt) ?? now,
      isCurrent: true,
      updatedAt: now,
    });
    await this.db.update(ipos).set({ lastSeenAt: now, updatedAt: now }).where(eq(ipos.id, ipo.id));
    await this.refreshIPOStatus(ipo.id);
    return "created";
  }

  async ingestStructuredIPO(
    context: IngestionRunContext,
    record: StructuredIPORecord,
    options: { priority: number; confidence?: number } = { priority: 500 },
  ): Promise<IngestOutcome> {
    const raw = await this.recordRaw(context, "IPO", record.externalId, record, {
      endpoint: record.sourceUrl,
    });
    let ipo = await this.findIPOByIdentifier(record.externalId, context.sourceId);
    const isNewSourceRecord = !ipo;
    if (!ipo) {
      const company = await this.resolveCompany(context.sourceId, record.companyName, {
        externalId: record.externalId,
        isin: record.isin,
      });
      ipo = await this.getOrCreateLifecycleIPO(company, record.slug);
      await this.bindIPOIdentifier(ipo.id, context.sourceId, record.externalId);
    }

    const fetchedAt = dateOrUndefined(record.updatedAt) ?? this.now();
    const common = {
      priority: options.priority,
      confidence: options.confidence,
      sourceUrl: record.sourceUrl,
      fetchedAt,
      rawRecordId: raw.id,
    };
    const fields: Array<Omit<FieldWrite, keyof typeof common> & Partial<typeof common>> = [];
    if (record.board !== "unknown") fields.push({ fieldName: "board", value: record.board === "sme" ? "SME" : "MAINBOARD", valueType: "TEXT" });
    if (record.exchanges.length) fields.push({ fieldName: "exchanges", value: record.exchanges, valueType: "JSON" });
    if (record.faceValue != null) fields.push({ fieldName: "faceValue", value: decimal(record.faceValue), valueType: "DECIMAL" });
    if (record.priceBandMin != null) fields.push({ fieldName: "priceBandMin", value: decimal(record.priceBandMin), valueType: "DECIMAL" });
    if (record.priceBandMax != null) fields.push({ fieldName: "priceBandMax", value: decimal(record.priceBandMax), valueType: "DECIMAL" });
    if (record.lotSize != null) fields.push({ fieldName: "lotSize", value: record.lotSize, valueType: "INTEGER" });
    if (record.issueSizeCr != null) fields.push({ fieldName: "issueSizeCr", value: decimal(record.issueSizeCr), valueType: "DECIMAL" });
    if (record.freshIssueCr != null) fields.push({ fieldName: "freshIssueCr", value: decimal(record.freshIssueCr), valueType: "DECIMAL" });
    if (record.offerForSaleCr != null) fields.push({ fieldName: "offerForSaleCr", value: decimal(record.offerForSaleCr), valueType: "DECIMAL" });
    if (record.openDate) fields.push({ fieldName: "openDate", value: record.openDate, valueType: "DATE" });
    if (record.closeDate) fields.push({ fieldName: "closeDate", value: record.closeDate, valueType: "DATE" });
    if (record.allotmentDate) fields.push({ fieldName: "allotmentDate", value: record.allotmentDate, valueType: "DATE" });
    if (record.refundDate) fields.push({ fieldName: "refundDate", value: record.refundDate, valueType: "DATE" });
    if (record.dematDate) fields.push({ fieldName: "dematDate", value: record.dematDate, valueType: "DATE" });
    if (record.listingDate) fields.push({ fieldName: "listingDate", value: record.listingDate, valueType: "DATE" });
    if (record.issuePrice != null) fields.push({ fieldName: "issuePrice", value: decimal(record.issuePrice), valueType: "DECIMAL" });
    if (record.isin) fields.push({ fieldName: "isin", value: record.isin, valueType: "TEXT" });
    const explicitStatus = authoritativeExplicitStatus({
      status: record.status,
      sourceKind: context.source.sourceKind,
      authorityLevel: context.source.authorityLevel,
      isOfficial: context.source.isOfficial,
    });
    if (explicitStatus) {
      fields.push({
        fieldName: "status",
        value: explicitStatus === "withdrawn" ? "WITHDRAWN" : "DEFERRED",
        valueType: "TEXT",
        observedAt: fetchedAt,
      });
    }

    let selected = 0;
    let changed = 0;
    for (const field of fields) {
      const result = await this.writeIPOField(context, ipo.id, { ...common, ...field } as FieldWrite);
      if (result === "selected") selected += 1;
      if (result !== "unchanged") changed += 1;
    }

    await this.refreshIPOStatus(ipo.id);

    const now = this.now();
    await this.db.update(ipos).set({ lastSeenAt: now, updatedAt: now }).where(eq(ipos.id, ipo.id));
    return fields.length === 0
      ? "skipped"
      : isNewSourceRecord
        ? "created"
        : selected > 0 || changed > 0
          ? "updated"
          : "skipped";
  }

  async ingestGMP(context: IngestionRunContext, record: NormalizedGMPRecord): Promise<IngestOutcome> {
    const raw = await this.recordRaw(context, "IPO_GMP", record.externalId, record, { endpoint: record.sourceUrl });
    const ipo = await this.findIPOByIdentifier(record.ipoExternalId);
    if (!ipo) throw new Error(`No canonical IPO matches GMP identifier ${record.ipoExternalId}`);
    const observedAt = dateOrUndefined(record.observedAt);
    if (!observedAt) throw new Error(`Invalid GMP observation timestamp ${record.observedAt}`);
    const upperPriceBand = ipo.priceBandMax == null ? undefined : Number(ipo.priceBandMax);
    const calculated = calculateGMP(upperPriceBand, record.gmp);
    const existing = await this.db.query.ipoGmpHistory.findFirst({
      where: and(eq(ipoGmpHistory.sourceId, context.sourceId), eq(ipoGmpHistory.sourceRecordKey, record.externalId)),
    });
    const values = {
      ingestionRunId: context.id,
      rawRecordId: raw.id,
      gmp: decimal(record.gmp) ?? "0",
      upperPriceBand: decimal(upperPriceBand),
      estimatedListingPrice: decimal(calculated.estimatedListingPrice),
      gmpPercent: decimal(calculated.gmpPercent),
      sourceUrl: record.sourceUrl,
      observedAt,
      fetchedAt: this.now(),
      isValid: true,
      invalidReason: null,
    };
    if (existing) {
      await this.db.update(ipoGmpHistory).set(values).where(eq(ipoGmpHistory.id, existing.id));
      return "updated";
    }
    const [inserted] = await this.db.insert(ipoGmpHistory).values({
      ...values,
      ipoId: ipo.id,
      sourceId: context.sourceId,
      sourceRecordKey: record.externalId,
    }).onConflictDoNothing().returning({ id: ipoGmpHistory.id });
    return inserted ? "created" : "skipped";
  }

  async ingestSubscription(
    context: IngestionRunContext,
    record: NormalizedSubscriptionSnapshot,
  ): Promise<IngestOutcome> {
    const raw = await this.recordRaw(context, "IPO_SUBSCRIPTION", record.externalId, record, { endpoint: record.sourceUrl });
    const ipo = await this.findIPOByIdentifier(record.ipoExternalId);
    if (!ipo) throw new Error(`No canonical IPO matches subscription identifier ${record.ipoExternalId}`);
    const observedAt = dateOrUndefined(record.timestamp);
    if (!observedAt) throw new Error(`Invalid subscription timestamp ${record.timestamp}`);
    const existing = await this.db.query.ipoSubscriptionSnapshots.findFirst({
      where: and(
        eq(ipoSubscriptionSnapshots.sourceId, context.sourceId),
        eq(ipoSubscriptionSnapshots.sourceRecordKey, record.externalId),
      ),
    });
    const dayNumber = ipo.openDate
      ? Math.max(1, Math.floor((observedAt.getTime() - new Date(`${ipo.openDate}T00:00:00+05:30`).getTime()) / 86_400_000) + 1)
      : undefined;
    const values = {
      ingestionRunId: context.id,
      rawRecordId: raw.id,
      dayNumber,
      qib: decimal(record.qib),
      nii: decimal(record.nii),
      bnii: decimal(record.bnii),
      snii: decimal(record.snii),
      retail: decimal(record.retail),
      employee: decimal(record.employee),
      shareholder: decimal(record.shareholder),
      total: decimal(record.total),
      sourceUrl: record.sourceUrl,
      observedAt,
      fetchedAt: this.now(),
      isFinal: ipo.closeDate ? observedAt >= new Date(`${ipo.closeDate}T15:30:00+05:30`) : false,
    };
    if (existing) {
      await this.db.update(ipoSubscriptionSnapshots).set(values).where(eq(ipoSubscriptionSnapshots.id, existing.id));
      return "updated";
    }
    const [inserted] = await this.db.insert(ipoSubscriptionSnapshots).values({
      ...values,
      ipoId: ipo.id,
      sourceId: context.sourceId,
      sourceRecordKey: record.externalId,
    }).onConflictDoNothing().returning({ id: ipoSubscriptionSnapshots.id });
    return inserted ? "created" : "skipped";
  }

  async ingestNews(context: IngestionRunContext, record: NormalizedNewsRecord): Promise<IngestOutcome> {
    const raw = await this.recordRaw(context, "NEWS", record.externalId, record, { endpoint: record.url });
    const existing = await this.db.query.newsArticles.findFirst({
      where: and(eq(newsArticles.sourceId, context.sourceId), eq(newsArticles.canonicalUrl, record.url)),
    });
    const values = {
      ingestionRunId: context.id,
      rawRecordId: raw.id,
      externalId: record.externalId,
      headline: record.headline,
      summary: record.summary || null,
      publisher: record.publisher,
      category: newsCategory(record.category),
      canonicalUrl: record.url,
      imageUrl: record.imageUrl,
      publishedAt: new Date(record.publishedAt),
      fetchedAt: this.now(),
      updatedAt: this.now(),
    };
    let newsId: string;
    let outcome: IngestOutcome;
    if (existing) {
      await this.db.update(newsArticles).set(values).where(eq(newsArticles.id, existing.id));
      newsId = existing.id;
      outcome = "updated";
    } else {
      const [created] = await this.db.insert(newsArticles).values({ ...values, sourceId: context.sourceId }).returning();
      if (!created) throw new Error(`Unable to store news article ${record.externalId}`);
      newsId = created.id;
      outcome = "created";
    }

    for (const name of record.relatedCompanies) {
      const normalizedName = normalizeCompanyName(name);
      const matches = await this.db.select({ id: companies.id }).from(companies)
        .where(eq(companies.normalizedName, normalizedName)).limit(2);
      if (matches.length === 1) {
        await this.db.insert(newsCompanies).values({ newsId, companyId: matches[0].id }).onConflictDoNothing();
      }
    }
    for (const identifier of record.relatedIPOs) {
      const ipo = await this.findIPOByIdentifier(identifier);
      if (ipo) await this.db.insert(newsIpos).values({ newsId, ipoId: ipo.id }).onConflictDoNothing();
    }
    return outcome;
  }

  async ingestMarketIndex(
    context: IngestionRunContext,
    record: NormalizedMarketIndex,
  ): Promise<IngestOutcome> {
    const externalId = `${inferExchange(record.symbol)}:${record.symbol}:${record.asOf}`;
    await this.recordRaw(context, "MARKET_INDEX", externalId, record, { endpoint: record.sourceUrl });
    const exchange = inferExchange(record.symbol);
    const existingIndex = await this.db.query.marketIndices.findFirst({
      where: and(eq(marketIndices.exchange, exchange), eq(marketIndices.symbol, record.symbol)),
    });
    let marketIndex = existingIndex;
    if (!marketIndex) {
      const [created] = await this.db.insert(marketIndices).values({
        symbol: record.symbol,
        name: record.name,
        exchange,
        updatedAt: this.now(),
      }).returning();
      marketIndex = created;
    } else if (marketIndex.name !== record.name) {
      await this.db.update(marketIndices).set({ name: record.name, updatedAt: this.now() })
        .where(eq(marketIndices.id, marketIndex.id));
    }
    if (!marketIndex) throw new Error(`Unable to create market index ${record.symbol}`);
    const observedAt = dateOrUndefined(record.asOf);
    if (!observedAt) throw new Error(`Invalid market quote timestamp ${record.asOf}`);
    const existingQuote = await this.db.query.marketIndexQuotes.findFirst({
      where: and(
        eq(marketIndexQuotes.marketIndexId, marketIndex.id),
        eq(marketIndexQuotes.sourceId, context.sourceId),
        eq(marketIndexQuotes.observedAt, observedAt),
      ),
    });
    const values = {
      ingestionRunId: context.id,
      value: decimal(record.value) ?? "0",
      change: decimal(record.change),
      changePercent: decimal(record.changePercent),
      quoteMode: record.timeliness,
      delayMinutes: record.delayMinutes,
      observedAt,
      fetchedAt: this.now(),
    };
    if (existingQuote) {
      await this.db.update(marketIndexQuotes).set(values).where(eq(marketIndexQuotes.id, existingQuote.id));
      return "updated";
    }
    await this.db.insert(marketIndexQuotes).values({ ...values, marketIndexId: marketIndex.id, sourceId: context.sourceId });
    return "created";
  }

  async ingestListingPerformance(
    context: IngestionRunContext,
    record: NormalizedListingData,
  ): Promise<IngestOutcome> {
    const raw = await this.recordRaw(context, "IPO_LISTING", record.externalId, record, { endpoint: record.sourceUrl });
    const ipo = await this.findIPOByIdentifier(record.ipoExternalId);
    if (!ipo) throw new Error(`No canonical IPO matches listing identifier ${record.ipoExternalId}`);
    const observedAt = dateOrUndefined(record.updatedAt) ?? this.now();
    const issuePrice = record.issuePrice ?? (ipo.issuePrice == null ? undefined : Number(ipo.issuePrice));
    const listingGainPercent = percentageReturn(issuePrice, record.listingOpen);
    const listingCloseGainPercent = percentageReturn(issuePrice, record.listingClose);
    const currentReturnFromIssue = percentageReturn(issuePrice, record.currentPrice);
    const existing = await this.db.query.ipoListingPerformance.findFirst({
      where: and(
        eq(ipoListingPerformance.ipoId, ipo.id),
        eq(ipoListingPerformance.sourceId, context.sourceId),
        eq(ipoListingPerformance.observedAt, observedAt),
      ),
    });
    const values = {
      ingestionRunId: context.id,
      listingDate: record.listingDate ?? ipo.listingDate,
      issuePrice: decimal(issuePrice),
      listingOpen: decimal(record.listingOpen),
      listingHigh: decimal(record.listingHigh),
      listingLow: decimal(record.listingLow),
      listingClose: decimal(record.listingClose),
      currentPrice: decimal(record.currentPrice),
      listingGainPercent: decimal(listingGainPercent),
      listingCloseGainPercent: decimal(listingCloseGainPercent),
      currentReturnFromIssue: decimal(currentReturnFromIssue),
      quoteMode: "UNKNOWN" as const,
      observedAt,
      fetchedAt: this.now(),
    };
    if (existing) {
      await this.db.update(ipoListingPerformance).set(values).where(eq(ipoListingPerformance.id, existing.id));
      return "updated";
    }
    await this.db.insert(ipoListingPerformance).values({
      ...values,
      ipoId: ipo.id,
      sourceId: context.sourceId,
    });
    if (record.listingDate) {
      await this.db.update(ipos).set({ listingDate: record.listingDate, updatedAt: this.now() }).where(eq(ipos.id, ipo.id));
      await this.refreshIPOStatus(ipo.id);
    }
    void raw;
    return "created";
  }

  async listIPOTargets(): Promise<IpoSyncTarget[]> {
    const rows = await this.db.select({
      ipoId: ipos.id,
      companyName: companies.displayName,
      slug: ipos.slug,
      status: ipos.status,
      openDate: ipos.openDate,
      closeDate: ipos.closeDate,
      listingDate: ipos.listingDate,
      lastSyncedAt: ipos.updatedAt,
      externalId: ipoExternalIdentifiers.externalId,
    }).from(ipos)
      .innerJoin(companies, eq(companies.id, ipos.companyId))
      .leftJoin(ipoExternalIdentifiers, eq(ipoExternalIdentifiers.ipoId, ipos.id))
      .orderBy(desc(ipos.updatedAt));
    const targets = new Map<string, IpoSyncTarget>();
    for (const row of rows) {
      const current = targets.get(row.ipoId);
      if (!current) {
        targets.set(row.ipoId, {
          ipoId: row.ipoId,
          companyName: row.companyName,
          slug: row.slug,
          status: row.status,
          openDate: row.openDate,
          closeDate: row.closeDate,
          listingDate: row.listingDate,
          lastSyncedAt: row.lastSyncedAt,
          identifier: row.externalId ?? row.slug,
        });
      }
    }
    return [...targets.values()];
  }
}
