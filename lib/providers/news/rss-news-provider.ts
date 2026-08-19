import { z } from "zod";

import { getRuntimeConfig } from "@/lib/env";
import { ProviderError } from "@/lib/ingestion/errors";
import type { NormalizedNewsRecord } from "@/lib/ingestion/schemas";

import { fetchConditionalFeed, type FeedValidators } from "./conditional-feed";
import { normalizeFeedNews } from "./normalizers";
import { parseRSSFeed } from "./rss-parser";
import type { ConditionalRecords, ExternalNewsProvider, RSSNewsProviderOptions } from "./types";

const optionsSchema = z.object({
  providerName: z.string().trim().min(1).default("RSS"),
  feedUrls: z.array(z.string().url()).min(1),
  attempts: z.number().int().min(1).max(3).default(2),
  timeoutMs: z.number().int().min(1_000).max(30_000).default(12_000),
  maxItemsPerFeed: z.number().int().min(1).max(500).default(100),
});

export class RSSNewsProvider implements ExternalNewsProvider {
  private readonly options: z.output<typeof optionsSchema>;

  constructor(options: RSSNewsProviderOptions = {}) {
    const configured = getRuntimeConfig().NSE_RSS_URL?.split(",").map((url) => url.trim()).filter(Boolean) ?? [];
    try {
      this.options = optionsSchema.parse({
        providerName: options.providerName,
        feedUrls: options.feedUrls ?? configured,
        attempts: options.attempts,
        timeoutMs: options.timeoutMs,
        maxItemsPerFeed: options.maxItemsPerFeed,
      });
    } catch {
      throw new ProviderError("RSS feed is not configured", options.providerName ?? "RSS", "configure");
    }
  }

  async getFeed(feedUrl: string, validators: FeedValidators = {}): Promise<ConditionalRecords<NormalizedNewsRecord>> {
    if (!this.options.feedUrls.includes(feedUrl)) {
      throw new ProviderError("RSS feed is not in the configured allowlist", this.options.providerName, "get-feed");
    }
    const response = await fetchConditionalFeed(feedUrl, {
      provider: this.options.providerName,
      operation: "get-feed",
      validators,
      attempts: this.options.attempts,
      timeoutMs: this.options.timeoutMs,
    });
    const records = response.body
      ? normalizeFeedNews(parseRSSFeed(response.body).items, feedUrl, this.options.providerName).slice(0, this.options.maxItemsPerFeed)
      : [];
    return { records, notModified: response.notModified, validators: response.validators, fetchedAt: response.fetchedAt };
  }

  async getNews(filters: { category?: string; limit?: number } = {}): Promise<NormalizedNewsRecord[]> {
    const feeds = await Promise.all(this.options.feedUrls.map((url) => this.getFeed(url)));
    const deduplicated = new Map<string, NormalizedNewsRecord>();
    for (const record of feeds.flatMap((feed) => feed.records)) deduplicated.set(record.url, record);
    const records = [...deduplicated.values()]
      .filter((record) => !filters.category || record.category === filters.category)
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
    return records.slice(0, filters.limit ?? records.length);
  }
}
