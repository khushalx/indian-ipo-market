import { getD1 } from "@/db";
import { getRuntimeConfig } from "@/lib/env";
import { SOURCE_PRIORITY } from "@/lib/ingestion/source-priority";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import type { AdminActionResult, AdminIpoField, AdminSyncJob } from "./contracts";
import { adminSyncJobs } from "./contracts";
import type { AdminDataControlInput } from "./validation";

const MANUAL_SOURCE_KEY = "manual-admin";
const MANUAL_SOURCE_ID = "source:manual-admin";

type ValueType = "TEXT" | "DECIMAL" | "INTEGER" | "DATE";

type FieldRule = {
  column: string;
  valueType: ValueType;
  nullable: boolean;
  normalize: (value: string) => string;
};

const decimalPattern = /^\d{1,20}(?:\.\d{1,6})?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function oneOf(values: readonly string[]) {
  return (value: string) => {
    const normalized = value.trim().toUpperCase().replace(/[ -]+/g, "_");
    if (!values.includes(normalized)) {
      throw new AdminActionError(400, "INVALID_VALUE", `Accepted values: ${values.join(", ")}.`);
    }
    return normalized;
  };
}

function nonNegativeDecimal(value: string) {
  const normalized = value.trim();
  if (!decimalPattern.test(normalized)) {
    throw new AdminActionError(400, "INVALID_VALUE", "Use a non-negative plain decimal with up to six decimal places.");
  }
  return normalized;
}

function positiveInteger(value: string) {
  const normalized = value.trim();
  if (!/^\d{1,9}$/.test(normalized) || Number(normalized) < 1) {
    throw new AdminActionError(400, "INVALID_VALUE", "Use a positive whole number.");
  }
  return String(Number(normalized));
}

function isoDate(value: string) {
  const normalized = value.trim();
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!datePattern.test(normalized) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new AdminActionError(400, "INVALID_VALUE", "Use a valid ISO date in YYYY-MM-DD format.");
  }
  return normalized;
}

function shortText(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 500) {
    throw new AdminActionError(400, "INVALID_VALUE", "Use between 1 and 500 characters.");
  }
  return normalized;
}

const fieldRules: Record<AdminIpoField, FieldRule> = {
  board: { column: "board", valueType: "TEXT", nullable: true, normalize: oneOf(["MAINBOARD", "SME"]) },
  issueType: { column: "issue_type", valueType: "TEXT", nullable: true, normalize: oneOf(["BOOK_BUILT", "FIXED_PRICE", "UNKNOWN"]) },
  status: { column: "status", valueType: "TEXT", nullable: false, normalize: oneOf(["WITHDRAWN", "DEFERRED"]) },
  statusReason: { column: "status_reason", valueType: "TEXT", nullable: true, normalize: shortText },
  isin: {
    column: "isin",
    valueType: "TEXT",
    nullable: true,
    normalize(value) {
      const normalized = value.trim().toUpperCase();
      if (!/^IN[A-Z0-9]{10}$/.test(normalized)) {
        throw new AdminActionError(400, "INVALID_VALUE", "Use a valid 12-character Indian ISIN beginning with IN.");
      }
      return normalized;
    },
  },
  faceValue: { column: "face_value", valueType: "DECIMAL", nullable: true, normalize: nonNegativeDecimal },
  priceBandMin: { column: "price_band_min", valueType: "DECIMAL", nullable: true, normalize: nonNegativeDecimal },
  priceBandMax: { column: "price_band_max", valueType: "DECIMAL", nullable: true, normalize: nonNegativeDecimal },
  issuePrice: { column: "issue_price", valueType: "DECIMAL", nullable: true, normalize: nonNegativeDecimal },
  lotSize: { column: "lot_size", valueType: "INTEGER", nullable: true, normalize: positiveInteger },
  issueSizeCr: { column: "issue_size_cr", valueType: "DECIMAL", nullable: true, normalize: nonNegativeDecimal },
  freshIssueCr: { column: "fresh_issue_cr", valueType: "DECIMAL", nullable: true, normalize: nonNegativeDecimal },
  offerForSaleCr: { column: "offer_for_sale_cr", valueType: "DECIMAL", nullable: true, normalize: nonNegativeDecimal },
  anchorDate: { column: "anchor_date", valueType: "DATE", nullable: true, normalize: isoDate },
  openDate: { column: "open_date", valueType: "DATE", nullable: true, normalize: isoDate },
  closeDate: { column: "close_date", valueType: "DATE", nullable: true, normalize: isoDate },
  allotmentDate: { column: "allotment_date", valueType: "DATE", nullable: true, normalize: isoDate },
  refundDate: { column: "refund_date", valueType: "DATE", nullable: true, normalize: isoDate },
  dematDate: { column: "demat_date", valueType: "DATE", nullable: true, normalize: isoDate },
  listingDate: { column: "listing_date", valueType: "DATE", nullable: true, normalize: isoDate },
  registrarName: { column: "registrar_name", valueType: "TEXT", nullable: true, normalize: shortText },
  registrarUrl: {
    column: "registrar_url",
    valueType: "TEXT",
    nullable: true,
    normalize(value) {
      let parsed: URL;
      try {
        parsed = new URL(value.trim());
      } catch {
        throw new AdminActionError(400, "INVALID_VALUE", "Use a valid HTTPS registrar URL.");
      }
      if (parsed.protocol !== "https:") {
        throw new AdminActionError(400, "INVALID_VALUE", "Use a valid HTTPS registrar URL.");
      }
      return parsed.toString();
    },
  },
};

export class AdminActionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminActionError";
  }
}

function actor(user: ChatGPTUser) {
  return `${user.email.trim().toLowerCase()} (${user.userId})`;
}

function normalizeAlias(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(limited|ltd|private|pvt|company|co)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function ensureManualSource(): Promise<string> {
  const database = getD1();
  const now = Date.now();
  await database.prepare(`
    INSERT INTO data_sources (
      id, key, name, source_kind, authority_level, attribution_label,
      is_official, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, 'MANUAL', 'MANUAL', ?, 0, 1, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      name = excluded.name,
      attribution_label = excluded.attribution_label,
      is_active = 1,
      updated_at = excluded.updated_at
  `).bind(
    MANUAL_SOURCE_ID,
    MANUAL_SOURCE_KEY,
    "Verified admin entry",
    "Verified admin entry",
    now,
    now,
  ).run();

  const source = await database.prepare("SELECT id FROM data_sources WHERE key = ? LIMIT 1")
    .bind(MANUAL_SOURCE_KEY)
    .first<{ id: string }>();
  if (!source) throw new AdminActionError(503, "DATA_STORE_UNAVAILABLE", "The manual source could not be initialized.");
  return source.id;
}

function currentValueAsText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

async function overrideIpoField(
  input: Extract<AdminDataControlInput, { action: "override_ipo_field" }>,
  user: ChatGPTUser,
): Promise<AdminActionResult> {
  const database = getD1();
  const rule = fieldRules[input.field];
  const normalizedValue = input.value === null || input.value.trim() === ""
    ? null
    : rule.normalize(input.value);
  if (normalizedValue === null && !rule.nullable) {
    throw new AdminActionError(400, "INVALID_VALUE", "This field cannot be cleared.");
  }

  const existing = await database
    .prepare(`SELECT ${rule.column} AS currentValue FROM ipos WHERE id = ? LIMIT 1`)
    .bind(input.ipoId)
    .first<{ currentValue: unknown }>();
  if (!existing) throw new AdminActionError(404, "IPO_NOT_FOUND", "The selected IPO no longer exists.");

  const sourceId = await ensureManualSource();
  const now = Date.now();
  const fieldSourceId = crypto.randomUUID();
  const overrideId = crypto.randomUUID();
  const createdBy = actor(user);
  const oldValue = currentValueAsText(existing.currentValue);
  const canonicalUpdate = input.field === "status"
    ? database.prepare(`
        UPDATE ipos
        SET status = ?, status_reason = ?, withdrawn_at = ?, deferred_at = ?,
          updated_at = ?, last_seen_at = ?
        WHERE id = ?
      `).bind(
        normalizedValue,
        input.reason,
        normalizedValue === "WITHDRAWN" ? now : null,
        normalizedValue === "DEFERRED" ? now : null,
        now,
        now,
        input.ipoId,
      )
    : database.prepare(`UPDATE ipos SET ${rule.column} = ?, updated_at = ?, last_seen_at = ? WHERE id = ?`)
      .bind(normalizedValue, now, now, input.ipoId);

  await database.batch([
    database.prepare(`
      UPDATE ipo_field_sources
      SET is_selected = 0, superseded_at = ?
      WHERE ipo_id = ? AND field_name = ? AND is_selected = 1 AND superseded_at IS NULL
    `).bind(now, input.ipoId, input.field),
    database.prepare(`
      INSERT INTO ipo_field_sources (
        id, ipo_id, field_name, value_type, source_id, raw_value,
        normalized_value, priority, confidence, observed_at, fetched_at,
        verified_at, is_selected, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, ?, ?, ?, 1, ?)
    `).bind(
      fieldSourceId,
      input.ipoId,
      input.field,
      rule.valueType,
      sourceId,
      normalizedValue,
      normalizedValue,
      SOURCE_PRIORITY.manualVerified,
      now,
      now,
      now,
      now,
    ),
    database.prepare(`
      UPDATE manual_overrides
      SET revoked_at = ?, revoked_by = ?, revocation_reason = ?
      WHERE entity_type = 'ipo' AND entity_id = ? AND field_name = ? AND revoked_at IS NULL
    `).bind(now, createdBy, "Superseded by a newer verified admin override.", input.ipoId, input.field),
    database.prepare(`
      INSERT INTO manual_overrides (
        id, entity_type, entity_id, ipo_id, field_name, value_type,
        old_value, new_value, reason, created_by, source_id, field_source_id,
        verified_by, verified_at, applied_at
      ) VALUES (?, 'ipo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      overrideId,
      input.ipoId,
      input.ipoId,
      input.field,
      rule.valueType,
      oldValue,
      normalizedValue,
      input.reason,
      createdBy,
      sourceId,
      fieldSourceId,
      createdBy,
      now,
      now,
    ),
    canonicalUpdate,
  ]);

  return { ok: true, message: `${input.field} was updated with verified manual provenance.`, actionId: overrideId };
}

async function recordGmp(
  input: Extract<AdminDataControlInput, { action: "record_gmp" }>,
  user: ChatGPTUser,
): Promise<AdminActionResult> {
  const observedAt = new Date(input.observedAt).getTime();
  if (observedAt > Date.now() + 5 * 60_000 || observedAt < Date.UTC(2000, 0, 1)) {
    throw new AdminActionError(400, "INVALID_OBSERVED_AT", "The observation time is outside the accepted range.");
  }
  const database = getD1();
  const ipo = await database.prepare("SELECT id FROM ipos WHERE id = ? LIMIT 1")
    .bind(input.ipoId)
    .first<{ id: string }>();
  if (!ipo) throw new AdminActionError(404, "IPO_NOT_FOUND", "The selected IPO no longer exists.");

  const latest = await database.prepare(`
    SELECT gmp FROM ipo_gmp_history
    WHERE ipo_id = ? AND is_valid = 1
    ORDER BY observed_at DESC LIMIT 1
  `).bind(input.ipoId).first<{ gmp: string }>();
  const sourceId = await ensureManualSource();
  const now = Date.now();
  const gmpId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const createdBy = actor(user);

  await database.batch([
    database.prepare(`
      INSERT INTO ipo_gmp_history (
        id, ipo_id, source_id, source_record_key, gmp, upper_price_band,
        source_url, observed_at, fetched_at, is_valid, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      gmpId,
      input.ipoId,
      sourceId,
      `manual:${gmpId}`,
      input.gmp,
      input.upperPriceBand ?? null,
      input.sourceUrl ?? null,
      observedAt,
      now,
      now,
    ),
    database.prepare(`
      INSERT INTO manual_overrides (
        id, entity_type, entity_id, ipo_id, field_name, value_type,
        old_value, new_value, reason, created_by, source_id,
        verified_by, verified_at, applied_at
      ) VALUES (?, 'ipo_gmp_history', ?, ?, 'gmp', 'DECIMAL', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      auditId,
      gmpId,
      input.ipoId,
      latest?.gmp ?? null,
      input.gmp,
      input.reason,
      createdBy,
      sourceId,
      createdBy,
      now,
      now,
    ),
  ]);

  return { ok: true, message: "The timestamped GMP observation was recorded as a manual, unofficial entry.", actionId: gmpId };
}

async function correctAlias(
  input: Extract<AdminDataControlInput, { action: "correct_alias" }>,
  user: ChatGPTUser,
): Promise<AdminActionResult> {
  const database = getD1();
  const alias = await database.prepare(`
    SELECT id, company_id AS companyId, source_id AS sourceId,
      external_name AS externalName, normalized_name AS normalizedName
    FROM company_aliases WHERE id = ? LIMIT 1
  `).bind(input.aliasId).first<{
    id: string;
    companyId: string;
    sourceId: string;
    externalName: string;
    normalizedName: string;
  }>();
  if (!alias) throw new AdminActionError(404, "ALIAS_NOT_FOUND", "The selected alias no longer exists.");

  const companyId = input.companyId ?? alias.companyId;
  if (input.companyId) {
    const company = await database.prepare("SELECT id FROM companies WHERE id = ? LIMIT 1")
      .bind(input.companyId)
      .first<{ id: string }>();
    if (!company) throw new AdminActionError(404, "COMPANY_NOT_FOUND", "The target company no longer exists.");
  }
  const normalizedName = normalizeAlias(input.externalName);
  if (normalizedName.length < 2) {
    throw new AdminActionError(400, "INVALID_ALIAS", "The alias has no usable normalized company name.");
  }

  const now = Date.now();
  const auditId = crypto.randomUUID();
  const createdBy = actor(user);
  const oldValue = JSON.stringify({
    companyId: alias.companyId,
    externalName: alias.externalName,
    normalizedName: alias.normalizedName,
  });
  const newValue = JSON.stringify({ companyId, externalName: input.externalName, normalizedName });

  await database.batch([
    database.prepare(`
      UPDATE manual_overrides
      SET revoked_at = ?, revoked_by = ?, revocation_reason = ?
      WHERE entity_type = 'company_alias' AND entity_id = ?
        AND field_name = 'alias_correction' AND revoked_at IS NULL
    `).bind(now, createdBy, "Superseded by a newer verified alias correction.", input.aliasId),
    database.prepare(`
      INSERT INTO manual_overrides (
        id, entity_type, entity_id, field_name, value_type, old_value,
        new_value, reason, created_by, source_id, verified_by, verified_at, applied_at
      ) VALUES (?, 'company_alias', ?, 'alias_correction', 'JSON', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      auditId,
      input.aliasId,
      oldValue,
      newValue,
      input.reason,
      createdBy,
      alias.sourceId,
      createdBy,
      now,
      now,
    ),
    database.prepare(`
      UPDATE company_aliases
      SET company_id = ?, external_name = ?, normalized_name = ?,
        is_verified = 1, updated_at = ?
      WHERE id = ?
    `).bind(companyId, input.externalName, normalizedName, now, input.aliasId),
  ]);

  return { ok: true, message: "The alias mapping was corrected, verified, and audited.", actionId: auditId };
}

async function verifyField(
  input: Extract<AdminDataControlInput, { action: "verify_field" }>,
  user: ChatGPTUser,
): Promise<AdminActionResult> {
  const database = getD1();
  const fieldSource = await database.prepare(`
    SELECT id, source_id AS sourceId, normalized_value AS normalizedValue,
      verified_at AS verifiedAt
    FROM ipo_field_sources
    WHERE ipo_id = ? AND field_name = ? AND is_selected = 1 AND superseded_at IS NULL
    LIMIT 1
  `).bind(input.ipoId, input.fieldName).first<{
    id: string;
    sourceId: string;
    normalizedValue: string | null;
    verifiedAt: number | null;
  }>();
  if (!fieldSource) {
    throw new AdminActionError(404, "FIELD_SOURCE_NOT_FOUND", "No selected provenance record exists for that IPO field.");
  }

  const now = Date.now();
  const auditId = crypto.randomUUID();
  const createdBy = actor(user);
  const auditField = `verification:${input.fieldName}`;

  await database.batch([
    database.prepare("UPDATE ipo_field_sources SET verified_at = ? WHERE id = ?")
      .bind(now, fieldSource.id),
    database.prepare(`
      UPDATE manual_overrides
      SET revoked_at = ?, revoked_by = ?, revocation_reason = ?
      WHERE entity_type = 'ipo_field_source' AND entity_id = ?
        AND field_name = ? AND revoked_at IS NULL
    `).bind(now, createdBy, "Superseded by a newer verification decision.", fieldSource.id, auditField),
    database.prepare(`
      INSERT INTO manual_overrides (
        id, entity_type, entity_id, ipo_id, field_name, value_type,
        old_value, new_value, reason, created_by, source_id, field_source_id,
        verified_by, verified_at, applied_at
      ) VALUES (?, 'ipo_field_source', ?, ?, ?, 'TIMESTAMP', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      auditId,
      fieldSource.id,
      input.ipoId,
      auditField,
      fieldSource.verifiedAt === null ? null : new Date(fieldSource.verifiedAt).toISOString(),
      new Date(now).toISOString(),
      input.reason,
      createdBy,
      fieldSource.sourceId,
      fieldSource.id,
      createdBy,
      now,
      now,
    ),
  ]);

  return { ok: true, message: `${input.fieldName} was marked verified and the decision was audited.`, actionId: auditId };
}

async function requestResync(
  input: Extract<AdminDataControlInput, { action: "resync" }>,
  requestUrl: string,
): Promise<AdminActionResult> {
  const secret = getRuntimeConfig().CRON_SECRET;
  if (!secret) {
    throw new AdminActionError(503, "SYNC_DISABLED", "Resync is disabled until the internal scheduler secret is configured.");
  }
  const target = new URL("/api/internal/sync", requestUrl);
  const payload = input.job === "all"
    ? { only: adminSyncJobs.filter((job): job is Exclude<AdminSyncJob, "all"> => job !== "all") }
    : { job: input.job };
  const response = await fetch(target, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "x-artha-internal-call": "admin-data-control",
    },
    body: JSON.stringify(payload),
    redirect: "manual",
  });
  if (!response.ok) {
    throw new AdminActionError(502, "SYNC_REJECTED", `The internal sync service rejected the request (HTTP ${response.status}).`);
  }
  return { ok: true, message: input.job === "all" ? "All configured sync jobs completed or were individually reported." : `${input.job} completed or was accepted by the internal sync service.` };
}

export async function executeAdminDataControl(
  input: AdminDataControlInput,
  user: ChatGPTUser,
  requestUrl: string,
): Promise<AdminActionResult> {
  try {
    if (input.action === "resync") return await requestResync(input, requestUrl);
    if (input.action === "override_ipo_field") return await overrideIpoField(input, user);
    if (input.action === "record_gmp") return await recordGmp(input, user);
    if (input.action === "correct_alias") return await correctAlias(input, user);
    return await verifyField(input, user);
  } catch (error) {
    if (error instanceof AdminActionError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/UNIQUE constraint failed/i.test(message)) {
      throw new AdminActionError(409, "CONFLICT", "That verified value conflicts with an existing record.");
    }
    if (/CHECK constraint failed|FOREIGN KEY constraint failed/i.test(message)) {
      throw new AdminActionError(409, "CONSTRAINT_REJECTED", "The change conflicts with an existing data constraint.");
    }
    throw error;
  }
}
