import type { RuntimeConfig } from "@/lib/env";
import type { SourceDefinition } from "@/lib/ingestion/store";

function sourceKey(prefix: string, name?: string): string {
  const suffix = name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return suffix ? `${prefix}-${suffix}` : prefix;
}

export const SEBI_SOURCE: SourceDefinition = {
  key: "sebi-public-issues",
  name: "SEBI Public Issue Filings",
  sourceKind: "REGULATOR",
  authorityLevel: "OFFICIAL",
  attributionLabel: "SEBI",
  homepageUrl: "https://www.sebi.gov.in/filings/public-issues.html",
  baseUrl: "https://www.sebi.gov.in",
  termsUrl: "https://www.sebi.gov.in/legal/terms-and-conditions.html",
  isOfficial: true,
};

export const NSE_OFFER_DOCUMENTS_SOURCE: SourceDefinition = {
  key: "nse-offer-documents-rss",
  name: "NSE Offer Documents RSS",
  sourceKind: "EXCHANGE",
  authorityLevel: "OFFICIAL",
  attributionLabel: "NSE",
  homepageUrl: "https://www.nseindia.com/static/rss-feed",
  baseUrl: "https://nsearchives.nseindia.com",
  termsUrl: "https://www.nseindia.com/terms-of-use",
  isOfficial: true,
};

export function structuredIPOSource(config: RuntimeConfig): SourceDefinition {
  const name = config.IPO_DATA_PROVIDER ?? "Structured IPO API";
  return {
    key: sourceKey("ipo-api", config.IPO_DATA_PROVIDER),
    name,
    sourceKind: "STRUCTURED_API",
    authorityLevel: "THIRD_PARTY",
    attributionLabel: name,
    baseUrl: config.IPO_API_BASE_URL,
    isOfficial: false,
  };
}

export function gmpSource(config: RuntimeConfig): SourceDefinition {
  const name = config.GMP_DATA_PROVIDER ?? "GMP API";
  return {
    key: sourceKey("gmp-api", config.GMP_DATA_PROVIDER),
    name,
    sourceKind: "GMP_PROVIDER",
    authorityLevel: "THIRD_PARTY",
    attributionLabel: `${name} · Unofficial GMP`,
    baseUrl: config.GMP_API_BASE_URL,
    isOfficial: false,
  };
}

export function newsSource(config: RuntimeConfig, mode: "api" | "rss"): SourceDefinition {
  const name = mode === "rss" ? "Configured News RSS" : config.NEWS_DATA_PROVIDER ?? "News API";
  return {
    key: sourceKey(mode === "rss" ? "news-rss" : "news-api", mode === "rss" ? undefined : config.NEWS_DATA_PROVIDER),
    name,
    sourceKind: "NEWS_PUBLISHER",
    authorityLevel: "THIRD_PARTY",
    attributionLabel: name,
    baseUrl: mode === "api" ? config.NEWS_API_BASE_URL : undefined,
    isOfficial: false,
    metadata: mode === "rss" ? { configuredFeeds: config.NSE_RSS_URL?.split(",").length ?? 0 } : undefined,
  };
}

export function marketSource(config: RuntimeConfig): SourceDefinition {
  const name = config.MARKET_DATA_PROVIDER ?? "Market Data API";
  return {
    key: sourceKey("market-api", config.MARKET_DATA_PROVIDER),
    name,
    sourceKind: "MARKET_DATA",
    authorityLevel: "THIRD_PARTY",
    attributionLabel: name,
    baseUrl: config.MARKET_API_BASE_URL,
    isOfficial: false,
  };
}

