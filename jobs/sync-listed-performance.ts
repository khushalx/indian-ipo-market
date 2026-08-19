import { getRuntimeConfig, hasConfiguredProvider } from "@/lib/env";
import { IngestionStore } from "@/lib/ingestion/store";
import { ThirdPartyIPOProvider, type StructuredIPOProvider } from "@/lib/providers/ipo";

import { executeJob, type IngestionTrigger, type JobResult } from "./runtime";
import { structuredIPOSource } from "./sources";
import { isTargetEligible } from "./sync-eligibility";

export type SyncListedPerformanceOptions = {
  trigger: IngestionTrigger;
  store?: IngestionStore;
  provider?: Pick<StructuredIPOProvider, "getListingData">;
  force?: boolean;
};

export async function syncListedPerformance(options: SyncListedPerformanceOptions): Promise<JobResult> {
  const config = getRuntimeConfig();
  const store = options.store ?? new IngestionStore();
  return executeJob({
    store,
    source: structuredIPOSource(config),
    job: "sync-listed-performance",
    trigger: options.trigger,
    intervalMinutes: config.MARKET_SYNC_INTERVAL_MINUTES,
    force: options.force,
    enabled: Boolean(options.provider) || hasConfiguredProvider("ipo"),
    disabledReason: "Structured listing-performance provider is not configured",
  }, async (tools) => {
    const provider = options.provider ?? new ThirdPartyIPOProvider();
    const targets = (await store.listIPOTargets()).filter((target) => isTargetEligible("listed-performance", target));
    for (const target of targets.slice(0, 50)) {
      try {
        const record = await provider.getListingData(target.identifier);
        tools.counters.fetched += record ? 1 : 0;
        if (record) tools.count(await store.ingestListingPerformance(tools.context, record));
        else tools.counters.skipped += 1;
      } catch (error) {
        await tools.recordError("fetch-listing-performance", error, {
          entityType: "IPO",
          entityId: target.ipoId,
          rawIdentifier: target.identifier,
        });
      }
    }
    return { eligibleTargets: targets.length, processedTargets: Math.min(targets.length, 50) };
  });
}

