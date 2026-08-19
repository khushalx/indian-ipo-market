import { getRuntimeConfig } from "@/lib/env";
import { IngestionStore } from "@/lib/ingestion/store";
import {
  RSSNewsProvider,
  ThirdPartyNewsProvider,
  type ExternalNewsProvider,
} from "@/lib/providers/news";

import { executeJob, ingestRecords, type IngestionTrigger, type JobResult } from "./runtime";
import { newsSource } from "./sources";

export type SyncNewsOptions = {
  trigger: IngestionTrigger;
  store?: IngestionStore;
  provider?: ExternalNewsProvider;
  force?: boolean;
};

export async function syncNews(options: SyncNewsOptions): Promise<JobResult> {
  const config = getRuntimeConfig();
  const store = options.store ?? new IngestionStore();
  const apiConfigured = Boolean(config.NEWS_DATA_PROVIDER && config.NEWS_API_BASE_URL);
  const rssConfigured = Boolean(config.NSE_RSS_URL);
  const mode = apiConfigured ? "api" : "rss";
  return executeJob({
    store,
    source: newsSource(config, mode),
    job: "sync-news",
    trigger: options.trigger,
    intervalMinutes: config.NEWS_SYNC_INTERVAL_MINUTES,
    force: options.force,
    enabled: Boolean(options.provider) || apiConfigured || rssConfigured,
    disabledReason: "News API or permitted RSS feed is not configured",
  }, async (tools) => {
    const provider = options.provider
      ?? (mode === "api" ? new ThirdPartyNewsProvider() : new RSSNewsProvider());
    const records = await provider.getNews({ limit: 250 });
    await ingestRecords(
      records,
      tools,
      "store-news-article",
      (record) => record.externalId,
      (record) => store.ingestNews(tools.context, record),
    );
    return { articleBodiesStored: false, originalPublisherLinks: true };
  });
}

