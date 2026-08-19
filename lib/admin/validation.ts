import { z } from "zod";
import { adminIpoFields, adminSyncJobs } from "./contracts";

const entityId = z.string().trim().min(1).max(128);
const reason = z.string().trim().min(8).max(500);
const exactDecimal = z
  .string()
  .trim()
  .regex(/^-?\d{1,20}(?:\.\d{1,6})?$/, "Use a plain decimal value with up to six decimal places.");
const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Only HTTPS URLs are accepted.");

export const adminDataControlSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resync"),
    job: z.enum(adminSyncJobs),
  }).strict(),
  z.object({
    action: z.literal("override_ipo_field"),
    ipoId: entityId,
    field: z.enum(adminIpoFields),
    value: z.string().trim().max(500).nullable(),
    reason,
  }).strict(),
  z.object({
    action: z.literal("record_gmp"),
    ipoId: entityId,
    gmp: exactDecimal,
    upperPriceBand: exactDecimal.optional(),
    observedAt: z.string().datetime({ offset: true }),
    sourceUrl: httpsUrl.optional(),
    reason,
  }).strict(),
  z.object({
    action: z.literal("correct_alias"),
    aliasId: entityId,
    externalName: z.string().trim().min(2).max(240),
    companyId: entityId.optional(),
    reason,
  }).strict(),
  z.object({
    action: z.literal("verify_field"),
    ipoId: entityId,
    fieldName: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
    reason,
  }).strict(),
]);

export type AdminDataControlInput = z.infer<typeof adminDataControlSchema>;
