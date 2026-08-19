import type { NormalizedGMPRecord } from "@/lib/ingestion/schemas";

export interface ExternalGMPProvider {
  getGMP(identifier: string): Promise<NormalizedGMPRecord | null>;
  getGMPHistory(identifier: string): Promise<NormalizedGMPRecord[]>;
}

export type ThirdPartyGMPEndpoints = {
  current: string;
  history: string;
};

export type ThirdPartyGMPProviderOptions = {
  providerName?: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  apiKeyPrefix?: string;
  attempts?: number;
  timeoutMs?: number;
  endpoints?: Partial<ThirdPartyGMPEndpoints>;
};
