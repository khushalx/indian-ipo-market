import { getRuntimeConfig, hasConfiguredProvider } from "@/lib/env";
import { IngestionStore } from "@/lib/ingestion/store";
import { ThirdPartyMarketProvider, type ExternalMarketDataProvider } from "@/lib/providers/market";

import { executeJob, ingestRecords, type IngestionTrigger, type JobResult } from "./runtime";
import { marketSource } from "./sources";

export type SyncMarketIndicesOptions = {
  trigger: IngestionTrigger;
  store?: IngestionStore;
  provider?: Pick<ExternalMarketDataProvider, "getIndices">;
  force?: boolean;
};

export async function syncMarketIndices(options: SyncMarketIndicesOptions): Promise<JobResult> {
  const config = getRuntimeConfig();
  const store = options.store ?? new IngestionStore();
  return executeJob({
    store,
    source: marketSource(config),
    job: "sync-market-indices",
    trigger: options.trigger,
    intervalMinutes: config.MARKET_SYNC_INTERVAL_MINUTES,
    force: options.force,
    enabled: Boolean(options.provider) || hasConfiguredProvider("market"),
    disabledReason: "Licensed market data provider is not configured; quotes remain unavailable",
  }, async (tools) => {
    const provider = options.provider ?? new ThirdPartyMarketProvider();
    const records = await provider.getIndices();
    await ingestRecords(
      records,
      tools,
      "store-market-index",
      (record) => `${record.symbol}:${record.asOf}`,
      (record) => store.ingestMarketIndex(tools.context, record),
    );
    return { quoteLabelsPreserved: true };
  });
}

