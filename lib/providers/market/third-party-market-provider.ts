import { getRuntimeConfig } from "@/lib/env";
import type { NormalizedMarketIndex } from "@/lib/ingestion/schemas";

import { endpointWithIdentifier, ExternalJSONClient } from "../shared/external-json";
import { normalizeHistoricalPrices, normalizeMarketIndices, normalizeMarketStatus } from "./normalizers";
import type { NormalizedHistoricalPrice, NormalizedMarketStatus } from "./schemas";
import type {
  ExternalMarketDataProvider,
  HistoricalPriceQuery,
  ThirdPartyMarketEndpoints,
  ThirdPartyMarketProviderOptions,
} from "./types";

const defaultEndpoints: ThirdPartyMarketEndpoints = {
  quote: "/quotes/:identifier",
  indices: "/indices",
  history: "/prices/:identifier/history",
  status: "/market/status",
};

export class ThirdPartyMarketProvider implements ExternalMarketDataProvider {
  private readonly client: ExternalJSONClient;
  private readonly endpoints: ThirdPartyMarketEndpoints;

  constructor(options: ThirdPartyMarketProviderOptions = {}) {
    const runtime = getRuntimeConfig();
    this.client = new ExternalJSONClient({
      providerName: options.providerName ?? runtime.MARKET_DATA_PROVIDER ?? "Market Data API",
      baseUrl: options.baseUrl ?? runtime.MARKET_API_BASE_URL ?? "",
      apiKey: options.apiKey ?? runtime.MARKET_API_KEY,
      apiKeyHeader: options.apiKeyHeader ?? runtime.MARKET_API_KEY_HEADER,
      apiKeyPrefix: options.apiKeyPrefix
        ?? runtime.MARKET_API_KEY_PREFIX
        ?? (runtime.MARKET_API_KEY_HEADER && runtime.MARKET_API_KEY_HEADER.toLowerCase() !== "authorization" ? "" : undefined),
      attempts: options.attempts,
      timeoutMs: options.timeoutMs,
    }, { requireApiKey: true });
    this.endpoints = { ...defaultEndpoints, ...options.endpoints };
  }

  async getQuote(symbol: string): Promise<NormalizedMarketIndex | null> {
    const payload = await this.client.get(endpointWithIdentifier(this.endpoints.quote, symbol), "get-quote");
    return normalizeMarketIndices(payload, symbol)[0] ?? null;
  }

  async getIndices(): Promise<NormalizedMarketIndex[]> {
    const payload = await this.client.get(this.endpoints.indices, "get-indices");
    return normalizeMarketIndices(payload);
  }

  async getHistoricalPrices(symbol: string, query: HistoricalPriceQuery = {}): Promise<NormalizedHistoricalPrice[]> {
    const payload = await this.client.get(endpointWithIdentifier(this.endpoints.history, symbol), "get-historical-prices", { query });
    return normalizeHistoricalPrices(payload, symbol);
  }

  async getMarketStatus(): Promise<NormalizedMarketStatus | null> {
    const payload = await this.client.get(this.endpoints.status, "get-market-status");
    return normalizeMarketStatus(payload);
  }
}
