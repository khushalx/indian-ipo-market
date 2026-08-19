import { getRuntimeConfig } from "@/lib/env";
import type { NormalizedGMPRecord } from "@/lib/ingestion/schemas";

import { normalizeGMPRecords } from "../ipo/normalizers";
import { endpointWithIdentifier, ExternalJSONClient } from "../shared/external-json";
import type { ExternalGMPProvider, ThirdPartyGMPEndpoints, ThirdPartyGMPProviderOptions } from "./types";

const defaultEndpoints: ThirdPartyGMPEndpoints = {
  current: "/gmp/:identifier",
  history: "/gmp/:identifier/history",
};

/** GMP is deliberately isolated from official IPO facts and always remains third-party data. */
export class ThirdPartyGMPProvider implements ExternalGMPProvider {
  private readonly client: ExternalJSONClient;
  private readonly endpoints: ThirdPartyGMPEndpoints;

  constructor(options: ThirdPartyGMPProviderOptions = {}) {
    const runtime = getRuntimeConfig();
    this.client = new ExternalJSONClient({
      providerName: options.providerName ?? runtime.GMP_DATA_PROVIDER ?? "GMP API",
      baseUrl: options.baseUrl ?? runtime.GMP_API_BASE_URL ?? "",
      apiKey: options.apiKey ?? runtime.GMP_API_KEY,
      apiKeyHeader: options.apiKeyHeader ?? runtime.GMP_API_KEY_HEADER,
      apiKeyPrefix: options.apiKeyPrefix
        ?? runtime.GMP_API_KEY_PREFIX
        ?? (runtime.GMP_API_KEY_HEADER && runtime.GMP_API_KEY_HEADER.toLowerCase() !== "authorization" ? "" : undefined),
      attempts: options.attempts,
      timeoutMs: options.timeoutMs,
    }, { requireApiKey: true });
    this.endpoints = { ...defaultEndpoints, ...options.endpoints };
  }

  async getGMP(identifier: string): Promise<NormalizedGMPRecord | null> {
    const payload = await this.client.get(endpointWithIdentifier(this.endpoints.current, identifier), "get-gmp");
    return normalizeGMPRecords(payload, this.client.providerName, identifier).at(-1) ?? null;
  }

  async getGMPHistory(identifier: string): Promise<NormalizedGMPRecord[]> {
    const payload = await this.client.get(endpointWithIdentifier(this.endpoints.history, identifier), "get-gmp-history");
    return normalizeGMPRecords(payload, this.client.providerName, identifier);
  }
}
