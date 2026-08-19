import { getRuntimeConfig, hasConfiguredProvider } from "@/lib/env";
import { IngestionStore } from "@/lib/ingestion/store";
import { ThirdPartyIPOProvider, type StructuredIPOProvider } from "@/lib/providers/ipo";

import { executeJob, ingestRecords, type IngestionTrigger, type JobResult } from "./runtime";
import { structuredIPOSource } from "./sources";
import { isTargetEligible } from "./sync-eligibility";

export type SyncSubscriptionsOptions = {
  trigger: IngestionTrigger;
  store?: IngestionStore;
  provider?: Pick<StructuredIPOProvider, "getSubscription">;
  force?: boolean;
};

export async function syncSubscriptions(options: SyncSubscriptionsOptions): Promise<JobResult> {
  const config = getRuntimeConfig();
  const store = options.store ?? new IngestionStore();
  return executeJob({
    store,
    source: structuredIPOSource(config),
    job: "sync-subscriptions",
    trigger: options.trigger,
    intervalMinutes: config.SUBSCRIPTION_SYNC_INTERVAL_MINUTES,
    force: options.force,
    enabled: Boolean(options.provider) || hasConfiguredProvider("ipo"),
    disabledReason: "Subscription provider is not configured",
  }, async (tools) => {
    const provider = options.provider ?? new ThirdPartyIPOProvider();
    const targets = (await store.listIPOTargets()).filter((target) => isTargetEligible("subscriptions", target));
    for (const target of targets.slice(0, 50)) {
      try {
        const records = await provider.getSubscription(target.identifier);
        await ingestRecords(
          records,
          tools,
          "store-subscription-snapshot",
          (record) => record.externalId,
          (record) => store.ingestSubscription(tools.context, record),
        );
      } catch (error) {
        await tools.recordError("fetch-subscription", error, { entityType: "IPO", entityId: target.ipoId, rawIdentifier: target.identifier });
      }
    }
    return { eligibleTargets: targets.length, processedTargets: Math.min(targets.length, 50) };
  });
}

