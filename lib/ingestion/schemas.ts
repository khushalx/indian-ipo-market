import { z } from "zod";

const isoDate = z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");
const optionalDate = z.union([isoDate, z.literal(""), z.null()]).optional().transform((value) => value || undefined);
const nonNegative = z.coerce.number().finite().nonnegative();
const positive = z.coerce.number().finite().positive();

export const normalizedFilingSchema = z.object({
  id: z.string().min(1),
  companyName: z.string().trim().min(2),
  normalizedCompanyName: z.string().trim().min(2),
  filingType: z.enum(["drhp", "updated_drhp", "rhp", "abridged_prospectus", "corrigendum", "addendum", "prospectus", "final_offer_document", "other"]),
  filingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  documentUrl: z.string().url(),
  sourceUrl: z.string().url(),
  sourceName: z.enum(["SEBI", "NSE"]),
  sourceType: z.enum(["official", "exchange"]),
  sourceMetadata: z.object({
    feedTitle: z.string().trim().optional(),
    itemTitle: z.string().trim().min(1),
    itemSummary: z.string(),
    guid: z.string().trim().optional(),
    publisher: z.string().trim().optional(),
    categories: z.array(z.string()),
  }).optional(),
  fetchedAt: isoDate,
});

export type NormalizedFiling = z.infer<typeof normalizedFilingSchema>;

export const structuredIPORecordSchema = z.object({
  externalId: z.union([z.string(), z.number()]).transform(String),
  companyName: z.string().trim().min(2),
  slug: z.string().trim().optional(),
  board: z.enum(["mainboard", "sme", "unknown"]).default("unknown"),
  exchanges: z.array(z.enum(["NSE", "BSE", "NSE_EMERGE", "BSE_SME"])).default([]),
  status: z.string().trim().optional(),
  faceValue: positive.optional(),
  priceBandMin: nonNegative.optional(),
  priceBandMax: nonNegative.optional(),
  lotSize: z.coerce.number().int().positive().optional(),
  issueSizeCr: nonNegative.optional(),
  freshIssueCr: nonNegative.optional(),
  offerForSaleCr: nonNegative.optional(),
  openDate: optionalDate,
  closeDate: optionalDate,
  allotmentDate: optionalDate,
  refundDate: optionalDate,
  dematDate: optionalDate,
  listingDate: optionalDate,
  issuePrice: nonNegative.optional(),
  listingOpen: nonNegative.optional(),
  listingHigh: nonNegative.optional(),
  listingLow: nonNegative.optional(),
  listingClose: nonNegative.optional(),
  currentPrice: nonNegative.optional(),
  sourceUrl: z.string().url().optional(),
  updatedAt: optionalDate,
  isin: z.string().trim().optional(),
}).superRefine((record, context) => {
  if (record.priceBandMin != null && record.priceBandMax != null && record.priceBandMin > record.priceBandMax) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["priceBandMin"], message: "Lower price band exceeds upper band" });
  }
  if (record.openDate && record.closeDate && new Date(record.closeDate) < new Date(record.openDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["closeDate"], message: "Close date precedes open date" });
  }
});

export type StructuredIPORecord = z.infer<typeof structuredIPORecordSchema>;

export const gmpRecordSchema = z.object({
  externalId: z.union([z.string(), z.number()]).transform(String),
  ipoExternalId: z.union([z.string(), z.number()]).transform(String),
  gmp: z.coerce.number().finite(),
  observedAt: isoDate,
  sourceUrl: z.string().url().optional(),
});

export type NormalizedGMPRecord = z.infer<typeof gmpRecordSchema>;

export const subscriptionSnapshotSchema = z.object({
  externalId: z.union([z.string(), z.number()]).transform(String),
  ipoExternalId: z.union([z.string(), z.number()]).transform(String),
  timestamp: isoDate,
  qib: nonNegative.optional(),
  nii: nonNegative.optional(),
  bnii: nonNegative.optional(),
  snii: nonNegative.optional(),
  retail: nonNegative.optional(),
  employee: nonNegative.optional(),
  shareholder: nonNegative.optional(),
  total: nonNegative,
  sourceUrl: z.string().url().optional(),
});

export type NormalizedSubscriptionSnapshot = z.infer<typeof subscriptionSnapshotSchema>;

export const marketIndexSchema = z.object({
  symbol: z.string().trim().min(1),
  name: z.string().trim().min(1),
  value: nonNegative,
  change: z.coerce.number().finite(),
  changePercent: z.coerce.number().finite(),
  asOf: isoDate,
  timeliness: z.enum(["REALTIME", "DELAYED", "EOD", "UNKNOWN"]).default("UNKNOWN"),
  delayMinutes: z.coerce.number().int().nonnegative().optional(),
  sourceUrl: z.string().url().optional(),
});

export type NormalizedMarketIndex = z.infer<typeof marketIndexSchema>;

export const newsRecordSchema = z.object({
  externalId: z.union([z.string(), z.number()]).transform(String),
  headline: z.string().trim().min(3),
  summary: z.string().trim().default(""),
  publisher: z.string().trim().min(1),
  publishedAt: isoDate,
  url: z.string().url(),
  imageUrl: z.string().url().optional(),
  category: z.enum(["ipo", "markets", "company", "sebi", "rbi", "economy", "results", "corporate_actions", "regulation", "listing"]).default("markets"),
  relatedCompanies: z.array(z.string()).default([]),
  relatedIPOs: z.array(z.string()).default([]),
});

export type NormalizedNewsRecord = z.infer<typeof newsRecordSchema>;

export function parseArrayItems<T>(schema: z.ZodType<T>, payload: unknown): { valid: T[]; errors: string[] } {
  const candidate = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? ((payload as Record<string, unknown>).data ?? (payload as Record<string, unknown>).items ?? (payload as Record<string, unknown>).ipos ?? [])
      : [];
  if (!Array.isArray(candidate)) return { valid: [], errors: ["Provider response did not contain an array"] };
  const valid: T[] = [];
  const errors: string[] = [];
  candidate.forEach((item, index) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
    else errors.push(`Record ${index}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`);
  });
  return { valid, errors };
}
