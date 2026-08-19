import { env } from "cloudflare:workers";
import { z } from "zod";
import type { DataMode } from "@/types";

const optionalString = z.string().trim().optional().transform((value) => value || undefined);
const positiveMinutes = z.coerce.number().int().positive();

const runtimeSchema = z.object({
  DATA_MODE: z.enum(["live", "mock"]).default("live"),
  IPO_DATA_PROVIDER: optionalString,
  IPO_API_BASE_URL: optionalString,
  IPO_API_KEY: optionalString,
  IPO_API_KEY_HEADER: optionalString,
  IPO_API_KEY_PREFIX: optionalString,
  GMP_DATA_PROVIDER: optionalString,
  GMP_API_BASE_URL: optionalString,
  GMP_API_KEY: optionalString,
  GMP_API_KEY_HEADER: optionalString,
  GMP_API_KEY_PREFIX: optionalString,
  MARKET_DATA_PROVIDER: optionalString,
  MARKET_API_BASE_URL: optionalString,
  MARKET_API_KEY: optionalString,
  MARKET_API_KEY_HEADER: optionalString,
  MARKET_API_KEY_PREFIX: optionalString,
  NEWS_DATA_PROVIDER: optionalString,
  NEWS_API_BASE_URL: optionalString,
  NEWS_API_KEY: optionalString,
  NEWS_API_KEY_HEADER: optionalString,
  NEWS_API_KEY_PREFIX: optionalString,
  NSE_RSS_URL: optionalString,
  NSE_OFFER_DOCUMENTS_RSS_URL: optionalString.default("https://nsearchives.nseindia.com/content/RSS/Offer_Documents.xml"),
  SEBI_HTML_INGESTION_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  CRON_SECRET: optionalString,
  ADMIN_EMAILS: optionalString,
  DATABASE_URL: optionalString,
  SEBI_SYNC_INTERVAL_MINUTES: positiveMinutes.default(180),
  IPO_SYNC_INTERVAL_MINUTES: positiveMinutes.default(60),
  GMP_SYNC_INTERVAL_MINUTES: positiveMinutes.default(30),
  SUBSCRIPTION_SYNC_INTERVAL_MINUTES: positiveMinutes.default(30),
  NEWS_SYNC_INTERVAL_MINUTES: positiveMinutes.default(30),
  NSE_FILINGS_SYNC_INTERVAL_MINUTES: positiveMinutes.default(15),
  MARKET_SYNC_INTERVAL_MINUTES: positiveMinutes.default(15),
  GMP_FRESH_MINUTES: positiveMinutes.default(30),
  GMP_RECENT_MINUTES: positiveMinutes.default(120),
  GMP_DELAYED_MINUTES: positiveMinutes.default(360),
});

export type RuntimeConfig = z.infer<typeof runtimeSchema>;

let cached: RuntimeConfig | undefined;

export function getRuntimeConfig(): RuntimeConfig {
  if (cached) return cached;
  const runtime = env as unknown as Record<string, unknown>;
  cached = runtimeSchema.parse(runtime);
  return cached;
}

export function getDataMode(): DataMode {
  return getRuntimeConfig().DATA_MODE;
}

export function isAdminEmail(email: string): boolean {
  const configured = getRuntimeConfig().ADMIN_EMAILS;
  if (!configured) return false;
  const allowed = configured.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export function hasConfiguredProvider(kind: "ipo" | "gmp" | "market" | "news"): boolean {
  const config = getRuntimeConfig();
  if (kind === "ipo") return Boolean(config.IPO_DATA_PROVIDER && config.IPO_API_BASE_URL && config.IPO_API_KEY);
  if (kind === "gmp") return Boolean(config.GMP_DATA_PROVIDER && config.GMP_API_BASE_URL && config.GMP_API_KEY);
  if (kind === "market") return Boolean(config.MARKET_DATA_PROVIDER && config.MARKET_API_BASE_URL && config.MARKET_API_KEY);
  return Boolean((config.NEWS_DATA_PROVIDER && config.NEWS_API_BASE_URL) || config.NSE_RSS_URL);
}

export function resetRuntimeConfigForTests() {
  cached = undefined;
}
