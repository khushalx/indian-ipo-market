import { getRuntimeConfig, hasConfiguredProvider } from "@/lib/env";
import { SOURCE_PRIORITY } from "@/lib/ingestion/source-priority";
import { IngestionStore } from "@/lib/ingestion/store";
import { ThirdPartyIPOProvider, type StructuredIPOProvider } from "@/lib/providers/ipo";

import { executeJob, ingestRecords, type IngestionTrigger, type JobResult } from "./runtime";
import { structuredIPOSource } from "./sources";

export type SyncIPODetailsOptions = {
  trigger: IngestionTrigger;
  store?: IngestionStore;
  provider?: Pick<StructuredIPOProvider, "getCurrentIPOs" | "getUpcomingIPOs">;
  force?: boolean;
};

export async function syncIPODetails(options: SyncIPODetailsOptions): Promise<JobResult> {
  const config = getRuntimeConfig();
  const store = options.store ?? new IngestionStore();
  return executeJob({
    store,
    source: structuredIPOSource(config),
    job: "sync-ipo-details",
    trigger: options.trigger,
    intervalMinutes: config.IPO_SYNC_INTERVAL_MINUTES,
    force: options.force,
    enabled: Boolean(options.provider) || hasConfiguredProvider("ipo"),
    disabledReason: "Structured IPO provider is not configured",
  }, async (tools) => {
    const provider = options.provider ?? new ThirdPartyIPOProvider();
    const responses = await Promise.allSettled([
      provider.getCurrentIPOs(),
      provider.getUpcomingIPOs(),
    ]);
    const labels = ["get-current-ipos", "get-upcoming-ipos"] as const;
    const records = new Map<string, Awaited<ReturnType<typeof provider.getCurrentIPOs>>[number]>();
    let successfulFeeds = 0;
    for (const [index, response] of responses.entries()) {
      if (response.status === "fulfilled") {
        successfulFeeds += 1;
        for (const record of response.value) records.set(record.externalId, record);
      } else {
        await tools.recordError(labels[index], response.reason);
      }
    }
    if (successfulFeeds === 0) throw responses[0].status === "rejected" ? responses[0].reason : new Error("IPO feeds failed");
    await ingestRecords(
      [...records.values()],
      tools,
      "store-structured-ipo",
      (record) => record.externalId,
      (record) => store.ingestStructuredIPO(tools.context, record, {
        priority: SOURCE_PRIORITY.structuredProvider,
        confidence: 70,
      }),
    );
    return { successfulFeeds, totalFeeds: responses.length };
  });
}

