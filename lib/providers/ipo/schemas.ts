import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp");
const nonNegative = z.number().finite().nonnegative();

export const normalizedListingDataSchema = z.object({
  externalId: z.string().min(1),
  ipoExternalId: z.string().min(1),
  listingDate: isoDate.optional(),
  issuePrice: nonNegative.optional(),
  listingOpen: nonNegative.optional(),
  listingHigh: nonNegative.optional(),
  listingLow: nonNegative.optional(),
  listingClose: nonNegative.optional(),
  currentPrice: nonNegative.optional(),
  sourceUrl: z.string().url().optional(),
  updatedAt: isoDateTime.optional(),
});

export type NormalizedListingData = z.infer<typeof normalizedListingDataSchema>;

export const normalizedIPOCalendarEntrySchema = z.object({
  externalId: z.string().min(1),
  ipoExternalId: z.string().min(1),
  companyName: z.string().trim().min(2),
  eventType: z.enum(["open", "close", "allotment", "refund", "demat", "listing", "drhp", "rhp", "other"]),
  date: isoDate,
  sourceUrl: z.string().url().optional(),
  updatedAt: isoDateTime.optional(),
});

export type NormalizedIPOCalendarEntry = z.infer<typeof normalizedIPOCalendarEntrySchema>;
