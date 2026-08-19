import { getRuntimeConfig } from "@/lib/env";
import type { NormalizedNewsRecord } from "@/lib/ingestion/schemas";

import { ExternalJSONClient } from "../shared/external-json";
import { normalizeNewsRecords } from "./normalizers";
import type { ExternalNewsProvider, ThirdPartyNewsProviderOptions } from "./types";

export class ThirdPartyNewsProvider implements ExternalNewsProvider {
  private readonly client: ExternalJSONClient;
  private readonly endpoint: string;

  constructor(options: ThirdPartyNewsProviderOptions = {}) {
    const runtime = getRuntimeConfig();
    this.client = new ExternalJSONClient({
      providerName: options.providerName ?? runtime.NEWS_DATA_PROVIDER ?? "News API",
      baseUrl: options.baseUrl ?? runtime.NEWS_API_BASE_URL ?? "",
      apiKey: options.apiKey ?? runtime.NEWS_API_KEY,
      apiKeyHeader: options.apiKeyHeader ?? runtime.NEWS_API_KEY_HEADER,
      apiKeyPrefix: options.apiKeyPrefix
        ?? runtime.NEWS_API_KEY_PREFIX
        ?? (runtime.NEWS_API_KEY_HEADER && runtime.NEWS_API_KEY_HEADER.toLowerCase() !== "authorization" ? "" : undefined),
      attempts: options.attempts,
      timeoutMs: options.timeoutMs,
    });
    this.endpoint = options.endpoint ?? "/news";
  }

  async getNews(filters: { category?: string; limit?: number } = {}): Promise<NormalizedNewsRecord[]> {
    const payload = await this.client.get(this.endpoint, "get-news", { query: filters });
    const records = normalizeNewsRecords(payload, this.client.providerName);
    return filters.limit ? records.slice(0, filters.limit) : records;
  }
}
