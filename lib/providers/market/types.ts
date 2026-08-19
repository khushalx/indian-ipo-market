import type { NormalizedMarketIndex } from "@/lib/ingestion/schemas";

import type { NormalizedHistoricalPrice, NormalizedMarketStatus } from "./schemas";

export type HistoricalPriceQuery = {
  from?: string;
  to?: string;
  interval?: string;
};

export interface ExternalMarketDataProvider {
  getQuote(symbol: string): Promise<NormalizedMarketIndex | null>;
  getIndices(): Promise<NormalizedMarketIndex[]>;
  getHistoricalPrices(symbol: string, query?: HistoricalPriceQuery): Promise<NormalizedHistoricalPrice[]>;
  getMarketStatus(): Promise<NormalizedMarketStatus | null>;
}

export type ThirdPartyMarketEndpoints = {
  quote: string;
  indices: string;
  history: string;
  status: string;
};

export type ThirdPartyMarketProviderOptions = {
  providerName?: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  apiKeyPrefix?: string;
  attempts?: number;
  timeoutMs?: number;
  endpoints?: Partial<ThirdPartyMarketEndpoints>;
};
