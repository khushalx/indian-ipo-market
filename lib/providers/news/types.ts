import type { NormalizedNewsRecord } from "@/lib/ingestion/schemas";

import type { FeedValidators } from "./conditional-feed";

export interface ExternalNewsProvider {
  getNews(filters?: { category?: string; limit?: number }): Promise<NormalizedNewsRecord[]>;
}

export type ThirdPartyNewsProviderOptions = {
  providerName?: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  apiKeyPrefix?: string;
  attempts?: number;
  timeoutMs?: number;
  endpoint?: string;
};

export type RSSNewsProviderOptions = {
  providerName?: string;
  feedUrls?: string[];
  attempts?: number;
  timeoutMs?: number;
  maxItemsPerFeed?: number;
};

export type ConditionalRecords<T> = {
  records: T[];
  notModified: boolean;
  validators: FeedValidators;
  fetchedAt: string;
};
