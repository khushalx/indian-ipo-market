import {
  gmpRecordSchema,
  structuredIPORecordSchema,
  subscriptionSnapshotSchema,
  type NormalizedGMPRecord,
  type NormalizedSubscriptionSnapshot,
  type StructuredIPORecord,
} from "@/lib/ingestion/schemas";
import { finiteNumber, slugifyCompany, stableId } from "@/lib/ingestion/normalize";

import {
  arrayValue,
  dateTimeValue,
  dateValue,
  extractRecords,
  firstValue,
  stringValue,
  urlValue,
} from "../shared/external-json";
import {
  normalizedIPOCalendarEntrySchema,
  normalizedListingDataSchema,
  type NormalizedIPOCalendarEntry,
  type NormalizedListingData,
} from "./schemas";

function boardValue(value: unknown): StructuredIPORecord["board"] {
  const board = stringValue(value)?.toLowerCase().replace(/[\s_-]+/g, " ");
  if (!board) return "unknown";
  if (board.includes("sme") || board.includes("emerge")) return "sme";
  if (board.includes("main")) return "mainboard";
  return "unknown";
}

function exchangeValues(value: unknown): StructuredIPORecord["exchanges"] {
  const raw = arrayValue(value).map(stringValue).filter((item): item is string => Boolean(item));
  const joined = raw.join(" ").toUpperCase().replace(/[-_]/g, " ");
  const values = new Set<StructuredIPORecord["exchanges"][number]>();
  if (/NSE\s*(?:SME|EMERGE)/.test(joined)) values.add("NSE_EMERGE");
  else if (joined.includes("NSE")) values.add("NSE");
  if (/BSE\s*SME/.test(joined)) values.add("BSE_SME");
  else if (joined.includes("BSE")) values.add("BSE");
  return [...values];
}

function normalizedStatus(value: unknown): string | undefined {
  return stringValue(value)?.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function numberFrom(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  return finiteNumber(firstValue(record, ...keys));
}

export function normalizeIPORecord(
  record: Record<string, unknown>,
  providerName: string,
  fallbackIdentifier?: string,
): StructuredIPORecord | null {
  const companyName = stringValue(firstValue(record, "companyName", "company_name", "name", "issuerName", "issuer_name", "title"));
  if (!companyName) return null;
  const externalId = stringValue(firstValue(record, "externalId", "external_id", "ipoExternalId", "ipo_id", "ipoId", "id", "symbol", "slug"))
    ?? fallbackIdentifier
    ?? stableId("provider-ipo", providerName, companyName);

  const parsed = structuredIPORecordSchema.safeParse({
    externalId,
    companyName,
    slug: stringValue(firstValue(record, "slug", "urlSlug", "url_slug")) ?? slugifyCompany(companyName),
    board: boardValue(firstValue(record, "board", "ipoType", "ipo_type", "type", "segment")),
    exchanges: exchangeValues(firstValue(record, "exchanges", "exchange", "exchangeNames", "exchange_names", "platform")),
    status: normalizedStatus(firstValue(record, "status", "ipoStatus", "ipo_status", "stage")),
    faceValue: numberFrom(record, "faceValue", "face_value", "faceValuePerShare", "face_value_per_share"),
    priceBandMin: numberFrom(record, "priceBandMin", "price_band_min", "lowerPrice", "lower_price", "minPrice", "min_price"),
    priceBandMax: numberFrom(record, "priceBandMax", "price_band_max", "upperPrice", "upper_price", "maxPrice", "max_price", "offerPrice"),
    lotSize: numberFrom(record, "lotSize", "lot_size", "marketLot", "market_lot", "minimumOrderQuantity"),
    issueSizeCr: numberFrom(record, "issueSizeCr", "issue_size_cr", "issueSize", "issue_size", "totalIssueSize"),
    freshIssueCr: numberFrom(record, "freshIssueCr", "fresh_issue_cr", "freshIssue", "fresh_issue"),
    offerForSaleCr: numberFrom(record, "offerForSaleCr", "offer_for_sale_cr", "ofsCr", "ofs_cr", "offerForSale"),
    openDate: dateValue(firstValue(record, "openDate", "open_date", "issueOpenDate", "issue_open_date", "biddingStartDate")),
    closeDate: dateValue(firstValue(record, "closeDate", "close_date", "issueCloseDate", "issue_close_date", "biddingEndDate")),
    allotmentDate: dateValue(firstValue(record, "allotmentDate", "allotment_date", "basisOfAllotmentDate", "basis_of_allotment_date")),
    refundDate: dateValue(firstValue(record, "refundDate", "refund_date", "refundInitiationDate", "refund_initiation_date")),
    dematDate: dateValue(firstValue(record, "dematDate", "demat_date", "creditToDematDate", "credit_to_demat_date")),
    listingDate: dateValue(firstValue(record, "listingDate", "listing_date", "listedOn", "listed_on")),
    issuePrice: numberFrom(record, "issuePrice", "issue_price", "finalIssuePrice", "final_issue_price"),
    listingOpen: numberFrom(record, "listingOpen", "listing_open", "listingPrice", "listing_price", "open"),
    listingHigh: numberFrom(record, "listingHigh", "listing_high", "high"),
    listingLow: numberFrom(record, "listingLow", "listing_low", "low"),
    listingClose: numberFrom(record, "listingClose", "listing_close", "close"),
    currentPrice: numberFrom(record, "currentPrice", "current_price", "lastPrice", "last_price", "ltp"),
    sourceUrl: urlValue(firstValue(record, "sourceUrl", "source_url", "url", "link")),
    updatedAt: dateValue(firstValue(record, "updatedAt", "updated_at", "lastUpdated", "last_updated", "asOf")),
    isin: stringValue(firstValue(record, "isin", "ISIN")),
  });
  return parsed.success ? parsed.data : null;
}

export function normalizeIPORecords(payload: unknown, providerName: string, preferredKeys: string[] = ["ipos"]): StructuredIPORecord[] {
  return extractRecords(payload, preferredKeys)
    .map((record) => normalizeIPORecord(record, providerName))
    .filter((record): record is StructuredIPORecord => Boolean(record));
}

export function normalizeSubscriptionRecords(payload: unknown, providerName: string, ipoIdentifier: string): NormalizedSubscriptionSnapshot[] {
  return extractRecords(payload, ["subscription", "subscriptions", "snapshots"])
    .map((record) => {
      const timestamp = dateTimeValue(firstValue(record, "timestamp", "observedAt", "observed_at", "asOf", "as_of", "updatedAt", "updated_at", "date"));
      const total = numberFrom(record, "total", "overall", "totalSubscription", "total_subscription", "totalX", "total_x");
      if (!timestamp || total == null) return null;
      const externalId = stringValue(firstValue(record, "externalId", "external_id", "id"))
        ?? stableId("subscription", providerName, ipoIdentifier, timestamp);
      const parsed = subscriptionSnapshotSchema.safeParse({
        externalId,
        ipoExternalId: stringValue(firstValue(record, "ipoExternalId", "ipo_external_id", "ipoId", "ipo_id")) ?? ipoIdentifier,
        timestamp,
        qib: numberFrom(record, "qib", "qibX", "qib_x"),
        nii: numberFrom(record, "nii", "hni", "niiX", "nii_x"),
        bnii: numberFrom(record, "bnii", "bNii", "bigNii", "bnii_x"),
        snii: numberFrom(record, "snii", "sNii", "smallNii", "snii_x"),
        retail: numberFrom(record, "retail", "rii", "retailX", "retail_x"),
        employee: numberFrom(record, "employee", "employees", "employee_x"),
        shareholder: numberFrom(record, "shareholder", "shareholders", "shareholder_x"),
        total,
        sourceUrl: urlValue(firstValue(record, "sourceUrl", "source_url", "url", "link")),
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((record): record is NormalizedSubscriptionSnapshot => Boolean(record))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

export function normalizeGMPRecords(payload: unknown, providerName: string, ipoIdentifier: string): NormalizedGMPRecord[] {
  return extractRecords(payload, ["gmp", "gmpHistory", "gmp_history", "history"])
    .map((record) => {
      const observedAt = dateTimeValue(firstValue(record, "observedAt", "observed_at", "timestamp", "asOf", "as_of", "updatedAt", "updated_at", "date"));
      const gmp = numberFrom(record, "gmp", "greyMarketPremium", "grey_market_premium", "premium", "value");
      if (!observedAt || gmp == null) return null;
      const parsed = gmpRecordSchema.safeParse({
        externalId: stringValue(firstValue(record, "externalId", "external_id", "id"))
          ?? stableId("gmp", providerName, ipoIdentifier, observedAt, gmp),
        ipoExternalId: stringValue(firstValue(record, "ipoExternalId", "ipo_external_id", "ipoId", "ipo_id")) ?? ipoIdentifier,
        gmp,
        observedAt,
        sourceUrl: urlValue(firstValue(record, "sourceUrl", "source_url", "url", "link")),
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((record): record is NormalizedGMPRecord => Boolean(record))
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}

export function normalizeListingData(payload: unknown, providerName: string, ipoIdentifier: string): NormalizedListingData | null {
  const record = extractRecords(payload, ["listing", "listingData", "listing_data"])[0];
  if (!record) return null;
  const updatedAt = dateTimeValue(firstValue(record, "updatedAt", "updated_at", "lastUpdated", "last_updated", "asOf", "as_of"));
  const parsed = normalizedListingDataSchema.safeParse({
    externalId: stringValue(firstValue(record, "externalId", "external_id", "id"))
      ?? stableId("listing", providerName, ipoIdentifier, updatedAt),
    ipoExternalId: stringValue(firstValue(record, "ipoExternalId", "ipo_external_id", "ipoId", "ipo_id")) ?? ipoIdentifier,
    listingDate: dateValue(firstValue(record, "listingDate", "listing_date", "date")),
    issuePrice: numberFrom(record, "issuePrice", "issue_price"),
    listingOpen: numberFrom(record, "listingOpen", "listing_open", "listingPrice", "listing_price", "open"),
    listingHigh: numberFrom(record, "listingHigh", "listing_high", "high"),
    listingLow: numberFrom(record, "listingLow", "listing_low", "low"),
    listingClose: numberFrom(record, "listingClose", "listing_close", "close"),
    currentPrice: numberFrom(record, "currentPrice", "current_price", "lastPrice", "last_price", "ltp"),
    sourceUrl: urlValue(firstValue(record, "sourceUrl", "source_url", "url", "link")),
    updatedAt,
  });
  return parsed.success ? parsed.data : null;
}

const calendarFields: Array<[NormalizedIPOCalendarEntry["eventType"], string[]]> = [
  ["open", ["openDate", "open_date", "issueOpenDate", "issue_open_date"]],
  ["close", ["closeDate", "close_date", "issueCloseDate", "issue_close_date"]],
  ["allotment", ["allotmentDate", "allotment_date", "basisOfAllotmentDate"]],
  ["refund", ["refundDate", "refund_date", "refundInitiationDate"]],
  ["demat", ["dematDate", "demat_date", "creditToDematDate"]],
  ["listing", ["listingDate", "listing_date"]],
  ["drhp", ["drhpDate", "drhp_date"]],
  ["rhp", ["rhpDate", "rhp_date"]],
];

function calendarType(value: unknown): NormalizedIPOCalendarEntry["eventType"] {
  const type = stringValue(value)?.toLowerCase() ?? "";
  if (type.includes("allot")) return "allotment";
  if (type.includes("refund")) return "refund";
  if (type.includes("demat") || type.includes("credit")) return "demat";
  if (type.includes("listing")) return "listing";
  if (type.includes("close")) return "close";
  if (type.includes("open")) return "open";
  if (type.includes("drhp")) return "drhp";
  if (type.includes("rhp")) return "rhp";
  return "other";
}

export function normalizeCalendarEntries(payload: unknown, providerName: string): NormalizedIPOCalendarEntry[] {
  const normalized: NormalizedIPOCalendarEntry[] = [];
  for (const record of extractRecords(payload, ["calendar", "events", "ipos"])) {
    const companyName = stringValue(firstValue(record, "companyName", "company_name", "name", "issuerName", "title"));
    if (!companyName) continue;
    const ipoExternalId = stringValue(firstValue(record, "ipoExternalId", "ipo_external_id", "ipoId", "ipo_id", "id", "slug"))
      ?? stableId("calendar-ipo", providerName, companyName);
    const sourceUrl = urlValue(firstValue(record, "sourceUrl", "source_url", "url", "link"));
    const updatedAt = dateTimeValue(firstValue(record, "updatedAt", "updated_at", "lastUpdated", "asOf"));
    const explicitDate = dateValue(firstValue(record, "eventDate", "event_date", "date"));
    const eventCandidates: Array<[NormalizedIPOCalendarEntry["eventType"], string]> = [];
    if (explicitDate) eventCandidates.push([calendarType(firstValue(record, "eventType", "event_type", "type")), explicitDate]);
    else {
      for (const [eventType, keys] of calendarFields) {
        const date = dateValue(firstValue(record, ...keys));
        if (date) eventCandidates.push([eventType, date]);
      }
    }

    for (const [eventType, date] of eventCandidates) {
      const parsed = normalizedIPOCalendarEntrySchema.safeParse({
        externalId: stableId("calendar-event", providerName, ipoExternalId, eventType, date),
        ipoExternalId,
        companyName,
        eventType,
        date,
        sourceUrl,
        updatedAt,
      });
      if (parsed.success) normalized.push(parsed.data);
    }
  }
  return normalized.sort((left, right) => left.date.localeCompare(right.date));
}
