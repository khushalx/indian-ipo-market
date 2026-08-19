import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

const DRIZZLE_STATEMENT_BREAKPOINT = "--> statement-breakpoint";
const DEFAULT_BATCH_SIZE = 100;

export const requiredD1Tables = [
  "data_sources",
  "companies",
  "company_aliases",
  "ipos",
  "ipo_external_identifiers",
  "ipo_documents",
  "ipo_field_sources",
  "ipo_gmp_history",
  "ipo_subscription_snapshots",
  "ipo_financials",
  "ipo_listing_performance",
  "news_articles",
  "news_companies",
  "news_ipos",
  "market_indices",
  "market_index_quotes",
  "provider_status",
  "ingestion_runs",
  "ingestion_errors",
  "raw_provider_records",
  "data_conflicts",
  "manual_overrides",
] as const;

export type PreparedD1Statement = {
  sql: string;
  params?: readonly unknown[];
};

export type InitializeD1SchemaOptions = {
  database?: D1Database;
  batchSize?: number;
  optimize?: boolean;
};

export class D1BindingUnavailableError extends Error {
  constructor() {
    super("The Cloudflare D1 binding `DB` is unavailable in this runtime.");
    this.name = "D1BindingUnavailableError";
  }
}

export class D1SchemaUnavailableError extends Error {
  readonly missingTables: readonly string[];

  constructor(missingTables: readonly string[]) {
    super(`The D1 schema is incomplete; missing ${missingTables.length} required table(s).`);
    this.name = "D1SchemaUnavailableError";
    this.missingTables = missingTables;
  }
}

/** Return the raw D1 binding without spreading runtime access across callers. */
export function getD1(database?: D1Database): D1Database {
  const binding = database ?? env.DB;

  if (!binding) {
    throw new D1BindingUnavailableError();
  }

  return binding;
}

/** Drizzle is the typed query surface; raw helpers below remain D1-native. */
export function getDb(database?: D1Database) {
  return drizzle(getD1(database), { schema });
}

function normalizeSingleStatement(statement: string): string {
  const trimmed = statement.trim();

  if (!trimmed) {
    throw new TypeError("D1 statements must not be empty.");
  }

  const withoutTrailingSemicolon = trimmed.endsWith(";")
    ? trimmed.slice(0, -1).trim()
    : trimmed;

  if (withoutTrailingSemicolon.includes(";")) {
    throw new TypeError(
      "Each D1 prepared statement must contain exactly one SQL statement.",
    );
  }

  return withoutTrailingSemicolon;
}

/**
 * Split Drizzle's checked-in migration format without splitting on arbitrary
 * newlines. Every returned item is suitable for one D1 `prepare()` call.
 */
export function splitDrizzleMigration(migrationSql: string): string[] {
  return migrationSql
    .split(DRIZZLE_STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map(normalizeSingleStatement);
}

export function prepareD1Statement(
  database: D1Database,
  statement: PreparedD1Statement,
): D1PreparedStatement {
  const prepared = database.prepare(normalizeSingleStatement(statement.sql));
  return statement.params?.length ? prepared.bind(...statement.params) : prepared;
}

/** Execute prepared statements in bounded D1 batches. */
export async function runD1Batch(
  statements: readonly PreparedD1Statement[],
  options: { database?: D1Database; batchSize?: number } = {},
): Promise<D1Result[]> {
  if (statements.length === 0) {
    return [];
  }

  const database = getD1(options.database);
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new RangeError("D1 batchSize must be an integer between 1 and 100.");
  }

  const results: D1Result[] = [];

  for (let offset = 0; offset < statements.length; offset += batchSize) {
    const batch = statements
      .slice(offset, offset + batchSize)
      .map((statement) => prepareD1Statement(database, statement));
    results.push(...(await database.batch(batch)));
  }

  return results;
}

/**
 * Apply an inspected migration (or an already-split statement list) through
 * prepared D1 batches. Sites deployment remains the normal migration path;
 * this helper supports local/test bootstrap and controlled runtime recovery.
 */
export async function initializeD1Schema(
  migration: string | readonly string[],
  options: InitializeD1SchemaOptions = {},
): Promise<void> {
  const statements = typeof migration === "string"
    ? splitDrizzleMigration(migration)
    : migration.map(normalizeSingleStatement);

  if (statements.length === 0) {
    throw new TypeError("A D1 schema migration must contain at least one statement.");
  }

  const database = getD1(options.database);
  await runD1Batch(
    statements.map((statement) => ({ sql: statement })),
    { database, batchSize: options.batchSize },
  );

  if (options.optimize ?? true) {
    await database.prepare("PRAGMA optimize").run();
  }
}

/** Fail fast before an ingestion job runs against an un-migrated binding. */
export async function assertD1SchemaReady(
  database: D1Database = getD1(),
  requiredTables: readonly string[] = requiredD1Tables,
): Promise<void> {
  if (requiredTables.length === 0) {
    return;
  }

  const placeholders = requiredTables.map(() => "?").join(", ");
  const statement = database
    .prepare(
      `SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN (${placeholders})`,
    )
    .bind(...requiredTables);
  const result = await statement.all<{ name: string }>();
  const present = new Set(result.results.map((row) => row.name));
  const missing = requiredTables.filter((table) => !present.has(table));

  if (missing.length > 0) {
    throw new D1SchemaUnavailableError(missing);
  }
}
