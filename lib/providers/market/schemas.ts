import { z } from "zod";

const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp");
const nonNegative = z.number().finite().nonnegative();

export const normalizedHistoricalPriceSchema = z.object({
  symbol: z.string().trim().min(1),
  timestamp,
  open: nonNegative,
  high: nonNegative,
  low: nonNegative,
  close: nonNegative,
  volume: nonNegative.optional(),
  sourceUrl: z.string().url().optional(),
}).superRefine((record, context) => {
  if (record.high < Math.max(record.open, record.close, record.low)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["high"], message: "High is below another OHLC value" });
  }
  if (record.low > Math.min(record.open, record.close, record.high)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["low"], message: "Low is above another OHLC value" });
  }
});

export type NormalizedHistoricalPrice = z.infer<typeof normalizedHistoricalPriceSchema>;

export const normalizedMarketStatusSchema = z.object({
  market: z.string().trim().min(1),
  state: z.enum(["open", "closed", "pre_open", "post_close", "unknown"]),
  isOpen: z.boolean(),
  asOf: timestamp,
  nextOpen: timestamp.optional(),
  nextClose: timestamp.optional(),
  sourceUrl: z.string().url().optional(),
});

export type NormalizedMarketStatus = z.infer<typeof normalizedMarketStatusSchema>;
