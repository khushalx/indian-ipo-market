import { getRuntimeConfig, hasConfiguredProvider } from "@/lib/env";
import { IngestionStore } from "@/lib/ingestion/store";
import { ThirdPartyGMPProvider, type ExternalGMPProvider } from "@/lib/providers/gmp";

import { executeJob, ingestRecords, type IngestionTrigger, type JobResult } from "./runtime";
import { isTargetEligible } from "./sync-eligibility";
import { gmpSource } from "./sources";

export type SyncGMPOptions = {
  trigger: IngestionTrigger;
  store?: IngestionStore;
  provider?: ExternalGMPProvider;
  force?: boolean;
};

export async function syncGMP(options: SyncGMPOptions): Promise<JobResult> {
  const config = getRuntimeConfig();
  const store = options.store ?? new IngestionStore();
  return executeJob({
    store,
    source: gmpSource(config),
    job: "sync-gmp",
    trigger: options.trigger,
    intervalMinutes: config.GMP_SYNC_INTERVAL_MINUTES,
    force: options.force,
    enabled: Boolean(options.provider) || hasConfiguredProvider("gmp"),
    disabledReason: "GMP provider is not configured; no unofficial values will be fabricated",
  }, async (tools) => {
    const provider = options.provider ?? new ThirdPartyGMPProvider();
    const targets = (await store.listIPOTargets()).filter((target) => isTargetEligible("gmp", target));
    for (const target of targets.slice(0, 50)) {
      try {
        let records = await provider.getGMPHistory(target.identifier);
        if (records.length === 0) {
          const current = await provider.getGMP(target.identifier);
          records = current ? [current] : [];
        }
        await ingestRecords(
          records,
          tools,
          "store-gmp-observation",
          (record) => record.externalId,
          (record) => store.ingestGMP(tools.context, record),
        );
      } catch (error) {
        await tools.recordError("fetch-gmp", error, { entityType: "IPO", entityId: target.ipoId, rawIdentifier: target.identifier });
      }
    }
    return { eligibleTargets: targets.length, processedTargets: Math.min(targets.length, 50), unofficial: true };
  });
}

