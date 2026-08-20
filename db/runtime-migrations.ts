import fs from "node:fs";
import path from "node:path";

import {
  assertD1SchemaReady,
  D1SchemaUnavailableError,
  getD1,
  initializeD1Schema,
  splitDrizzleMigration,
} from "./index";

function loadMigration(filename: string): string {
  try {
    const filePath = path.join(process.cwd(), "drizzle", filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {
    // In environments without fs access
  }
  return "";
}

const phase2Foundation = loadMigration("0000_phase2_live_data_foundation.sql");
const documentLinkAvailability = loadMigration("0001_document_link_availability.sql");

const idempotentPhase2Foundation = splitDrizzleMigration(phase2Foundation).map((statement) =>
  statement
    .replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ")
    .replace(/^CREATE UNIQUE INDEX\s+/i, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS "),
);

const documentAvailabilityMigration = splitDrizzleMigration(documentLinkAvailability);
const documentAvailabilityColumns = [
  "availability_status",
  "availability_checked_at",
  "availability_http_status",
] as const;


function availabilityColumnStatement(column: string): string {
  const statement = documentAvailabilityMigration.find((candidate) =>
    candidate.startsWith("ALTER TABLE `ipo_documents` ADD ")
      && candidate.includes(`\`${column}\``),
  );
  if (!statement) throw new Error(`Missing inspected migration statement for ${column}`);
  return statement;
}

async function documentColumnNames(database: D1Database): Promise<Set<string>> {
  const result = await database
    .prepare("PRAGMA table_info('ipo_documents')")
    .all<{ name: string }>();
  return new Set(result.results.map((column) => column.name));
}

async function ensureDocumentAvailabilitySchema(database: D1Database): Promise<void> {
  let present = await documentColumnNames(database);

  for (const column of documentAvailabilityColumns) {
    if (present.has(column)) continue;
    try {
      await database.prepare(availabilityColumnStatement(column)).run();
    } catch (error) {
      // A concurrent authenticated bootstrap may have added the same column.
      present = await documentColumnNames(database);
      if (!present.has(column)) throw error;
    }
    present.add(column);
  }

  const indexStatement = documentAvailabilityMigration.find((statement) =>
    statement.includes("idx_ipo_documents_availability_due"),
  );
  if (!indexStatement) throw new Error("Missing inspected document availability index migration");
  await database
    .prepare(indexStatement.replace(/^CREATE INDEX\s+/i, "CREATE INDEX IF NOT EXISTS "))
    .run();
}

/**
 * Ensure a newly provisioned Sites D1 binding has the inspected Phase 2 schema.
 * This is called only by authenticated ingestion control paths, never by a
 * consumer page request.
 */
export async function ensurePhase2Schema(database: D1Database = getD1()): Promise<void> {
  try {
    await assertD1SchemaReady(database);
  } catch (error) {
    if (!(error instanceof D1SchemaUnavailableError)) throw error;
    try {
      await initializeD1Schema(idempotentPhase2Foundation, { database });
    } catch (initializationError) {
      // A concurrent authenticated bootstrap may have completed first.
      try {
        await assertD1SchemaReady(database);
      } catch {
        throw initializationError;
      }
    }
  }

  await assertD1SchemaReady(database);
  await ensureDocumentAvailabilitySchema(database);
}
