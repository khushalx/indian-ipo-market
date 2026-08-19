import { marketIndexSchema, type NormalizedMarketIndex } from "@/lib/ingestion/schemas";
import { finiteNumber } from "@/lib/ingestion/normalize";

import {
  dateTimeValue,
  extractRecords,
  firstValue,
  stringValue,
  urlValue,
} from "../shared/external-json";
import {
  normalizedHistoricalPriceSchema,
  normalizedMarketStatusSchema,
  type NormalizedHistoricalPrice,
  type NormalizedMarketStatus,
} from "./schemas";

function numberFrom(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  return finiteNumber(firstValue(record, ...keys));
}

function timelinessValue(value: unknown): NormalizedMarketIndex["timeliness"] {
  const normalized = stringValue(value)?.toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "REALTIME" || normalized === "REAL_TIME") return "REALTIME";
  if (normalized === "DELAYED") return "DELAYED";
  if (normalized === "EOD" || normalized === "END_OF_DAY") return "EOD";
  return "UNKNOWN";
}

export function normalizeMarketIndices(payload: unknown, fallbackSymbol?: string): NormalizedMarketIndex[] {
  return extractRecords(payload, ["indices", "quotes", "quote"])
    .map((record) => {
      const symbol = stringValue(firstValue(record, "symbol", "ticker", "code", "indexSymbol", "index_symbol")) ?? fallbackSymbol;
      const name = stringValue(firstValue(record, "name", "displayName", "display_name", "indexName", "index_name")) ?? symbol;
      const value = numberFrom(record, "value", "price", "lastPrice", "last_price", "ltp", "close");
      const change = numberFrom(record, "change", "netChange", "net_change", "priceChange", "price_change");
      const changePercent = numberFrom(record, "changePercent", "change_percent", "percentChange", "percent_change", "pChange", "p_change");
      const asOf = dateTimeValue(firstValue(record, "asOf", "as_of", "timestamp", "updatedAt", "updated_at", "lastUpdated", "last_updated"));
      if (!symbol || !name || value == null || change == null || changePercent == null || !asOf) return null;
      const parsed = marketIndexSchema.safeParse({
        symbol,
        name,
        value,
        change,
        changePercent,
        asOf,
        timeliness: timelinessValue(firstValue(record, "timeliness", "delayType", "delay_type", "feedType", "feed_type")),
        delayMinutes: numberFrom(record, "delayMinutes", "delay_minutes", "delay"),
        sourceUrl: urlValue(firstValue(record, "sourceUrl", "source_url", "url", "link")),
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((record): record is NormalizedMarketIndex => Boolean(record));
}

export function normalizeHistoricalPrices(payload: unknown, symbol: string): NormalizedHistoricalPrice[] {
  return extractRecords(payload, ["prices", "history", "candles", "ohlc"])
    .map((record) => {
      const parsed = normalizedHistoricalPriceSchema.safeParse({
        symbol: stringValue(firstValue(record, "symbol", "ticker", "code")) ?? symbol,
        timestamp: dateTimeValue(firstValue(record, "timestamp", "date", "time", "datetime", "asOf")),
        open: numberFrom(record, "open", "o"),
        high: numberFrom(record, "high", "h"),
        low: numberFrom(record, "low", "l"),
        close: numberFrom(record, "close", "c", "price"),
        volume: numberFrom(record, "volume", "v", "totalVolume", "total_volume"),
        sourceUrl: urlValue(firstValue(record, "sourceUrl", "source_url", "url", "link")),
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((record): record is NormalizedHistoricalPrice => Boolean(record))
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = stringValue(value)?.toLowerCase();
  if (["true", "1", "yes", "open"].includes(normalized ?? "")) return true;
  if (["false", "0", "no", "closed"].includes(normalized ?? "")) return false;
  return undefined;
}

function marketState(value: unknown, isOpen?: boolean): NormalizedMarketStatus["state"] {
  const normalized = stringValue(value)?.toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  if (normalized.includes("pre") && normalized.includes("open")) return "pre_open";
  if (normalized.includes("post") || normalized.includes("after")) return "post_close";
  if (normalized === "open" || isOpen === true) return "open";
  if (normalized === "closed" || normalized === "close" || isOpen === false) return "closed";
  return "unknown";
}

export function normalizeMarketStatus(payload: unknown): NormalizedMarketStatus | null {
  const record = extractRecords(payload, ["marketStatus", "market_status", "status"])[0];
  if (!record) return null;
  const explicitOpen = booleanValue(firstValue(record, "isOpen", "is_open", "open"));
  const state = marketState(firstValue(record, "state", "status", "marketState", "market_state"), explicitOpen);
  const parsed = normalizedMarketStatusSchema.safeParse({
    market: stringValue(firstValue(record, "market", "exchange", "name")) ?? "India",
    state,
    isOpen: explicitOpen ?? state === "open",
    asOf: dateTimeValue(firstValue(record, "asOf", "as_of", "timestamp", "updatedAt", "updated_at")),
    nextOpen: dateTimeValue(firstValue(record, "nextOpen", "next_open")),
    nextClose: dateTimeValue(firstValue(record, "nextClose", "next_close")),
    sourceUrl: urlValue(firstValue(record, "sourceUrl", "source_url", "url", "link")),
  });
  return parsed.success ? parsed.data : null;
}
